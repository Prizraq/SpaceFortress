import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILDINGS_BY_TYPE } from '../../planet/domain/building-catalogue';
import { buildProblem } from '../../planet/domain/building-rules';
import { allocateWorkers, colonyWorkforce } from '../../planet/domain/colony-workforce';
import { demolitionProblem } from '../../planet/domain/demolition-rules';
import {
  advanceColony,
  createColony,
  foodEconomy,
  freezeColony,
  recalculateColonyWorkforce,
  waterEconomy,
} from '../../planet/domain/colony-simulation';
import { BuildError } from '../../planet/models/enum/build-error';
import { BuildingStatus } from '../../planet/models/enum/building-status';
import { BuildingOperationError } from '../../planet/models/enum/building-operation-error';
import { BuildingType } from '../../planet/models/enum/building-type';
import { DemolitionError } from '../../planet/models/enum/demolition-error';
import { Colony } from '../../planet/models/interface/colony';
import { GameSave } from '../../game-save/models/interface/game-save';
import { GameSessionService } from './game-session.service';
import { PlanetService } from '../../shared/services/planet.service';

describe('GameSessionService and simulation', () => {
  let service: GameSessionService;
  let delayedTime = 0;
  const delayCallbacks = (milliseconds: number) => {
    delayedTime += milliseconds;
  };
  const planets = () => new PlanetService().getPlanets();
  const completedColony = (...types: BuildingType[]) => {
    const colony = createColony(planets()[1]);
    return {
      ...colony,
      stocks: { ...colony.stocks, population: 5, populationCapacity: 25 },
      buildings: types.map((type, id) => ({
        id,
        type,
        tile: id,
        startedAt: 0,
        completesAt: 0,
        completed: true,
        enabled: true,
        status: BuildingStatus.Working,
      })),
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    delayedTime = 0;
    const now = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => now() + delayedTime);
    TestBed.configureTestingModule({});
    service = TestBed.inject(GameSessionService);
    service.setSystemPaused(false);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps freezing separate from recalculating staffing-derived energy and statuses', () => {
    const initial = completedColony(BuildingType.Base, BuildingType.Power, BuildingType.Water);
    const source: Colony = {
      ...initial,
      stocks: { ...initial.stocks, energy: 999 },
      buildings: initial.buildings.map((building) => ({
        ...building,
        status: BuildingStatus.NoWorkers,
      })),
    };
    const frozen = freezeColony(source);
    expect(frozen).toEqual(source);
    expect(frozen.stocks.energy).toBe(999);
    expect(frozen.buildings[1].status).toBe(BuildingStatus.NoWorkers);

    const recalculated = recalculateColonyWorkforce(frozen);
    expect(recalculated.stocks).toEqual({ ...source.stocks, energy: 21 });
    expect(
      recalculated.buildings.every((building) => building.status === BuildingStatus.Working),
    ).toBe(true);
    expect(frozen).toEqual(source);
  });

  it('starts at zero and shares monotonic time across colonies regardless of calendar changes', () => {
    expect(service.clock()).toBe(0);
    const [first, second] = planets();
    service.openPlanet(first);
    vi.advanceTimersByTime(1000);
    vi.setSystemTime(new Date('2040-01-01'));
    service.openPlanet(second);
    expect(service.clock()).toBe(1000);
    vi.setSystemTime(new Date('2000-01-01'));
    service.build(first, BuildingType.Base, 0);
    service.build(second, BuildingType.Base, 0);
    for (const colony of Object.values(service.colonies())) {
      expect(colony.buildings[0]).toMatchObject({ startedAt: 1000, completesAt: 5000 });
    }
    service.openPlanet(first);
    expect(service.clock()).toBe(1000);
    vi.advanceTimersByTime(5000);
    expect(service.clock()).toBe(6000);
    expect(Object.values(service.colonies()).every((colony) => colony.buildings[0].completed)).toBe(
      true,
    );
  });

  it('starts under a system stop and discards all time before startup finishes', () => {
    TestBed.resetTestingModule();
    service = TestBed.inject(GameSessionService);
    expect(service.systemPaused()).toBe(true);
    vi.advanceTimersByTime(60000);
    service.setManualPaused(true);
    service.setManualPaused(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.clock()).toBe(0);
    expect(service.colonies()).toEqual({});
    service.setSystemPaused(false);
    vi.advanceTimersByTime(1500);
    service.tick();
    expect(service.createSave(new Date())).toMatchObject({
      gameTime: 1500,
      lastProductionTick: 0,
    });
  });

  it.each([false, true])('resets the entire session while preserving system stop %s', (stopped) => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    service.setManualPaused(true);
    service.setSystemPaused(stopped);
    const oldPlanets = service.planets();
    const oldColonies = service.colonies();
    delayCallbacks(60000);
    service.resetSession();
    expect(service.systemPaused()).toBe(stopped);
    expect(service.planets()).not.toBe(oldPlanets);
    expect(service.colonies()).not.toBe(oldColonies);
    expect(Object.isFrozen(service.planets()[1].resourses)).toBe(true);
    expect(service.createSave(new Date())).toMatchObject({
      credits: 2000,
      colonies: [],
      gameTime: 0,
      lastProductionTick: 0,
      nextBuildingId: 1,
      manualPaused: false,
    });
    expect(oldColonies[planet.id].buildings).toHaveLength(2);
    service.setSystemPaused(false);
    service.openPlanet(service.planets()[1]);
    service.build(service.planets()[1], BuildingType.Base, 0);
    expect(service.colonies()[planet.id].buildings[0].id).toBe(1);
    delayCallbacks(1500);
    service.tick();
    expect(service.clock()).toBe(1500);
    expect(service.colonies()[planet.id].buildings[0].completed).toBe(false);
  });

  it('does not produce or move construction deadlines when the calendar changes', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(6000);
    service.build(planet, BuildingType.Power, 2);
    const snapshot = service.colonies()[planet.id];
    const time = service.clock();
    for (const date of ['2040-01-01', '2000-01-01']) {
      vi.setSystemTime(new Date(date));
      service.tick();
      expect(service.clock()).toBe(time);
      expect(service.colonies()[planet.id]).toBe(snapshot);
    }
    vi.advanceTimersByTime(1999);
    service.tick();
    expect(service.colonies()[planet.id]).toBe(snapshot);
    vi.advanceTimersByTime(1);
    const next = service.colonies()[planet.id];
    expect(next.stocks.minerals).toBe(snapshot.stocks.minerals + 11);
    expect(next.deposits.minerals).toBe(snapshot.deposits.minerals - 11);
    expect(next.buildings[2]).toMatchObject({
      startedAt: time,
      completesAt: time + 4000,
      completed: false,
    });
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].buildings[2].completed).toBe(true);
  });

  it('completes unaligned construction only at a production boundary, without early output', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    vi.advanceTimersByTime(1000);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(3999);
    service.tick();
    expect(service.colonies()[planet.id].buildings[0].completed).toBe(false);
    vi.advanceTimersByTime(1);
    service.tick();
    expect(service.clock()).toBe(5000);
    expect(service.colonies()[planet.id].buildings[0].completed).toBe(false);
    vi.advanceTimersByTime(1000);
    const completed = service.colonies()[planet.id];
    expect(completed.buildings[0].completed).toBe(true);
    expect(completed.stocks.water).toBe(140);
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].stocks.water).toBe(140);
    expect(service.colonies()[planet.id].stocks.population).toBe(5);
  });

  it.each([0, 1000])(
    'starts extraction one production step after completion with placement offset %s ms',
    (offset) => {
      const planet = planets()[1];
      service.openPlanet(planet);
      service.build(planet, BuildingType.Base, 0);
      vi.advanceTimersByTime(4000 + offset);
      expect(service.build(planet, BuildingType.Minerals, 1)).toBeNull();
      const initial = service.colonies()[planet.id];
      const startedAt = 4000 + offset;
      const completesAt = startedAt + 6000;
      expect(initial.buildings[1]).toMatchObject({ startedAt, completesAt, completed: false });

      vi.advanceTimersByTime(5999);
      service.tick();
      expect(service.colonies()[planet.id].buildings[1].completed).toBe(false);
      expect(service.colonies()[planet.id].stocks.minerals).toBe(initial.stocks.minerals);
      vi.advanceTimersByTime(1);
      service.tick();
      expect(service.colonies()[planet.id].buildings[1].completed).toBe(offset === 0);

      const completionStep = Math.ceil(completesAt / 2000) * 2000;
      vi.advanceTimersByTime(completionStep - completesAt);
      service.tick();
      const completed = service.colonies()[planet.id];
      expect(completed.buildings[1].completed).toBe(true);
      expect(completed.stocks.minerals).toBe(initial.stocks.minerals);
      expect(completed.deposits.minerals).toBe(initial.deposits.minerals);
      vi.advanceTimersByTime(1999);
      service.tick();
      expect(service.colonies()[planet.id]).toBe(completed);
      vi.advanceTimersByTime(1);
      const produced = service.colonies()[planet.id];
      expect(produced.stocks.minerals).toBe(initial.stocks.minerals + 11);
      expect(produced.deposits.minerals).toBe(initial.deposits.minerals - 11);
      service.tick();
      expect(service.colonies()[planet.id]).toBe(produced);
    },
  );

  it('freezes manual pause without losing a partial step or catching up paused time', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(1000);
    service.setManualPaused(true);
    const snapshot = service.colonies();
    expect(service.clock()).toBe(1000);
    vi.advanceTimersByTime(60000);
    service.openPlanet(planet);
    service.tick();
    expect(service.clock()).toBe(1000);
    expect(service.colonies()).toBe(snapshot);
    service.setManualPaused(false);
    vi.advanceTimersByTime(999);
    service.tick();
    expect(service.clock()).toBe(1999);
    expect(service.colonies()[planet.id]).toBe(snapshot[planet.id]);
    vi.advanceTimersByTime(1);
    service.tick();
    expect(service.clock()).toBe(2000);
    expect(service.colonies()[planet.id]).not.toBe(snapshot[planet.id]);
    service.tick();
    expect(service.clock()).toBe(2000);
  });

  it('accounts for active time before system stop and never replays time stopped without callbacks', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(6000);
    service.build(planet, BuildingType.Power, 2);
    const before = service.colonies()[planet.id];
    delayCallbacks(3000);
    service.setSystemPaused(true);
    expect(service.clock()).toBe(13000);
    const stopped = service.colonies()[planet.id];
    expect(stopped.stocks.minerals).toBe(before.stocks.minerals + 11);
    expect(stopped.buildings[2].completed).toBe(false);
    const credits = service.credits();
    vi.advanceTimersByTime(60000);
    expect(service.clock()).toBe(13000);
    expect(service.colonies()[planet.id]).toBe(stopped);
    delayCallbacks(60000);
    service.setSystemPaused(false);
    expect(service.clock()).toBe(13000);
    expect(service.colonies()[planet.id]).toBe(stopped);
    expect(service.credits()).toBe(credits);
    vi.advanceTimersByTime(999);
    service.tick();
    expect(service.colonies()[planet.id]).toBe(stopped);
    vi.advanceTimersByTime(1);
    service.tick();
    const resumed = service.colonies()[planet.id];
    expect(service.clock()).toBe(14000);
    expect(resumed.buildings[2].completed).toBe(true);
    expect(resumed.stocks.minerals).toBe(stopped.stocks.minerals + 11);
    service.tick();
    expect(service.colonies()[planet.id]).toBe(resumed);
  });

  it.each(['manual', 'hidden', 'system'])(
    'keeps all pause reasons independent until the last %s reason is cleared',
    (last) => {
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      const setPaused = (reason: string, paused: boolean) => {
        if (reason === 'manual') service.setManualPaused(paused);
        else if (reason === 'system') service.setSystemPaused(paused);
        else {
          visibility.mockReturnValue(paused ? 'hidden' : 'visible');
          document.dispatchEvent(new Event('visibilitychange'));
        }
      };
      const reasons = ['manual', 'hidden', 'system'];
      delayCallbacks(1000);
      for (const reason of reasons) setPaused(reason, true);
      expect(service.clock()).toBe(1000);
      expect(service.manualPaused()).toBe(true);
      expect(service.tabHidden()).toBe(true);
      expect(service.systemPaused()).toBe(true);
      for (const reason of reasons.filter((reason) => reason !== last)) {
        delayCallbacks(60000);
        setPaused(reason, false);
        expect(service.paused()).toBe(true);
        expect(service.clock()).toBe(1000);
      }
      delayCallbacks(60000);
      setPaused(last, false);
      expect(service.paused()).toBe(false);
      expect(service.clock()).toBe(1000);
      vi.advanceTimersByTime(1000);
      service.tick();
      expect(service.clock()).toBe(2000);
    },
  );

  it.each([false, true])('excludes hidden time and preserves manual pause: %s', (manual) => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.advanceTimersByTime(1000);
    service.setManualPaused(manual);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.paused()).toBe(true);
    expect(service.tabHidden()).toBe(true);
    vi.advanceTimersByTime(60000);
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(service.paused()).toBe(manual);
    expect(service.manualPaused()).toBe(manual);
    expect(service.clock()).toBe(1000);
    service.setManualPaused(false);
    vi.advanceTimersByTime(1000);
    service.tick();
    expect(service.clock()).toBe(2000);
  });

  it('starts frozen in a hidden tab and cannot resume manually until it becomes visible', () => {
    TestBed.resetTestingModule();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    service = TestBed.inject(GameSessionService);
    service.setSystemPaused(false);
    vi.advanceTimersByTime(60000);
    service.setManualPaused(true);
    service.setManualPaused(false);
    expect(service.clock()).toBe(0);
    expect(service.paused()).toBe(true);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2000);
    expect(service.clock()).toBe(2000);
  });

  it.each(['manual', 'hidden', 'system'])(
    'rejects all building mutations during %s pause without side effects',
    (reason) => {
      const planet = planets()[1];
      service.openPlanet(planet);
      service.build(planet, BuildingType.Base, 0);
      vi.advanceTimersByTime(4000);
      service.build(planet, BuildingType.Minerals, 1);
      service.build(planet, BuildingType.Gas, 2);
      vi.advanceTimersByTime(6000);
      const [base, mine, gas] = service.colonies()[planet.id].buildings;
      service.toggleBuilding(planet, gas.id);
      service.build(planet, BuildingType.Power, 3);
      const construction = service.colonies()[planet.id].buildings[3];
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      if (reason === 'manual') service.setManualPaused(true);
      else if (reason === 'system') service.setSystemPaused(true);
      else {
        visibility.mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      }
      const snapshot = service.colonies();
      const credits = service.credits();
      expect(service.buildProblem(planet, BuildingType.Housing)).toBe(BuildError.Paused);
      expect(service.build(planet, BuildingType.Housing, 4)).toBe(BuildError.Paused);
      expect(service.demolitionProblem(planet, mine.id)).toBe(DemolitionError.Paused);
      for (const building of [base, mine, construction]) {
        expect(service.demolish(planet, building.id)).toBe(DemolitionError.Paused);
      }
      for (const building of [mine, gas]) {
        expect(service.toggleBuilding(planet, building.id)).toBe(BuildingOperationError.Paused);
      }
      expect(service.colonies()).toBe(snapshot);
      expect(service.credits()).toBe(credits);
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      service.setManualPaused(false);
      service.setSystemPaused(false);
      expect(service.build(planet, BuildingType.Power, 4)).toBeNull();
      expect(service.colonies()[planet.id].buildings[4].id).toBe(construction.id + 1);
    },
  );

  it('keeps stocks per stable planet id and credits shared, even after renaming', () => {
    const [first, second] = planets();
    service.openPlanet(first);
    service.build(first, BuildingType.Base, 0);
    service.openPlanet({ ...second, name: first.name });
    expect(service.colonies()[second.id].stocks.minerals).toBe(240);
    expect(service.credits()).toBe(1800);
    service.openPlanet({ ...first, name: 'Renamed' });
    expect(Object.keys(service.colonies())).toHaveLength(2);
    expect(service.colonies()[first.id].buildings).toHaveLength(1);
    expect(service.colonies()[first.id].stocks.minerals).toBe(180);
  });

  it('rejects duplicate bases and invalid or occupied tiles without charging', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    expect(service.build(planet, BuildingType.Power, 0)).toBe('base-required');
    expect(service.build(planet, BuildingType.Base, -1)).toBe('invalid-tile');
    expect(service.build(planet, BuildingType.Base, 81)).toBe('invalid-tile');
    expect(service.build(planet, BuildingType.Base, 0.5)).toBe('invalid-tile');
    expect(service.build(planet, BuildingType.Base, 0)).toBeNull();
    expect(service.build(planet, BuildingType.Base, 1)).toBe('base-exists');
    vi.advanceTimersByTime(4000);
    expect(service.build(planet, BuildingType.Power, 0)).toBe('occupied');
    expect(service.credits()).toBe(1800);
    expect(
      service.colonies()[planet.id].buildings.filter((building) => building.completed),
    ).toHaveLength(1);
  });

  it('produces minerals and gas every two seconds without consuming reserved energy', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    service.build(planet, BuildingType.Gas, 2);
    vi.advanceTimersByTime(6000);
    const before = service.colonies()[planet.id];
    expect(before.stocks.population).toBe(5);
    expect(before.stocks.energy).toBe(0);
    vi.advanceTimersByTime(1999);
    expect(service.colonies()[planet.id]).toBe(before);
    vi.advanceTimersByTime(1);
    const after = service.colonies()[planet.id];
    expect(after.stocks.minerals).toBe(before.stocks.minerals + 11);
    expect(after.stocks.gas).toBe(before.stocks.gas + 5);
    expect(after.stocks.population).toBe(5);
    expect(after.deposits.minerals).toBe(before.deposits.minerals - 11);
    expect(after.deposits.gas).toBe(before.deposits.gas - 5);
    expect(after.stocks.energy).toBe(0);
    vi.advanceTimersByTime(6000);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(after.stocks.minerals + 33);
    expect(service.colonies()[planet.id].stocks.gas).toBe(after.stocks.gas + 15);
    expect(service.colonies()[planet.id].stocks.energy).toBe(0);
  });

  it('checks unaffordable construction through pure rules', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    const colony = service.colonies()[planet.id];
    expect(buildProblem(colony, 0, BUILDINGS_BY_TYPE[BuildingType.Base])).toBe('credits');
    expect(
      buildProblem(
        { ...colony, stocks: { ...colony.stocks, minerals: 0 } },
        2000,
        BUILDINGS_BY_TYPE[BuildingType.Base],
      ),
    ).toBe('minerals');
    expect(service.colonies()[planet.id]).toBe(colony);
  });

  it('caps extraction at remaining deposits and stops when depleted', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    service.build(planet, BuildingType.Gas, 2);
    vi.advanceTimersByTime(6000);
    const snapshot = service.colonies()[planet.id];
    const depleted = advanceColony(
      { ...snapshot, deposits: { minerals: 3, gas: 2 } },
      service.clock(),
    );
    expect(depleted.stocks.minerals).toBe(snapshot.stocks.minerals + 3);
    expect(depleted.stocks.gas).toBe(snapshot.stocks.gas + 2);
    expect(depleted.deposits).toEqual({ minerals: 0, gas: 0 });
    expect(advanceColony(depleted, service.clock()).buildings[1].status).toBe('depleted');
    expect(service.colonies()[planet.id]).toBe(snapshot);
  });

  it.each([
    { index: 0, power: 25, water: 1 },
    { index: 1, power: 16, water: 12 },
    { index: 2, power: 10, water: 8 },
  ])('scales stations by orbit and water abundance on planet $index', ({ index, power, water }) => {
    const planet = planets()[index];
    expect(service.yieldFor(planet, service.definition(BuildingType.Water))).toBe(water);
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    expect(service.colonies()[planet.id].stocks.energy).toBe(10);
    service.build(planet, BuildingType.Water, 1);
    service.build(planet, BuildingType.Power, 2);
    vi.advanceTimersByTime(3999);
    expect(service.colonies()[planet.id].stocks.energy).toBe(5);
    vi.advanceTimersByTime(1);
    const before = service.colonies()[planet.id].stocks;
    expect(before.energy).toBe(5 + power);
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].stocks.water).toBe(before.water + water);
    expect(service.colonies()[planet.id].stocks.energy).toBe(5 + power);
    vi.advanceTimersByTime(20000);
    expect(service.colonies()[planet.id].stocks.energy).toBe(5 + power);
    const [base, waterStation, powerStation] = service.colonies()[planet.id].buildings;
    expect(service.demolish(planet, waterStation.id)).toBeNull();
    expect(service.demolish(planet, powerStation.id)).toBeNull();
    expect(service.colonies()[planet.id].stocks.energy).toBe(10);
    expect(service.colonies()[planet.id].buildings).toEqual([base]);
  });

  it.each([0, 1, 2])('checks demolition against actual solar capacity on planet %s', (index) => {
    const planet = planets()[index];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Power, 1);
    vi.advanceTimersByTime(4000);
    const powerId = service.colonies()[planet.id].buildings[1].id;
    service.build(planet, BuildingType.Housing, 2);
    expect(service.demolitionProblem(planet, powerId)).toBeNull();
    service.build(planet, BuildingType.Water, 3);
    expect(service.demolish(planet, powerId)).toBe(DemolitionError.Energy);
    const waterId = service.colonies()[planet.id].buildings[3].id;
    expect(service.demolish(planet, waterId)).toBeNull();
    expect(service.demolish(planet, powerId)).toBeNull();
    expect(service.colonies()[planet.id].stocks.energy).toBe(0);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid solar distance %s', (distanceFromSun) => {
    const planet = { ...planets()[1], distanceFromSun };
    expect(() => service.definition(BuildingType.Power).energyGainFor(planet)).toThrow(RangeError);
  });

  it('matches regular and delayed simulation including completions', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    const initial = service.colonies()[planet.id];
    const start = service.clock();
    let expected = initial;
    for (let step = 1; step <= 12; step++) expected = advanceColony(expected, start + step * 2000);
    delayCallbacks(24000);
    service.tick();
    expect(service.colonies()[planet.id]).toEqual(expected);
    expect(expected.stocks.population).toBe(5);
    expect(expected.stocks.energy).toBe(10);
    service.tick();
    expect(service.colonies()[planet.id]).toEqual(expected);
    delayCallbacks(1000);
    service.tick();
    expect(service.colonies()[planet.id]).toEqual(expected);
  });

  it('catches up before placement without producing retroactively', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    const before = service.colonies()[planet.id];
    const definition = service.definition(BuildingType.Minerals);
    delayCallbacks(20000);
    expect(service.build(planet, BuildingType.Minerals, 1)).toBeNull();
    const minerals = before.stocks.minerals - definition.costMinerals;
    expect(service.clock()).toBe(24000);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(minerals);
    expect(service.colonies()[planet.id].buildings[1]).toMatchObject({
      startedAt: 24000,
      completesAt: 30000,
      completed: false,
    });
    delayCallbacks(6000);
    service.tick();
    expect(service.colonies()[planet.id].buildings[1].completed).toBe(true);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(minerals);
    delayCallbacks(2000);
    service.tick();
    const produced = service.colonies()[planet.id];
    expect(produced.stocks.minerals).toBe(minerals + 11);
    service.tick();
    expect(service.colonies()[planet.id]).toBe(produced);
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(minerals + 22);
  });

  it('shares finite deposits by placement id independently of array order', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    service.build(planet, BuildingType.Minerals, 2);
    vi.advanceTimersByTime(6000);
    const snapshot = service.colonies()[planet.id];
    const results = [snapshot.buildings, [...snapshot.buildings].reverse()].map((buildings) =>
      advanceColony(
        {
          ...snapshot,
          buildings,
          deposits: { minerals: 15, gas: 0 },
        },
        service.clock(),
      ),
    );
    expect(results[0].stocks).toEqual(results[1].stocks);
    expect(results[0].stocks.energy).toBe(0);
    expect(results[0].stocks.minerals).toBe(snapshot.stocks.minerals + 15);
    expect(results[0].deposits.minerals).toBe(0);
  });

  it('reserves energy immediately and rejects overbooking without charging resources', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    expect(service.colonies()[planet.id].stocks.energy).toBe(10);
    expect(service.build(planet, BuildingType.Water, 1)).toBeNull();
    expect(service.colonies()[planet.id].stocks.energy).toBe(5);
    expect(service.build(planet, BuildingType.Minerals, 2)).toBeNull();
    const snapshot = service.colonies()[planet.id];
    const credits = service.credits();
    expect(snapshot.stocks.energy).toBe(0);
    expect(service.build(planet, BuildingType.Gas, 3)).toBe('energy');
    expect(service.colonies()[planet.id]).toBe(snapshot);
    expect(service.credits()).toBe(credits);
    expect(service.build(planet, BuildingType.Power, 3)).toBeNull();
    expect(service.build(planet, BuildingType.Gas, 4)).toBe('energy');
    vi.advanceTimersByTime(4000);
    expect(service.colonies()[planet.id].stocks.energy).toBe(16);
    expect(service.build(planet, BuildingType.Gas, 4)).toBeNull();
    expect(service.colonies()[planet.id].stocks.energy).toBe(11);
  });

  it('grows population only up to completed housing capacity and resumes with more housing', () => {
    const initial = completedColony(BuildingType.Base, BuildingType.Housing);
    let colony: Colony = {
      ...initial,
      stocks: { ...initial.stocks, water: 1000, food: 1000, populationCapacity: 5 },
      buildings: initial.buildings.map((building) =>
        building.type === BuildingType.Housing
          ? {
              ...building,
              completed: false,
              status: BuildingStatus.Construction,
              completesAt: 6000,
            }
          : building,
      ),
    };
    colony = advanceColony(colony, 4000);
    expect(colony.stocks.populationCapacity).toBe(5);
    colony = advanceColony(colony, 6000);
    expect(colony.stocks.population).toBe(5);
    expect(colony.stocks.populationCapacity).toBe(25);
    colony = advanceColony(colony, 8000);
    expect(colony.stocks.population).toBe(6);
    for (let now = 10000; now <= 80000; now += 2000) colony = advanceColony(colony, now);
    expect(colony.stocks.population).toBe(25);
    colony = {
      ...colony,
      buildings: [
        ...colony.buildings,
        { ...initial.buildings[1], id: 2, tile: 2, completed: false, completesAt: 86000 },
      ],
    };
    colony = advanceColony(colony, 86000);
    expect(colony.stocks.population).toBe(25);
    expect(colony.stocks.populationCapacity).toBe(45);
    for (let now = 88000; now <= 140000; now += 2000) colony = advanceColony(colony, now);
    expect(colony.stocks.population).toBe(45);
  });

  it('supplies residents before mines, loses a resident on shortage, and resumes when supplied', () => {
    const initial = completedColony(BuildingType.Base, BuildingType.Minerals, BuildingType.Gas);
    initial.stocks.water = 0;
    initial.stocks.population = 6;
    expect(waterEconomy(initial).balance).toBe(-2.1);
    expect(waterEconomy(initial).populationSupplied).toBe(false);
    const starved = advanceColony(initial, 0);
    expect(starved.stocks.water).toBe(0);
    expect(starved.stocks.population).toBe(5);
    expect(starved.stocks.minerals).toBe(initial.stocks.minerals);
    expect(starved.stocks.gas).toBe(initial.stocks.gas);
    expect(starved.buildings.slice(1).map((building) => building.status)).toEqual([
      BuildingStatus.NoWater,
      BuildingStatus.NoWater,
    ]);
    expect(waterEconomy(starved).balance).toBe(-2);
    expect(waterEconomy(starved).populationSupplied).toBe(true);
    const supplied = advanceColony({ ...starved, stocks: { ...starved.stocks, water: 2 } }, 2000);
    expect(supplied.stocks.water).toBe(0);
    expect(supplied.stocks.population).toBe(6);
    expect(supplied.stocks.minerals).toBe(initial.stocks.minerals + 11);
    expect(supplied.stocks.gas).toBe(initial.stocks.gas + 5);
    expect(supplied.buildings.every((building) => building.status === BuildingStatus.Working)).toBe(
      true,
    );
    expect(initial.stocks.water).toBe(0);
  });

  it('does not partially charge a stalled mine and allocates scarce water by placement id', () => {
    const initial = completedColony(BuildingType.Base, BuildingType.Minerals, BuildingType.Gas);
    initial.stocks.water = 1.9;
    const results = [initial.buildings, [...initial.buildings].reverse()].map((buildings) =>
      advanceColony({ ...initial, buildings }, 0),
    );
    expect(results[0].stocks).toEqual(results[1].stocks);
    expect(results[0].stocks.water).toBe(0.9);
    expect(results[0].stocks.minerals).toBe(initial.stocks.minerals + 11);
    expect(results[0].stocks.gas).toBe(initial.stocks.gas);
    expect(results[0].deposits.gas).toBe(initial.deposits.gas);
    expect(results[0].buildings[2].status).toBe(BuildingStatus.NoWater);
  });

  it('runs water stations before all consumers and excludes depleted and unfinished mines from demand', () => {
    const initial = {
      ...completedColony(
        BuildingType.Base,
        BuildingType.Minerals,
        BuildingType.Gas,
        BuildingType.Water,
        BuildingType.Power,
      ),
      deposits: { minerals: 3, gas: 1000 },
    };
    initial.stocks.water = 0;
    initial.stocks.population = 7;
    const result = advanceColony(initial, 0);
    expect(result.stocks.water).toBe(9.8);
    expect(result.stocks.population).toBe(8);
    expect(result.stocks.minerals).toBe(initial.stocks.minerals + 3);
    expect(result.stocks.gas).toBe(initial.stocks.gas + 5);
    const next = advanceColony(result, 2000);
    expect(next.stocks.water).toBe(20.5);
    expect(next.buildings[1].status).toBe(BuildingStatus.Depleted);
    const unfinished = {
      ...initial,
      buildings: initial.buildings.map((building) =>
        building.type === BuildingType.Gas ? { ...building, completed: false } : building,
      ),
      deposits: { minerals: 0, gas: initial.deposits.gas },
    };
    expect(waterEconomy(unfinished).balance).toBe(11.8);
    expect(waterEconomy(unfinished).populationSupplied).toBe(true);
  });

  it('keeps fractional consumption exact and replays starvation after delayed callbacks', () => {
    const initial = completedColony(BuildingType.Base);
    let expected: Colony = {
      ...initial,
      stocks: { ...initial.stocks, water: 1, population: 6, populationCapacity: 6 },
    };
    for (let step = 0; step < 10; step++) expected = advanceColony(expected, step * 2000);
    expect(expected.stocks.water).toBe(0);
    expect(advanceColony(expected, 20000).stocks.population).toBe(5);
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Housing, 1);
    const start = service.clock();
    let delayed = service.colonies()[planet.id];
    for (let step = 1; step <= 120; step++) delayed = advanceColony(delayed, start + step * 2000);
    delayCallbacks(240000);
    service.tick();
    expect(service.colonies()[planet.id]).toEqual(delayed);
    expect(delayed.stocks.food).toBe(0);
    expect(delayed.stocks.population).toBe(5);
    expect(delayed.stocks.water).toBeGreaterThanOrEqual(0);
  });

  it('charges farm construction separately and starts fixed food production on the next tick', () => {
    const [dry, wet] = planets();
    expect(service.yieldFor(dry, service.definition(BuildingType.Farm))).toBe(4);
    expect(service.yieldFor(wet, service.definition(BuildingType.Farm))).toBe(4);
    service.openPlanet(wet);
    service.build(wet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    const initial = service.colonies()[wet.id].stocks;
    expect(service.build(wet, BuildingType.Farm, 1)).toBeNull();
    expect(service.colonies()[wet.id].stocks.food).toBe(initial.food);
    expect(service.colonies()[wet.id].stocks.water).toBe(initial.water - 10);
    expect(service.colonies()[wet.id].stocks.energy).toBe(5);
    vi.advanceTimersByTime(6000);
    const completed = service.colonies()[wet.id];
    expect(completed.stocks.food).toBe(initial.food);
    vi.advanceTimersByTime(2000);
    const producing = service.colonies()[wet.id];
    expect(producing.stocks.food).toBe(completed.stocks.food + 4);
    expect(producing.stocks.water).toBe(completed.stocks.water - 1);
    expect(producing.stocks.population).toBe(5);
  });

  it('gradually starves to a sustainable population without oscillation, then resumes growth with more food', () => {
    const initial = completedColony(
      BuildingType.Base,
      BuildingType.Water,
      BuildingType.Farm,
      BuildingType.Power,
    );
    let colony: Colony = {
      ...initial,
      stocks: { ...initial.stocks, food: 0, population: 30, populationCapacity: 50 },
    };
    for (let step = 1; step <= 5; step++) {
      colony = advanceColony(colony, step * 2000);
      expect(colony.stocks.population).toBe(30 - step);
      expect(colony.stocks.food).toBe(0);
    }
    for (let step = 6; step <= 30; step++) colony = advanceColony(colony, step * 2000);
    expect(colony.stocks.population).toBe(25);
    expect(colony.stocks.food).toBe(0);
    expect(foodEconomy(colony).balance).toBe(0);
    colony = advanceColony(
      { ...colony, buildings: [...colony.buildings, { ...initial.buildings[2], id: 4, tile: 4 }] },
      62000,
    );
    expect(colony.stocks.population).toBe(26);
    expect(colony.stocks.food).toBe(4);
    expect(initial.stocks.food).toBe(100);
  });

  it.each([
    { food: 0.9, population: 9, remaining: 0 },
    { food: 1, population: 10, remaining: 0 },
    { food: 1.2, population: 11, remaining: 0.2 },
  ])('handles the exact food boundary with $food food', ({ food, population, remaining }) => {
    const initial = completedColony(BuildingType.Base);
    const result = advanceColony(
      { ...initial, stocks: { ...initial.stocks, food, population: 10 } },
      0,
    );
    expect(result.stocks.population).toBe(population);
    expect(result.stocks.food).toBe(remaining);
  });

  it('accounts for water shortages in food output and prioritizes farms over mines', () => {
    const initial = completedColony(BuildingType.Base, BuildingType.Minerals, BuildingType.Farm);
    const dry = { ...initial, stocks: { ...initial.stocks, water: 0.4, food: 0 } };
    expect(foodEconomy(dry)).toEqual({ production: 1, consumption: 1, balance: 0 });
    const starved = advanceColony(dry, 0);
    expect(starved.stocks.population).toBe(5);
    expect(starved.buildings[2].status).toBe(BuildingStatus.NoWater);
    const supplied = { ...initial, stocks: { ...initial.stocks, water: 1.5, food: 0 } };
    const results = [supplied.buildings, [...supplied.buildings].reverse()].map((buildings) =>
      advanceColony({ ...supplied, buildings }, 0),
    );
    expect(results[0].stocks).toEqual(results[1].stocks);
    expect(results[0].stocks.food).toBe(4);
    expect(results[0].stocks.water).toBe(0.5);
    expect(results[0].stocks.minerals).toBe(initial.stocks.minerals);
    expect(results[0].buildings[1].status).toBe(BuildingStatus.NoWater);
    expect(results[0].buildings[2].status).toBe(BuildingStatus.Working);
    expect(waterEconomy(supplied).balance).toBe(-2);
  });

  it('allows housing construction during famine, without food charges or population growth', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Power, 1);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Housing, 2);
    vi.advanceTimersByTime(220000);
    expect(service.colonies()[planet.id].stocks.food).toBe(0);
    expect(service.colonies()[planet.id].stocks.population).toBe(5);
    expect(service.build(planet, BuildingType.Housing, 3)).toBeNull();
    vi.advanceTimersByTime(6000);
    expect(service.colonies()[planet.id].stocks.populationCapacity).toBe(45);
    expect(service.colonies()[planet.id].stocks.population).toBe(5);
    expect(service.colonies()[planet.id].stocks.food).toBe(0);
  });

  it.each([0, 1, 2])(
    'keeps five residents alive indefinitely on planet %s with only the base',
    (index) => {
      const planet = planets()[index];
      service.openPlanet(planet);
      service.build(planet, BuildingType.Base, 0);
      const unfinished = service.colonies()[planet.id];
      expect(waterEconomy(unfinished).production).toBe(0);
      expect(foodEconomy(unfinished).production).toBe(0);
      vi.advanceTimersByTime(4000);
      const completed = service.colonies()[planet.id];
      expect(completed.stocks.water).toBe(140);
      expect(completed.stocks.food).toBe(100);
      vi.advanceTimersByTime(3600000);
      const colony = service.colonies()[planet.id];
      expect(colony.stocks).toEqual(completed.stocks);
      expect(waterEconomy(colony)).toEqual({
        production: 0.5,
        consumption: 0.5,
        balance: 0,
        populationSupplied: true,
      });
      expect(foodEconomy(colony)).toEqual({ production: 1, consumption: 1, balance: 0 });
      const empty = { ...colony, stocks: { ...colony.stocks, water: 0, food: 0 } };
      const next = advanceColony(empty, service.clock());
      expect(next.stocks.population).toBe(5);
      expect(next.stocks.water).toBe(0);
      expect(next.stocks.food).toBe(0);
    },
  );

  it('protects the base and rejects missing buildings and colonies', () => {
    const planet = planets()[1];
    expect(service.demolish(planet, 1)).toBe(DemolitionError.ColonyMissing);
    service.openPlanet(planet);
    expect(service.demolish(planet, 1)).toBe(DemolitionError.BuildingMissing);
    service.build(planet, BuildingType.Base, 0);
    const id = service.colonies()[planet.id].buildings[0].id;
    expect(service.demolish(planet, id)).toBe(DemolitionError.BaseProtected);
    vi.advanceTimersByTime(4000);
    expect(service.demolish(planet, id)).toBe(DemolitionError.BaseProtected);
  });

  it('cancels construction, releases reserved energy without refunds, and allows rebuilding', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Housing, 1);
    const before = service.colonies()[planet.id];
    const credits = service.credits();
    const site = before.buildings[1];
    expect(service.demolish(planet, site.id)).toBeNull();
    const after = service.colonies()[planet.id];
    expect(after.stocks).toEqual({ ...before.stocks, energy: before.stocks.energy + 10 });
    expect(after.buildings.map((building) => building.tile)).toEqual([0]);
    expect(service.credits()).toBe(credits);
    expect(Object.isFrozen(after.stocks)).toBe(true);
    expect(before.buildings).toHaveLength(2);
    vi.advanceTimersByTime(6000);
    expect(service.colonies()[planet.id].stocks.populationCapacity).toBe(5);
    expect(service.build(planet, BuildingType.Power, 1)).toBeNull();
    expect(service.colonies()[planet.id].buildings[1].id).toBeGreaterThan(site.id);
    expect(service.demolish(planet, service.colonies()[planet.id].buildings[1].id)).toBeNull();
    expect(service.colonies()[planet.id].stocks.energy).toBe(10);
  });

  it('blocks demolition of needed power and removes completed production without retroactive losses', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Power, 1);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Housing, 2);
    service.build(planet, BuildingType.Minerals, 3);
    service.build(planet, BuildingType.Water, 4);
    vi.advanceTimersByTime(6000);
    const powerId = service.colonies()[planet.id].buildings[1].id;
    expect(service.demolitionProblem(planet, powerId)).toBe(DemolitionError.Energy);
    const snapshot = service.colonies()[planet.id];
    expect(service.demolish(planet, powerId)).toBe(DemolitionError.Energy);
    expect(service.colonies()[planet.id]).toBe(snapshot);
    const mineId = snapshot.buildings[3].id;
    delayCallbacks(2000);
    expect(service.demolish(planet, mineId)).toBeNull();
    expect(service.colonies()[planet.id].stocks.minerals).toBe(snapshot.stocks.minerals + 11);
    const minerals = service.colonies()[planet.id].stocks.minerals;
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(minerals);
    const housingId = service
      .colonies()
      [planet.id].buildings.find((b) => b.type === BuildingType.Housing)!.id;
    expect(service.demolish(planet, housingId)).toBeNull();
    expect(service.demolish(planet, powerId)).toBeNull();
    expect(service.colonies()[planet.id].stocks.energy).toBe(5);
  });

  it('reduces excess population gradually after housing demolition, without double deaths during famine', () => {
    const initial = completedColony(
      BuildingType.Base,
      BuildingType.Housing,
      BuildingType.Water,
      BuildingType.Farm,
    );
    const stocks = { ...initial.stocks, energy: 0, population: 10, water: 0, food: 0 };
    BUILDINGS_BY_TYPE[BuildingType.Housing].demolish(stocks, true);
    expect(stocks.populationCapacity).toBe(5);
    expect(stocks.population).toBe(10);
    let colony: Colony = {
      ...initial,
      stocks,
      buildings: initial.buildings.filter((b) => b.type !== BuildingType.Housing),
    };
    for (let step = 1; step <= 5; step++) {
      colony = advanceColony(colony, step * 2000);
      expect(colony.stocks.population).toBe(10 - step);
    }
    expect(advanceColony(colony, 12000).stocks.population).toBe(5);
    const hungry = {
      ...colony,
      stocks: { ...colony.stocks, population: 10, food: 0, water: 0 },
      buildings: colony.buildings.filter((b) => b.type !== BuildingType.Farm),
    };
    expect(advanceColony(hungry, 14000).stocks.population).toBe(9);
  });

  it('creates a JSON save with source data, unfinished construction, and a partial production step', () => {
    const knownPlanets = planets();
    const planet = knownPlanets[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(5000);
    service.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(6000);
    service.setManualPaused(true);
    service.openPlanet(knownPlanets[0]);
    const save = service.createSave(new Date('2030-01-02T03:04:05.000Z'));

    expect(save).toEqual({
      version: 1,
      savedAt: '2030-01-02T03:04:05.000Z',
      gameTime: 11000,
      lastProductionTick: 10000,
      credits: 1680,
      planets: knownPlanets,
      colonies: [
        {
          planetId: planet.id,
          stocks: { minerals: 150, water: 130, food: 100, gas: 120, population: 5 },
          deposits: { minerals: 84000, gas: 35000 },
          buildings: [
            {
              id: 1,
              type: BuildingType.Base,
              tile: 0,
              startedAt: 0,
              completesAt: 4000,
              completed: true,
              enabled: true,
            },
            {
              id: 2,
              type: BuildingType.Minerals,
              tile: 1,
              startedAt: 5000,
              completesAt: 11000,
              completed: false,
              enabled: true,
            },
          ],
        },
        {
          planetId: knownPlanets[0].id,
          stocks: { minerals: 240, water: 160, food: 100, gas: 120, population: 0 },
          deposits: { minerals: 94000, gas: 12000 },
          buildings: [],
        },
      ],
      nextBuildingId: 3,
      manualPaused: true,
    });
    expect(JSON.parse(JSON.stringify(save))).toStrictEqual(save);
  });

  it('samples active time and preserves disabled buildings, consumed ids, and independent planet data', () => {
    const knownPlanets = planets();
    const planet = knownPlanets[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(6000);
    service.toggleBuilding(planet, 2);
    service.build(planet, BuildingType.Power, 2);
    service.demolish(planet, 3);
    planet.distanceFromSun = 99;
    planet.resourses.minerals = 0;
    delayCallbacks(1000);
    const save = service.createSave(new Date('2040-01-01T00:00:00.000Z'));
    expect(save.gameTime).toBe(11000);
    expect(save.lastProductionTick).toBe(10000);
    expect(save.nextBuildingId).toBe(4);
    expect(save.colonies[0].buildings[1]).toMatchObject({ id: 2, completed: true, enabled: false });
    expect(save.planets.find((saved) => saved.id === planet.id)).toMatchObject({
      distanceFromSun: 1,
      resourses: { minerals: 84 },
    });
    expect(new Set(save.planets.map((saved) => saved.id)).size).toBe(knownPlanets.length);
    const serialized = JSON.stringify(save);
    knownPlanets[0].name = 'Renamed';
    knownPlanets[0].resourses.water = 0;
    service.toggleBuilding(planet, 2);
    service.build(planet, BuildingType.Power, 2);
    vi.advanceTimersByTime(6000);
    expect(JSON.stringify(save)).toBe(serialized);
    expect(service.colonies()[planet.id].buildings).toHaveLength(3);
  });

  it('does not store automatic or system pause or advance stopped time while creating a save', () => {
    const knownPlanets = planets();
    const planet = knownPlanets[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(1000);
    service.setSystemPaused(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    delayCallbacks(86400000);
    const colonies = service.colonies();
    const save = service.createSave(new Date('2050-01-01T00:00:00.000Z'));
    expect(save.gameTime).toBe(1000);
    expect(save.lastProductionTick).toBe(0);
    expect(save.manualPaused).toBe(false);
    expect(save).not.toHaveProperty('systemPaused');
    expect(save).not.toHaveProperty('tabHidden');
    expect(save).not.toHaveProperty('paused');
    expect(save.planets).toHaveLength(3);
    expect(save.planets[1].id).toBe(planet.id);
    expect(save.colonies[0].buildings[0].completed).toBe(false);
    expect(service.paused()).toBe(true);
    expect(service.colonies()).toBe(colonies);
  });

  it.each([9000, 11000, 13000])(
    'restores the entire session saved at %s ms and repeats its subsequent development',
    (savedTime) => {
      const planet = planets()[1];
      const date = new Date('2030-01-01T00:00:00.000Z');
      service.openPlanet(planet);
      service.build(planet, BuildingType.Base, 0);
      vi.advanceTimersByTime(5000);
      service.build(planet, BuildingType.Minerals, 1);
      service.build(planet, BuildingType.Power, 2);
      service.demolish(planet, 3);
      vi.advanceTimersByTime(savedTime - 5000);
      const saved = service.createSave(date);
      expect(saved.gameTime - saved.lastProductionTick).toBe(1000);
      expect(saved.nextBuildingId).toBe(4);
      vi.advanceTimersByTime(6000);
      const expected = service.createSave(date);
      service.build(planet, BuildingType.Power, 2);
      service.openPlanet(planets()[0]);
      service.build(planets()[0], BuildingType.Base, 0);
      service.setManualPaused(true);
      delayCallbacks(86400000);
      vi.setSystemTime(new Date('2050-01-01T00:00:00.000Z'));

      service.restoreSave(saved);
      expect(service.createSave(date)).toEqual(saved);
      expect(service.systemPaused()).toBe(false);
      expect(service.paused()).toBe(false);
      expect(Object.keys(service.colonies())).toEqual([planet.id]);
      const restored = service.colonies()[planet.id];
      expect(restored.buildings[1].completed).toBe(savedTime >= 12000);
      vi.advanceTimersByTime(999);
      service.tick();
      expect(service.colonies()[planet.id]).toBe(restored);
      vi.advanceTimersByTime(1);
      service.tick();
      expect(service.colonies()[planet.id].stocks.minerals).toBe(
        restored.stocks.minerals + (savedTime >= 12000 ? 11 : 0),
      );
      vi.advanceTimersByTime(5000);
      expect(service.createSave(date)).toEqual(expected);
      expect(service.build(planet, BuildingType.Power, 2)).toBeNull();
      expect(service.colonies()[planet.id].buildings[2].id).toBe(4);
    },
  );

  it('preserves historical construction deadlines and uses current balance only for new buildings', () => {
    const planet = planets()[1];
    const date = new Date('2030-01-01T00:00:00.000Z');
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(5000);
    service.build(planet, BuildingType.Minerals, 1);
    const saved = service.createSave(date);
    const historical: GameSave = {
      ...saved,
      colonies: saved.colonies.map((colony) => ({
        ...colony,
        buildings: colony.buildings.map((building) => ({
          ...building,
          completesAt: building.type === BuildingType.Base ? 2000 : building.startedAt + 9000,
        })),
      })),
    };

    service.restoreSave(JSON.stringify(historical));
    expect(service.createSave(date)).toEqual(historical);
    vi.advanceTimersByTime(7000);
    expect(service.colonies()[planet.id].buildings[1].completed).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].buildings[1]).toMatchObject({
      completesAt: 14000,
      completed: true,
    });

    expect(service.build(planet, BuildingType.Minerals, 2)).toBeNull();
    const colony = service.colonies()[planet.id];
    const next = colony.buildings[2];
    expect(next.completesAt - next.startedAt).toBe(
      BUILDINGS_BY_TYPE[BuildingType.Minerals].buildTime * 1000,
    );
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(colony.stocks.minerals + 11);
  });

  it('restores manual pause, refreshes visibility, and preserves an existing system stop', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(1000);
    service.setManualPaused(true);
    const saved = service.createSave(new Date('2030-01-01T00:00:00.000Z'));
    service.setManualPaused(false);
    vi.advanceTimersByTime(10000);
    service.setSystemPaused(true);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    delayCallbacks(60000);
    service.restoreSave(saved);
    expect(service.clock()).toBe(1000);
    expect(service.manualPaused()).toBe(true);
    expect(service.systemPaused()).toBe(true);
    expect(service.tabHidden()).toBe(true);
    expect(service.colonies()[planet.id].stocks.population).toBe(0);
    service.setSystemPaused(false);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);
    expect(service.clock()).toBe(1000);
    service.setManualPaused(false);
    vi.advanceTimersByTime(3000);
    service.tick();
    expect(service.clock()).toBe(4000);
    expect(service.colonies()[planet.id].stocks.population).toBe(5);
  });

  it.each([5, 30])(
    'recomputes capacity, staffing, power, and statuses without changing %s saved residents or resources',
    (population) => {
      const date = new Date('2030-01-01T00:00:00.000Z');
      const types = [
        BuildingType.Base,
        BuildingType.Power,
        BuildingType.Housing,
        BuildingType.Minerals,
        BuildingType.Gas,
        BuildingType.Farm,
      ];
      const original = service.createSave(date);
      const buildings = types.map((type, index) => ({
        id: index + 1,
        type,
        tile: index,
        startedAt: type === BuildingType.Base ? 0 : 4000,
        completesAt:
          (type === BuildingType.Base ? 0 : 4000) + BUILDINGS_BY_TYPE[type].buildTime * 1000,
        completed: true,
        enabled: type !== BuildingType.Gas,
      }));
      const save: GameSave = {
        ...original,
        gameTime: 11000,
        lastProductionTick: 10000,
        nextBuildingId: 8,
        colonies: [
          {
            planetId: original.planets[1].id,
            stocks: { minerals: 50, water: 0, food: 10, gas: 10, population },
            deposits: { minerals: 0, gas: 100 },
            buildings: [
              ...buildings,
              {
                id: 7,
                type: BuildingType.Water,
                tile: 6,
                startedAt: 10000,
                completesAt: 14000,
                completed: false,
                enabled: true,
              },
            ],
          },
        ],
      };
      service.restoreSave(save);
      const colony = service.colonies()[save.colonies[0].planetId];
      expect(colony.stocks.populationCapacity).toBe(25);
      expect(colony.stocks.population).toBe(population);
      expect(colony.stocks.energy).toBe(1);
      const workforce = colonyWorkforce(colony);
      expect([...workforce.workers.values()]).toEqual([0, 2, 0, 2, 0, population === 5 ? 1 : 2, 0]);
      expect(colony.buildings.map((building) => building.status)).toEqual([
        BuildingStatus.Working,
        BuildingStatus.Working,
        BuildingStatus.Working,
        BuildingStatus.Depleted,
        BuildingStatus.Disabled,
        BuildingStatus.NoWater,
        BuildingStatus.Construction,
      ]);
      expect(service.createSave(date)).toEqual(save);
      expect(colony.planet).not.toBe(save.planets[1]);
      expect(colony.buildings[0]).not.toBe(save.colonies[0].buildings[0]);
      expect(Object.isFrozen(service.planets())).toBe(true);
      expect(Object.isFrozen(service.planets()[1].resourses)).toBe(true);
      expect(Object.isFrozen(colony.stocks)).toBe(true);
      expect(Object.isFrozen(colony.deposits)).toBe(true);
      expect(Object.isFrozen(colony.buildings[0])).toBe(true);
      const mutable = {
        ...save,
        planets: save.planets.map((planet) => ({ ...planet, resourses: { ...planet.resourses } })),
        colonies: save.colonies.map((saved) => ({
          ...saved,
          stocks: { ...saved.stocks },
          deposits: { ...saved.deposits },
          buildings: saved.buildings.map((building) => ({ ...building })),
        })),
      };
      service.restoreSave(mutable);
      mutable.planets[1].resourses.water = 0;
      mutable.colonies[0].stocks.population = 100;
      mutable.colonies[0].buildings[0].completed = false;
      expect(service.createSave(date)).toEqual(save);
    },
  );

  it('rejects invalid snapshots without changing a manually paused session', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    service.setManualPaused(true);
    const date = new Date('2030-01-01T00:00:00.000Z');
    const saved = service.createSave(date);
    const colonies = service.colonies();
    const invalid: GameSave = {
      ...saved,
      credits: 1,
      colonies: [...saved.colonies, { ...saved.colonies[0], planetId: 'missing' }],
    };
    expect(() => service.restoreSave(invalid)).toThrow('colonies[1].planetId');
    expect(service.colonies()).toBe(colonies);
    expect(service.createSave(date)).toEqual(saved);
    expect(service.manualPaused()).toBe(true);
    expect(service.systemPaused()).toBe(false);
  });

  it.each(['JSON', 'version', 'structure'])(
    'rejects invalid %s before sampling elapsed active time or replacing any session state',
    (kind) => {
      const planet = planets()[1];
      service.openPlanet(planet);
      service.build(planet, BuildingType.Base, 0);
      const date = new Date('2030-01-01T00:00:00.000Z');
      const saved = service.createSave(date);
      const colonies = service.colonies();
      const originalPlanets = service.planets();
      const timers = vi.getTimerCount();
      const tick = vi.spyOn(service, 'tick');
      delayCallbacks(5000);
      const input: unknown =
        kind === 'JSON'
          ? '{"version":'
          : kind === 'version'
            ? { ...saved, version: 2 }
            : { ...saved, nextBuildingId: 1 };
      expect(() => service.restoreSave(input)).toThrow('Сохранение');
      expect(tick).not.toHaveBeenCalled();
      expect(service.clock()).toBe(saved.gameTime);
      expect(service.credits()).toBe(saved.credits);
      expect(service.colonies()).toBe(colonies);
      expect(service.planets()).toBe(originalPlanets);
      expect(service.manualPaused()).toBe(false);
      expect(service.systemPaused()).toBe(false);
      expect(service.tabHidden()).toBe(false);
      expect(vi.getTimerCount()).toBe(timers);
      service.tick();
      const later = service.createSave(date);
      expect(later.gameTime).toBe(5000);
      expect(later.lastProductionTick).toBe(4000);
      expect(later.nextBuildingId).toBe(saved.nextBuildingId);
      expect(later.colonies[0].buildings[0].completed).toBe(true);
    },
  );

  it('restores validated JSON and does not overflow building identifiers at the safe integer limit', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    const source = service.createSave(new Date('2030-01-01T00:00:00.000Z'));
    service.restoreSave(JSON.stringify({ ...source, nextBuildingId: Number.MAX_SAFE_INTEGER - 1 }));
    expect(service.build(planet, BuildingType.Base, 0)).toBeNull();
    expect(service.colonies()[planet.id].buildings[0].id).toBe(Number.MAX_SAFE_INTEGER - 1);
    vi.advanceTimersByTime(4000);
    expect(service.buildProblem(planet, BuildingType.Power)).toBe(BuildError.IdExhausted);
    expect(service.build(planet, BuildingType.Power, 1)).toBe(BuildError.IdExhausted);
    expect(service.createSave(new Date()).nextBuildingId).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('exposes immutable snapshots and serializable building parameters', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    const colony = service.colonies()[planet.id];
    expect('set' in service.credits).toBe(false);
    expect('update' in service.colonies).toBe(false);
    expect(Object.isFrozen(colony.stocks)).toBe(true);
    expect(Object.isFrozen(colony.buildings[0])).toBe(true);
    planet.resourses.water = 0;
    expect(colony.planet.resourses.water).toBe(92);
    expect(JSON.parse(JSON.stringify(service.catalogue))).toEqual(service.catalogue);
  });

  it('clears the production timer and visibility listener when destroyed', () => {
    const tick = vi.spyOn(service, 'tick');
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(6000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(tick).not.toHaveBeenCalled();
    service = TestBed.inject(GameSessionService);
    service.setSystemPaused(false);
    const liveTick = vi.spyOn(service, 'tick');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(liveTick).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2000);
    expect(liveTick).toHaveBeenCalledTimes(2);
    expect(tick).not.toHaveBeenCalled();
  });

  it.each([
    { water: 0, population: 5, remaining: 0 },
    { water: 0.1, population: 6, remaining: 0 },
    { water: 0.2, population: 7, remaining: 0.1 },
  ])(
    'handles the exact water boundary with $water stored water',
    ({ water, population, remaining }) => {
      const initial = completedColony(BuildingType.Base);
      const result = advanceColony(
        {
          ...initial,
          stocks: { ...initial.stocks, water, population: 6 },
        },
        0,
      );
      expect(result.stocks.population).toBe(population);
      expect(result.stocks.water).toBe(remaining);
    },
  );

  it('loses at most one resident for simultaneous shortages and does not oscillate after dehydration', () => {
    const initial = completedColony(BuildingType.Base);
    const starving = advanceColony(
      {
        ...initial,
        stocks: { ...initial.stocks, water: 0, food: 0, population: 6, populationCapacity: 4 },
      },
      0,
    );
    expect(starving.stocks.population).toBe(5);
    let colony: Colony = {
      ...initial,
      stocks: { ...initial.stocks, water: 0, population: 6 },
    };
    for (let step = 0; step < 20; step++) {
      colony = advanceColony(colony, step * 2000);
      expect(colony.stocks.population).toBe(5);
      expect(colony.stocks.water).toBe(0);
    }
    expect(
      advanceColony(
        {
          ...colony,
          stocks: { ...colony.stocks, water: 1 },
        },
        40000,
      ).stocks.population,
    ).toBe(6);
  });

  it.each([
    BuildingType.Minerals,
    BuildingType.Gas,
    BuildingType.Farm,
    BuildingType.Water,
    BuildingType.Power,
  ])(
    'switches %s off without consumption, production, or demolition, and resumes when enabled',
    (type) => {
      const planet = planets()[1];
      service.openPlanet(planet);
      service.build(planet, BuildingType.Base, 0);
      vi.advanceTimersByTime(4000);
      expect(service.build(planet, type, 1)).toBeNull();
      vi.advanceTimersByTime(6000);
      const before = service.colonies()[planet.id];
      const building = before.buildings[1];
      const credits = service.credits();
      expect(service.toggleBuilding(planet, building.id)).toBeNull();
      const disabled = service.colonies()[planet.id];
      expect(disabled.buildings[1].enabled).toBe(false);
      expect(disabled.buildings[1].status).toBe(BuildingStatus.Disabled);
      expect(disabled.stocks.energy).toBe(10);
      expect(colonyWorkforce(disabled).employed).toBe(0);
      vi.advanceTimersByTime(4000);
      expect(service.colonies()[planet.id].stocks).toEqual(disabled.stocks);
      expect(service.colonies()[planet.id].deposits).toEqual(before.deposits);
      expect(service.colonies()[planet.id].buildings).toHaveLength(2);
      expect(service.credits()).toBe(credits);
      expect(service.toggleBuilding(planet, building.id)).toBeNull();
      expect(service.colonies()[planet.id].buildings[1].enabled).toBe(true);
      const definition = service.definition(type);
      expect(colonyWorkforce(service.colonies()[planet.id]).employed).toBe(
        definition.workersRequired,
      );
      vi.advanceTimersByTime(2000);
      const active = service.colonies()[planet.id];
      if (definition.production) {
        expect(active.stocks[definition.production]).toBe(
          disabled.stocks[definition.production] + definition.yieldFor(planet),
        );
      } else {
        expect(active.stocks.energy).toBe(26);
      }
      expect(before.buildings[1].enabled).toBe(true);
      expect(Object.isFrozen(disabled.buildings[1])).toBe(true);
    },
  );

  it('rejects switching missing, protected, and unfinished buildings without changing state', () => {
    const planet = planets()[1];
    expect(service.toggleBuilding(planet, 1)).toBe(BuildingOperationError.ColonyMissing);
    service.openPlanet(planet);
    expect(service.toggleBuilding(planet, 1)).toBe(BuildingOperationError.BuildingMissing);
    service.build(planet, BuildingType.Base, 0);
    expect(service.toggleBuilding(planet, service.colonies()[planet.id].buildings[0].id)).toBe(
      BuildingOperationError.Protected,
    );
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Water, 1);
    const before = service.colonies()[planet.id];
    expect(service.toggleBuilding(planet, before.buildings[1].id)).toBe(
      BuildingOperationError.Construction,
    );
    expect(service.colonies()[planet.id]).toBe(before);
    vi.advanceTimersByTime(4000);
    service.toggleBuilding(planet, before.buildings[1].id);
    expect(service.build(planet, BuildingType.Housing, 2)).toBeNull();
    vi.advanceTimersByTime(6000);
    const housing = service.colonies()[planet.id].buildings[2];
    expect(service.toggleBuilding(planet, housing.id)).toBe(BuildingOperationError.Protected);
    expect(service.colonies()[planet.id].buildings[2].enabled).toBe(true);
  });

  it('catches up before switching so disabled buildings cannot change earlier production', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(6000);
    const before = service.colonies()[planet.id];
    delayCallbacks(6000);
    expect(service.toggleBuilding(planet, before.buildings[1].id)).toBeNull();
    expect(service.colonies()[planet.id].stocks.minerals).toBe(before.stocks.minerals + 33);
    const stopped = service.colonies()[planet.id];
    vi.advanceTimersByTime(4000);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(stopped.stocks.minerals);
    delayCallbacks(6000);
    expect(service.toggleBuilding(planet, before.buildings[1].id)).toBeNull();
    expect(service.colonies()[planet.id].stocks.minerals).toBe(stopped.stocks.minerals);
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[planet.id].stocks.minerals).toBe(stopped.stocks.minerals + 11);
  });

  it('reassigns released workers immediately and restores original priority when switched back on', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Power, 1);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Minerals, 2);
    service.build(planet, BuildingType.Gas, 3);
    vi.advanceTimersByTime(6000);
    const before = service.colonies()[planet.id];
    const mine = before.buildings[2];
    const gas = before.buildings[3];
    expect(allocateWorkers(before).get(gas.id)).toBe(1);
    expect(service.toggleBuilding(planet, mine.id)).toBeNull();
    const released = colonyWorkforce(service.colonies()[planet.id]);
    expect(released.workers.get(gas.id)).toBe(2);
    expect(released.employed).toBe(4);
    expect(service.toggleBuilding(planet, mine.id)).toBeNull();
    const resumed = colonyWorkforce(service.colonies()[planet.id]);
    expect(resumed.workers.get(mine.id)).toBe(2);
    expect(resumed.workers.get(gas.id)).toBe(1);
    expect(resumed.employed).toBe(5);
  });

  it('sheds newer consumers when a power station is disabled and restarts them when enabled', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Power, 1);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Housing, 2);
    service.build(planet, BuildingType.Minerals, 3);
    vi.advanceTimersByTime(6000);
    const station = service.colonies()[planet.id].buildings[1];
    expect(service.toggleBuilding(planet, station.id)).toBeNull();
    const disabled = service.colonies()[planet.id];
    expect(disabled.stocks.energy).toBe(-5);
    expect(disabled.buildings[3].status).toBe(BuildingStatus.NoEnergy);
    expect(disabled.stocks.populationCapacity).toBe(25);
    expect(service.toggleBuilding(planet, station.id)).toBeNull();
    expect(service.colonies()[planet.id].stocks.energy).toBe(11);
    expect(service.colonies()[planet.id].buildings[3].status).toBe(BuildingStatus.Working);
  });

  it('allocates whole workers by placement id, skipping construction, bases, and housing', () => {
    const colony = completedColony(
      BuildingType.Base,
      BuildingType.Minerals,
      BuildingType.Gas,
      BuildingType.Farm,
      BuildingType.Water,
      BuildingType.Housing,
    );
    const site = { ...colony.buildings[1], id: -1, completed: false };
    const buildings = [...colony.buildings, site];
    const forward = allocateWorkers({ ...colony, buildings });
    const reversed = allocateWorkers({ ...colony, buildings: [...buildings].reverse() });
    expect([...forward]).toEqual([...reversed]);
    expect([...forward.values()]).toEqual([0, 0, 2, 2, 1, 0, 0]);
    expect(colonyWorkforce({ ...colony, buildings }).employed).toBe(5);
    expect(
      colonyWorkforce({
        ...colony,
        stocks: { ...colony.stocks, population: 20 },
      }).employed,
    ).toBe(7);
  });

  it('scales extraction by staffing before capping deposits and releases workers on demolition', () => {
    const colony = completedColony(BuildingType.Base, BuildingType.Minerals, BuildingType.Gas);
    colony.stocks.population = 1;
    colony.stocks.populationCapacity = 1;
    const partial = advanceColony(colony, 0);
    expect(partial.stocks.minerals).toBe(colony.stocks.minerals + 5.5);
    expect(partial.deposits.minerals).toBe(colony.deposits.minerals - 5.5);
    expect(partial.stocks.gas).toBe(colony.stocks.gas);
    expect(partial.buildings[2].status).toBe(BuildingStatus.NoWorkers);
    expect(partial.stocks.water).toBe(159.4);
    const final = advanceColony({ ...colony, deposits: { minerals: 3, gas: 10 } }, 0);
    expect(final.stocks.minerals).toBe(colony.stocks.minerals + 3);
    expect(final.deposits.minerals).toBe(0);
    const demolished = advanceColony(
      {
        ...colony,
        buildings: colony.buildings.filter((building) => building.id !== 1),
      },
      0,
    );
    expect(demolished.stocks.gas).toBe(colony.stocks.gas + 2.5);
    expect(colony.stocks.minerals).toBe(240);
  });

  it('projects partial farm output consistently and keeps base supplies independent of workers', () => {
    const colony = completedColony(BuildingType.Base, BuildingType.Farm);
    colony.stocks.population = 1;
    colony.stocks.populationCapacity = 1;
    expect(foodEconomy(colony)).toEqual({ production: 3, consumption: 0.2, balance: 2.8 });
    expect(waterEconomy(colony).balance).toBe(-0.6);
    expect(advanceColony(colony, 0).stocks.food).toBe(102.8);
    const empty = { ...colony, stocks: { ...colony.stocks, population: 0, populationCapacity: 0 } };
    const result = advanceColony(empty, 0);
    expect(result.stocks.food).toBe(101);
    expect(result.stocks.water).toBe(160.5);
    expect(result.buildings[1].status).toBe(BuildingStatus.NoWorkers);
    expect(
      advanceColony(
        {
          ...result,
          stocks: { ...result.stocks, population: 1, populationCapacity: 1 },
        },
        2000,
      ).stocks.food,
    ).toBe(103.8);
  });

  it('scales power with staffing, sheds newest consumers, and restores them automatically', () => {
    const colony = completedColony(
      BuildingType.Base,
      BuildingType.Minerals,
      BuildingType.Gas,
      BuildingType.Farm,
      BuildingType.Water,
      BuildingType.Power,
    );
    colony.stocks.population = 8;
    colony.stocks.populationCapacity = 8;
    const result = advanceColony(colony, 0);
    expect(result.stocks.energy).toBe(-2);
    expect(result.buildings[4].status).toBe(BuildingStatus.NoEnergy);
    expect(result.stocks.water).toBe(156.7);
    expect(result.stocks.minerals).toBe(251);
    expect(result.stocks.gas).toBe(125);
    expect(waterEconomy(colony).production).toBe(0.5);
    expect(foodEconomy(colony).production).toBe(5);
    const reverse = advanceColony({ ...colony, buildings: [...colony.buildings].reverse() }, 0);
    expect(reverse.stocks).toEqual(result.stocks);
    expect(reverse.buildings.map((building) => building.status).reverse()).toEqual(
      result.buildings.map((building) => building.status),
    );
    const lower = advanceColony(
      {
        ...result,
        stocks: { ...result.stocks, population: 7, populationCapacity: 7 },
      },
      2000,
    );
    expect(lower.stocks.energy).toBe(-10);
    expect(lower.buildings[3].status).toBe(BuildingStatus.NoEnergy);
    const restored = advanceColony(
      {
        ...lower,
        stocks: { ...lower.stocks, population: 9, populationCapacity: 9 },
      },
      4000,
    );
    expect(restored.stocks.energy).toBe(6);
    expect(restored.buildings.every((building) => building.status === BuildingStatus.Working)).toBe(
      true,
    );
    expect(restored.stocks.water).toBe(lower.stocks.water + 8.6);
    expect(buildProblem(result, 2000, BUILDINGS_BY_TYPE[BuildingType.Water])).toBe('energy');
    expect(buildProblem(result, 2000, BUILDINGS_BY_TYPE[BuildingType.Power])).toBeNull();
    expect(demolitionProblem(result, result.buildings[5].id)).toBe(DemolitionError.Energy);
  });
});
