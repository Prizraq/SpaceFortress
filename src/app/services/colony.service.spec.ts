import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILDINGS_BY_TYPE } from '../domain/building-catalogue';
import { buildProblem } from '../domain/building-rules';
import {
  advanceColony,
  createColony,
  foodEconomy,
  waterEconomy,
} from '../domain/colony-simulation';
import { BuildingStatus } from '../models/enum/building-status';
import { BuildingType } from '../models/enum/building-type';
import { DemolitionError } from '../models/enum/demolition-error';
import { Colony } from '../models/interface/colony';
import { ColonyService } from './colony.service';
import { PlanetService } from './planet.service';

describe('ColonyService and simulation', () => {
  let service: ColonyService;
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
        status: BuildingStatus.Working,
      })),
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ColonyService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

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
    const depleted = advanceColony({ ...snapshot, deposits: { minerals: 3, gas: 2 } }, Date.now());
    expect(depleted.stocks.minerals).toBe(snapshot.stocks.minerals + 3);
    expect(depleted.stocks.gas).toBe(snapshot.stocks.gas + 2);
    expect(depleted.deposits).toEqual({ minerals: 0, gas: 0 });
    expect(advanceColony(depleted, Date.now()).buildings[1].status).toBe('depleted');
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
    const start = Date.now();
    let expected = initial;
    for (let step = 1; step <= 12; step++) expected = advanceColony(expected, start + step * 2000);
    vi.setSystemTime(start + 24000);
    service.tick(Date.now());
    expect(service.colonies()[planet.id]).toEqual(expected);
    expect(expected.stocks.population).toBe(5);
    expect(expected.stocks.energy).toBe(10);
    service.tick(Date.now());
    expect(service.colonies()[planet.id]).toEqual(expected);
    vi.setSystemTime(Date.now() + 1000);
    service.tick(Date.now());
    expect(service.colonies()[planet.id]).toEqual(expected);
  });

  it('catches up before placement without producing retroactively', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    vi.setSystemTime(Date.now() + 20000);
    service.build(planet, BuildingType.Base, 0);
    expect(service.colonies()[planet.id].stocks.energy).toBe(0);
    expect(service.colonies()[planet.id].buildings[0].completed).toBe(false);
    vi.setSystemTime(Date.now() + 6000);
    service.tick(Date.now());
    expect(service.colonies()[planet.id].stocks.energy).toBe(10);
    expect(service.colonies()[planet.id].stocks.population).toBe(5);
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
        Date.now(),
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

  it('supplies residents before mines, pauses on shortage, and resumes without killing residents', () => {
    const initial = completedColony(BuildingType.Base, BuildingType.Minerals, BuildingType.Gas);
    initial.stocks.water = 0;
    initial.stocks.population = 6;
    const starved = advanceColony(initial, 0);
    expect(starved.stocks.water).toBe(0);
    expect(starved.stocks.population).toBe(6);
    expect(starved.stocks.minerals).toBe(initial.stocks.minerals);
    expect(starved.stocks.gas).toBe(initial.stocks.gas);
    expect(starved.buildings.slice(1).map((building) => building.status)).toEqual([
      BuildingStatus.NoWater,
      BuildingStatus.NoWater,
    ]);
    expect(waterEconomy(starved).balance).toBe(-2.1);
    expect(waterEconomy(starved).populationSupplied).toBe(false);
    const supplied = advanceColony({ ...starved, stocks: { ...starved.stocks, water: 2.1 } }, 2000);
    expect(supplied.stocks.water).toBe(0);
    expect(supplied.stocks.population).toBe(7);
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
      ),
      deposits: { minerals: 3, gas: 1000 },
    };
    initial.stocks.water = 0;
    const result = advanceColony(initial, 0);
    expect(result.stocks.water).toBe(10);
    expect(result.stocks.population).toBe(6);
    expect(result.stocks.minerals).toBe(initial.stocks.minerals + 3);
    expect(result.stocks.gas).toBe(initial.stocks.gas + 5);
    const next = advanceColony(result, 2000);
    expect(next.stocks.water).toBe(20.9);
    expect(next.buildings[1].status).toBe(BuildingStatus.Depleted);
    const unfinished = {
      ...initial,
      buildings: initial.buildings.map((building) =>
        building.type === BuildingType.Gas ? { ...building, completed: false } : building,
      ),
      deposits: { minerals: 0, gas: initial.deposits.gas },
    };
    expect(waterEconomy(unfinished).balance).toBe(12);
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
    expect(advanceColony(expected, 20000).stocks.population).toBe(6);
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, BuildingType.Housing, 1);
    const start = Date.now();
    let delayed = service.colonies()[planet.id];
    for (let step = 1; step <= 120; step++) delayed = advanceColony(delayed, start + step * 2000);
    vi.setSystemTime(start + 240000);
    service.tick(Date.now());
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
    const initial = completedColony(BuildingType.Base, BuildingType.Water, BuildingType.Farm);
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
      { ...colony, buildings: [...colony.buildings, { ...initial.buildings[2], id: 3, tile: 3 }] },
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
      const next = advanceColony(empty, Date.now());
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
    vi.setSystemTime(Date.now() + 2000);
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
    BUILDINGS_BY_TYPE[BuildingType.Housing].demolish(initial.planet, stocks, true);
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

  it('clears the production timer when destroyed', () => {
    const tick = vi.spyOn(service, 'tick');
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(6000);
    expect(tick).not.toHaveBeenCalled();
  });
});
