import { describe, expect, it } from 'vitest';
import * as SessionMaintenance from './session-maintenance';
import * as ColonySimulation from '../../planet/domain/colony-simulation';
import { BuildingType } from '../../planet/models/enum/building-type';
import { BuildingStatus } from '../../planet/models/enum/building-status';
import { Colony } from '../../planet/models/interface/colony';
import { PlanetService } from '../../shared/services/planet.service';
import * as ColonyFinance from '../../planet/domain/colony-finances';

function fixture(population: number, types: BuildingType[], planetIndex = 1, firstId = 1): Colony {
  const colony = ColonySimulation.createColony(new PlanetService().getPlanets()[planetIndex]);
  return ColonySimulation.freezeColony(
    ColonySimulation.recalculateColonyWorkforce({
      ...colony,
      stocks: { ...colony.stocks, population, populationCapacity: 5 },
      buildings: types.map((type, index) => ({
        id: firstId + index,
        type,
        tile: index,
        startedAt: 0,
        completesAt: 4000,
        completed: true,
        enabled: true,
        disabledByFinance: false,
        status: BuildingStatus.Working,
      })),
    }),
  );
}

describe('session maintenance', () => {
  it('charges exact cents for enabled mines even while idle, and never charges support or disabled mines', () => {
    for (const status of [
      BuildingStatus.NoWorkers,
      BuildingStatus.NoWater,
      BuildingStatus.NoEnergy,
      BuildingStatus.Depleted,
    ]) {
      const source = fixture(5, [BuildingType.Base, BuildingType.Minerals]);
      const colony = ColonySimulation.freezeColony({
        ...source,
        buildings: source.buildings.map((building) => ({ ...building, status })),
      });
      const step = SessionMaintenance.applySessionMaintenance([colony], 10, 73);
      expect(step).toMatchObject({ credits: 11, creditRemainder: 23, maintenanceShortfall: 0 });
      expect(step.colonies[0]).toBe(colony);
    }
    let colony = fixture(5, [BuildingType.Base, BuildingType.Minerals]);
    let balance = { credits: 10, creditRemainder: 73 };
    for (let tick = 1; tick <= 30; tick++) {
      const step = SessionMaintenance.applySessionMaintenance([colony], balance.credits, balance.creditRemainder);
      balance = step;
      colony = ColonySimulation.advanceColony(step.colonies[0], tick * 2000);
    }
    expect(balance).toMatchObject({ credits: 25, creditRemainder: 73 });
    const support = fixture(5, [
      BuildingType.Base,
      BuildingType.Power,
      BuildingType.Water,
      BuildingType.Farm,
    ]);
    expect(SessionMaintenance.applySessionMaintenance([support], 0, 0)).toMatchObject({
      credits: 1,
      creditRemainder: 0,
    });
    const disabled = {
      ...colony,
      buildings: colony.buildings.map((building) =>
        building.type === BuildingType.Minerals ? { ...building, enabled: false } : building,
      ),
    };
    expect(SessionMaintenance.applySessionMaintenance([disabled], 0, 0)).toMatchObject({
      credits: 1,
      creditRemainder: 0,
    });
  });

  it('disables newest mines before spending and production, preserves money, and reallocates workers and energy', () => {
    const source = fixture(3, [
      BuildingType.Base,
      BuildingType.Minerals,
      BuildingType.Gas,
      BuildingType.Power,
      BuildingType.Water,
    ]);
    const before = JSON.stringify(source);
    expect(source.stocks.energy).toBe(-5);
    const step = SessionMaintenance.applySessionMaintenance([source], 0, 0);
    expect(step).toMatchObject({ credits: 0, creditRemainder: 10, maintenanceShortfall: 0 });
    expect(step.colonies[0].buildings[2]).toMatchObject({
      enabled: false,
      disabledByFinance: true,
      status: BuildingStatus.FinanciallyDisabled,
    });
    expect(step.colonies[0].buildings[3].enabled).toBe(true);
    expect(step.colonies[0].stocks.energy).toBe(0);
    const produced = ColonySimulation.advanceColony(step.colonies[0], 6000);
    expect(produced.stocks.gas).toBe(source.stocks.gas);
    expect(produced.stocks.minerals).toBe(source.stocks.minerals + 5.5);
    expect(JSON.stringify(source)).toBe(before);
    const unfunded = fixture(0, [BuildingType.Base, BuildingType.Minerals, BuildingType.Gas]);
    const stopped = SessionMaintenance.applySessionMaintenance([unfunded], 0, 30);
    expect(stopped).toMatchObject({ credits: 0, creditRemainder: 30, maintenanceShortfall: 0 });
    let colony = stopped.colonies[0];
    for (let tick = 1; tick <= 10; tick++) {
      const next = SessionMaintenance.applySessionMaintenance([colony], 100, 0);
      colony = ColonySimulation.advanceColony(next.colonies[0], tick * 2000);
    }
    expect(
      colony.buildings
        .slice(1)
        .every((building) => !building.enabled && building.disabledByFinance),
    ).toBe(true);
    expect(colony.deposits).toEqual(unfunded.deposits);
  });

  it('uses one shared budget and global ids, not colony or building collection order', () => {
    const first = fixture(1, [BuildingType.Base, BuildingType.Minerals], 0, 1);
    const second = fixture(1, [BuildingType.Base, BuildingType.Gas], 1, 10);
    const normalize = (colonies: readonly Colony[]) =>
      [...colonies]
        .sort((a, b) => a.planet.id.localeCompare(b.planet.id))
        .map((colony) => ({
          ...colony,
          buildings: [...colony.buildings].sort((a, b) => a.id - b.id),
        }));
    const regular = SessionMaintenance.applySessionMaintenance([first, second], 0, 20);
    const reversed = SessionMaintenance.applySessionMaintenance(
      [
        { ...second, buildings: [...second.buildings].reverse() },
        { ...first, buildings: [...first.buildings].reverse() },
      ],
      0,
      20,
    );
    expect(regular).toMatchObject({ credits: 0, creditRemainder: 10 });
    expect(normalize(regular.colonies)).toEqual(normalize(reversed.colonies));
    expect(reversed.credits).toBe(regular.credits);
    expect(reversed.creditRemainder).toBe(regular.creditRemainder);
    expect(regular.colonies[1].buildings[1].disabledByFinance).toBe(true);
    const funded = SessionMaintenance.applySessionMaintenance([fixture(5, [BuildingType.Base], 0), second], 0, 0);
    expect(funded.colonies[1].buildings[1].enabled).toBe(true);
  });

  it('does not charge construction on its completion step, and starts charging the next step', () => {
    const source = fixture(5, [BuildingType.Base, BuildingType.Minerals]);
    const site = {
      ...source,
      buildings: source.buildings.map((building) =>
        building.type === BuildingType.Minerals ? { ...building, completed: false } : building,
      ),
    };
    const completion = SessionMaintenance.applySessionMaintenance([site], 0, 0);
    expect(completion.credits).toBe(1);
    const completed = ColonySimulation.advanceColony(completion.colonies[0], 4000);
    expect(completed.buildings[1].completed).toBe(true);
    const next = SessionMaintenance.applySessionMaintenance(
      [completed],
      completion.credits,
      completion.creditRemainder,
    );
    expect(next).toMatchObject({ credits: 1, creditRemainder: 50 });
  });

  it.each([
    [false, 120, 66000, 123],
    [true, 100, 64000, 102],
  ])(
    'reaches the growth scenario target with mine=%s without a supply or credit dead end',
    (mine, target, expectedTime, expectedCredits) => {
      const types = [
        BuildingType.Base,
        BuildingType.Power,
        BuildingType.Water,
        BuildingType.Farm,
        BuildingType.Housing,
      ];
      if (mine) types.push(BuildingType.Minerals);
      const source = fixture(5, types);
      let colony = {
        ...source,
        stocks: { ...source.stocks, populationCapacity: 25 },
      };
      let ledger = { credits: 0, creditRemainder: 0 };
      let time = 0;
      while (ledger.credits < target) {
        time += 2000;
        const step = SessionMaintenance.applySessionMaintenance([colony], ledger.credits, ledger.creditRemainder);
        ledger = step;
        colony = ColonySimulation.advanceColony(step.colonies[0], time);
      }
      expect(time).toBe(expectedTime);
      expect(ledger).toMatchObject({ credits: expectedCredits, creditRemainder: 0 });
      expect(colony.stocks.population).toBe(25);
      expect(colony.buildings.every((building) => building.enabled)).toBe(true);
    },
  );

  it('charges idle surplus mines until the reserve is exhausted, then shuts down only what is necessary', () => {
    const source = fixture(25, [
      BuildingType.Base,
      BuildingType.Power,
      BuildingType.Water,
      BuildingType.Farm,
      BuildingType.Housing,
      ...Array<BuildingType>(4).fill(BuildingType.Power),
      ...Array<BuildingType>(12).fill(BuildingType.Minerals),
    ]);
    let colony = {
      ...source,
      stocks: { ...source.stocks, populationCapacity: 25, water: 0, food: 0 },
    };
    let ledger = { credits: 100, creditRemainder: 0 };
    expect(colony.stocks.energy).toBeCloseTo(-27 - 1 / 3);
    for (let tick = 1; tick <= 100; tick++) {
      const step = SessionMaintenance.applySessionMaintenance([colony], ledger.credits, ledger.creditRemainder);
      ledger = step;
      colony = ColonySimulation.advanceColony(step.colonies[0], tick * 2000);
    }
    expect(ledger).toMatchObject({ credits: 0, creditRemainder: 0 });
    expect(colony.stocks.population).toBe(25);
    expect(colony.buildings.filter((building) => building.enabled).length).toBe(21);
    const step = SessionMaintenance.applySessionMaintenance([colony], ledger.credits, ledger.creditRemainder);
    expect(step).toMatchObject({ credits: 0, creditRemainder: 0 });
    expect(
      step.colonies[0].buildings
        .filter((building) => building.disabledByFinance)
        .map((building) => building.id),
    ).toEqual([20, 21]);
    const next = ColonySimulation.advanceColony(step.colonies[0], 202000);
    expect(next.stocks.population).toBe(25);
    expect(next.stocks.minerals).toBe(colony.stocks.minerals);
    for (const [disabledFromId, ticks, expectedCredits] of [
      [19, 200, 100],
      [16, 50, 100],
    ]) {
      let recovering: Colony = ColonySimulation.recalculateColonyWorkforce({
        ...next,
        buildings: next.buildings.map((building) =>
          building.id >= disabledFromId ? { ...building, enabled: false } : building,
        ),
      });
      let funds = { credits: 0, creditRemainder: 0 };
      for (let tick = 1; tick <= ticks; tick++) {
        const recovered = SessionMaintenance.applySessionMaintenance(
          [recovering],
          funds.credits,
          funds.creditRemainder,
        );
        funds = recovered;
        recovering = ColonySimulation.advanceColony(recovered.colonies[0], 202000 + tick * 2000);
      }
      expect(funds).toMatchObject({ credits: expectedCredits, creditRemainder: 0 });
      expect(recovering.stocks.population).toBe(25);
    }
  });

  it.each([0, 1, 2])(
    'recovers five residents and taxes from zero population and stocks on planet %s',
    (planetIndex) => {
      const source = fixture(0, [BuildingType.Base], planetIndex);
      let colony = {
        ...source,
        stocks: { ...source.stocks, minerals: 0, water: 0, food: 0, gas: 0 },
      };
      let ledger = { credits: 0, creditRemainder: 0 };
      for (let tick = 1; tick <= 5; tick++) {
        const step = SessionMaintenance.applySessionMaintenance([colony], ledger.credits, ledger.creditRemainder);
        ledger = step;
        colony = ColonySimulation.advanceColony(step.colonies[0], tick * 2000);
      }
      expect(colony.stocks.population).toBe(5);
      expect(ledger).toMatchObject({ credits: 2, creditRemainder: 0 });
      for (let tick = 6; tick <= 103; tick++) {
        const step = SessionMaintenance.applySessionMaintenance([colony], ledger.credits, ledger.creditRemainder);
        ledger = step;
        colony = ColonySimulation.advanceColony(step.colonies[0], tick * 2000);
      }
      expect(ledger).toMatchObject({ credits: 100, creditRemainder: 0 });
      expect(colony.stocks.population).toBe(5);
      expect(colony.stocks.minerals).toBe(0);
      expect(colony.stocks.gas).toBe(0);
    },
  );

  it('recovers after population loss and idle mine shutdowns without charging or disabling power', () => {
    const source = fixture(25, [
      BuildingType.Base,
      BuildingType.Power,
      BuildingType.Water,
      BuildingType.Farm,
      BuildingType.Housing,
      BuildingType.Power,
      BuildingType.Minerals,
      BuildingType.Gas,
    ]);
    let colony: Colony = {
      ...source,
      stocks: { ...source.stocks, populationCapacity: 25, water: 0, food: 0 },
      buildings: source.buildings.map((building) =>
        building.type === BuildingType.Farm ? { ...building, enabled: false } : building,
      ),
    };
    let ledger = { credits: 0, creditRemainder: 0 };
    for (let tick = 1; tick <= 20; tick++) {
      const step = SessionMaintenance.applySessionMaintenance([colony], ledger.credits, ledger.creditRemainder);
      ledger = step;
      colony = ColonySimulation.advanceColony(step.colonies[0], tick * 2000);
    }
    expect(colony.stocks.population).toBe(5);
    expect(ledger).toMatchObject({ credits: 42, creditRemainder: 0 });
    expect(ColonyFinance.colonyFinances(colony)).toMatchObject({ income: 30, maintenance: 30, balance: 0 });
    expect(colony.buildings.find((building) => building.type === BuildingType.Power)).toMatchObject(
      {
        enabled: true,
        disabledByFinance: false,
      },
    );
    const crisis = {
      ...colony,
      stocks: { ...colony.stocks, population: 1, food: 100, water: 160 },
      buildings: colony.buildings.map((building) =>
        building.type === BuildingType.Farm ? { ...building, enabled: true } : building,
      ),
    };
    const shutdown = SessionMaintenance.applySessionMaintenance([crisis], 0, 0);
    expect(
      shutdown.colonies[0].buildings.filter((building) => building.disabledByFinance),
    ).toHaveLength(2);
    colony = ColonySimulation.advanceColony(shutdown.colonies[0], 42000);
    ledger = shutdown;
    for (let tick = 2; tick <= 24; tick++) {
      const step = SessionMaintenance.applySessionMaintenance([colony], ledger.credits, ledger.creditRemainder);
      ledger = step;
      colony = ColonySimulation.advanceColony(step.colonies[0], 40000 + tick * 2000);
    }
    expect(colony.stocks.population).toBe(25);
    expect(ledger).toMatchObject({ credits: 60, creditRemainder: 0 });
    expect(ColonyFinance.colonyFinances(colony)).toMatchObject({ income: 150, maintenance: 0, balance: 150 });
    expect(colony.buildings.find((building) => building.type === BuildingType.Power)?.enabled).toBe(
      true,
    );
    expect(colony.buildings.filter((building) => building.disabledByFinance)).toHaveLength(2);
  });

  it('restores positive shared cash flow after shutdowns and manual cuts in several loss-making colonies', () => {
    let colonies = [0, 1, 2].map((planetIndex) => {
      const source = fixture(
        5,
        [BuildingType.Base, BuildingType.Minerals, BuildingType.Gas, BuildingType.Minerals],
        planetIndex,
        planetIndex * 10 + 1,
      );
      return { ...source, stocks: { ...source.stocks, water: 0, food: 0 } };
    });
    expect(ColonyFinance.sessionFinances(colonies)).toMatchObject({ income: 90, maintenance: 135, balance: -45 });
    const shutdown = SessionMaintenance.applySessionMaintenance(colonies, 0, 0);
    expect(
      shutdown.colonies.flatMap((colony) =>
        colony.buildings
          .filter((building) => building.disabledByFinance)
          .map((building) => building.id),
      ),
    ).toEqual([22, 23, 24]);
    expect(shutdown).toMatchObject({ credits: 0, creditRemainder: 0 });
    expect(ColonyFinance.sessionFinances(shutdown.colonies).balance).toBe(0);
    colonies = shutdown.colonies.map((colony) => ({
      ...colony,
      buildings: colony.buildings.map((building) =>
        building.type === BuildingType.Base ? building : { ...building, enabled: false },
      ),
    }));
    let ledger = { credits: 0, creditRemainder: 0 };
    for (let tick = 1; tick <= 34; tick++) {
      const step = SessionMaintenance.applySessionMaintenance(colonies, ledger.credits, ledger.creditRemainder);
      ledger = step;
      colonies = step.colonies.map((colony) => ColonySimulation.advanceColony(colony, tick * 2000));
    }
    expect(ledger).toMatchObject({ credits: 102, creditRemainder: 0 });
    expect(colonies.map((colony) => colony.stocks.population)).toEqual([5, 5, 5]);
  });
});
