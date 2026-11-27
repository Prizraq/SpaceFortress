import { describe, expect, it } from 'vitest';
import { BuildingType } from '../models/enum/building-type';
import { BuildingStatus } from '../models/enum/building-status';
import { PlanetService } from '../../shared/services/planet.service';
import * as ColonySimulation from './colony-simulation';
import * as ColonyFinance from './colony-finances';

describe('colony finances', () => {
  it.each([
    [10.73, -24, 27],
    [100, -30, 200],
    [0.01, -30, 1],
    [0, -30, 0],
    [100, 0, null],
    [100, 30, null],
  ])('forecasts depletion only for a deficit: credits=%s balance=%s', (credits, balance, seconds) => {
    expect(ColonyFinance.creditDepletionSeconds(credits, balance)).toBe(seconds);
  });

  it('taxes every resident but not unused housing capacity or assigned workers', () => {
    const colony = ColonySimulation.createColony(new PlanetService().getPlanets()[1]);
    expect(ColonyFinance.colonyFinances(colony)).toEqual({
      income: 0,
      incomeCentsPerStep: 0,
      buildings: [],
      maintenance: 0,
      maintenanceCentsPerStep: 0,
      balance: 0,
    });
    expect(
      ColonyFinance.colonyFinances({
        ...colony,
        stocks: { ...colony.stocks, population: 5, populationCapacity: 25 },
      }),
    ).toEqual({
      income: 30,
      incomeCentsPerStep: 100,
      buildings: [],
      maintenance: 0,
      maintenanceCentsPerStep: 0,
      balance: 30,
    });
  });

  it('projects maintenance by building regardless of operating status, excluding sites and disabled buildings', () => {
    const colony = ColonySimulation.createColony(new PlanetService().getPlanets()[1]);
    const types = [
      BuildingType.Base,
      BuildingType.Housing,
      BuildingType.Water,
      BuildingType.Farm,
      BuildingType.Power,
      BuildingType.Minerals,
      BuildingType.Gas,
    ];
    for (const status of [
      BuildingStatus.Working,
      BuildingStatus.NoWorkers,
      BuildingStatus.NoWater,
      BuildingStatus.NoEnergy,
      BuildingStatus.Depleted,
    ]) {
      const buildings = types.map((type, id) => ({
        id,
        type,
        tile: id,
        startedAt: 0,
        completesAt: 4000,
        completed: true,
        enabled: true,
        status,
      }));
      const forecast = ColonyFinance.colonyFinances({ ...colony, buildings });
      expect(forecast).toEqual({
        income: 0,
        incomeCentsPerStep: 0,
        buildings: buildings.map((building, index) => ({
          buildingId: building.id,
          type: building.type,
          maintenance: [0, 0, 0, 0, 0, 15, 15][index],
          maintenanceCentsPerStep: [0, 0, 0, 0, 0, 50, 50][index],
        })),
        maintenance: 30,
        maintenanceCentsPerStep: 100,
        balance: -30,
      });
      expect(
        ColonyFinance.colonyFinances({
          ...colony,
          buildings: buildings.map((building) => ({ ...building, completed: false })),
        }).maintenance,
      ).toBe(0);
      expect(
        ColonyFinance.colonyFinances({
          ...colony,
          buildings: buildings.map((building) => ({ ...building, enabled: false })),
        }).maintenance,
      ).toBe(0);
    }
  });

  it('sums independent colony forecasts without changing state or returning building-state references', () => {
    const planets = new PlanetService().getPlanets();
    const building = (id: number, type: BuildingType) => ({
      id,
      type,
      tile: id,
      startedAt: 0,
      completesAt: 4000,
      completed: true,
      enabled: true,
      status: BuildingStatus.NoWorkers,
    });
    const initialFirst = ColonySimulation.createColony(planets[0]);
    const initialSecond = ColonySimulation.createColony(planets[1]);
    const first = ColonySimulation.freezeColony({
      ...initialFirst,
      stocks: { ...initialFirst.stocks, population: 5 },
      buildings: [building(1, BuildingType.Water)],
    });
    const second = ColonySimulation.freezeColony({
      ...initialSecond,
      stocks: { ...initialSecond.stocks, population: 1 },
      buildings: [
        building(2, BuildingType.Power),
        building(3, BuildingType.Minerals),
        building(4, BuildingType.Gas),
      ],
    });
    const inputs = Object.freeze([first, second]);
    const original = JSON.stringify(inputs);
    const forecast = ColonyFinance.sessionFinances(inputs);
    expect(forecast).toEqual({
      colonies: [
        {
          planetId: planets[0].id,
          name: planets[0].name,
          income: 30,
          incomeCentsPerStep: 100,
          buildings: [{ buildingId: 1, type: BuildingType.Water, maintenance: 0, maintenanceCentsPerStep: 0 }],
          maintenance: 0,
          maintenanceCentsPerStep: 0,
          balance: 30,
        },
        {
          planetId: planets[1].id,
          name: planets[1].name,
          income: 6,
          incomeCentsPerStep: 20,
          buildings: [
            { buildingId: 2, type: BuildingType.Power, maintenance: 0, maintenanceCentsPerStep: 0 },
            { buildingId: 3, type: BuildingType.Minerals, maintenance: 15, maintenanceCentsPerStep: 50 },
            { buildingId: 4, type: BuildingType.Gas, maintenance: 15, maintenanceCentsPerStep: 50 },
          ],
          maintenance: 30,
          maintenanceCentsPerStep: 100,
          balance: -24,
        },
      ],
      income: 36,
      incomeCentsPerStep: 120,
      maintenance: 30,
      maintenanceCentsPerStep: 100,
      balance: 6,
    });
    const independent = structuredClone(forecast);
    forecast.colonies[0].buildings[0].maintenance = 999;
    expect(JSON.stringify(inputs)).toBe(original);
    expect(ColonyFinance.sessionFinances(inputs)).toEqual(independent);
    expect(ColonyFinance.sessionFinances([])).toEqual({
      colonies: [],
      income: 0,
      incomeCentsPerStep: 0,
      maintenance: 0,
      maintenanceCentsPerStep: 0,
      balance: 0,
    });
  });
});
