import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILDINGS_BY_TYPE } from '../domain/building-catalogue';
import { buildProblem } from '../domain/building-rules';
import { advanceColony } from '../domain/colony-simulation';
import { ColonyService } from './colony.service';
import { PlanetService } from './planet.service';

describe('ColonyService and simulation', () => {
  let service: ColonyService;
  const planets = () => new PlanetService().getPlanets();

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
    service.build(first, 'base', 0);
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
    expect(service.build(planet, 'power', 0)).toBe('base-required');
    expect(service.build(planet, 'base', -1)).toBe('invalid-tile');
    expect(service.build(planet, 'base', 81)).toBe('invalid-tile');
    expect(service.build(planet, 'base', 0.5)).toBe('invalid-tile');
    expect(service.build(planet, 'base', 0)).toBeNull();
    expect(service.build(planet, 'base', 1)).toBe('base-exists');
    vi.advanceTimersByTime(4000);
    expect(service.build(planet, 'power', 0)).toBe('occupied');
    expect(service.credits()).toBe(1800);
    expect(
      service.colonies()[planet.id].buildings.filter((building) => building.completed),
    ).toHaveLength(1);
  });

  it('produces after completion, every two seconds, and adds population only once', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, 'base', 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, 'minerals', 1);
    service.build(planet, 'gas', 2);
    service.build(planet, 'housing', 3);
    vi.advanceTimersByTime(6000);
    const before = service.colonies()[planet.id];
    expect(before.stocks.population).toBe(25);
    vi.advanceTimersByTime(1999);
    expect(service.colonies()[planet.id]).toBe(before);
    vi.advanceTimersByTime(1);
    const after = service.colonies()[planet.id];
    expect(after.stocks.minerals).toBe(before.stocks.minerals + 11);
    expect(after.stocks.gas).toBe(before.stocks.gas + 5);
    expect(after.stocks.population).toBe(25);
    expect(after.deposits.minerals).toBe(before.deposits.minerals - 11);
    expect(after.deposits.gas).toBe(before.deposits.gas - 5);
    expect(after.stocks.energy).toBe(before.stocks.energy + 4 - 2 - 3);
  });

  it('checks unaffordable construction through pure rules', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    const colony = service.colonies()[planet.id];
    expect(buildProblem(colony, 0, BUILDINGS_BY_TYPE.base)).toBe('credits');
    expect(
      buildProblem(
        { ...colony, stocks: { ...colony.stocks, minerals: 0 } },
        2000,
        BUILDINGS_BY_TYPE.base,
      ),
    ).toBe('minerals');
    expect(service.colonies()[planet.id]).toBe(colony);
  });

  it('stops consumers without energy and caps extraction at remaining deposits', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, 'base', 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, 'minerals', 1);
    service.build(planet, 'gas', 2);
    vi.advanceTimersByTime(6000);
    const snapshot = service.colonies()[planet.id];
    const lowEnergy = advanceColony(
      { ...snapshot, stocks: { ...snapshot.stocks, energy: 0 } },
      Date.now(),
    );
    expect(lowEnergy.stocks.gas).toBe(snapshot.stocks.gas);
    expect(lowEnergy.buildings[2].status).toBe('no-energy');
    const depleted = advanceColony({ ...snapshot, deposits: { minerals: 3, gas: 2 } }, Date.now());
    expect(depleted.stocks.minerals).toBe(snapshot.stocks.minerals + 3);
    expect(depleted.stocks.gas).toBe(snapshot.stocks.gas + 2);
    expect(depleted.deposits).toEqual({ minerals: 0, gas: 0 });
    expect(advanceColony(depleted, Date.now()).buildings[1].status).toBe('depleted');
    expect(service.colonies()[planet.id]).toBe(snapshot);
  });

  it('scales water output by abundance and produces power', () => {
    const [dry, wet] = planets();
    expect(service.yieldFor(dry, service.definition('water'))).toBe(1);
    expect(service.yieldFor(wet, service.definition('water'))).toBe(12);
    service.openPlanet(wet);
    service.build(wet, 'base', 0);
    vi.advanceTimersByTime(4000);
    service.build(wet, 'water', 1);
    service.build(wet, 'power', 2);
    vi.advanceTimersByTime(4000);
    const before = service.colonies()[wet.id].stocks;
    vi.advanceTimersByTime(2000);
    expect(service.colonies()[wet.id].stocks.water).toBe(before.water + 12);
    expect(service.colonies()[wet.id].stocks.energy).toBe(before.energy + 4 + 16 - 2);
  });

  it('matches regular and delayed simulation including completions', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, 'base', 0);
    const initial = service.colonies()[planet.id];
    const start = Date.now();
    let expected = initial;
    for (let step = 1; step <= 12; step++) expected = advanceColony(expected, start + step * 2000);
    vi.setSystemTime(start + 24000);
    service.tick(Date.now());
    expect(service.colonies()[planet.id]).toEqual(expected);
    expect(expected.stocks.population).toBe(5);
    expect(expected.stocks.energy).toBe(140);
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
    service.build(planet, 'base', 0);
    expect(service.colonies()[planet.id].stocks.energy).toBe(100);
    expect(service.colonies()[planet.id].buildings[0].completed).toBe(false);
    vi.setSystemTime(Date.now() + 6000);
    service.tick(Date.now());
    expect(service.colonies()[planet.id].stocks.energy).toBe(104);
    expect(service.colonies()[planet.id].stocks.population).toBe(5);
  });

  it('runs generators first and consumers by placement id independently of array order', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, 'base', 0);
    vi.advanceTimersByTime(4000);
    service.build(planet, 'minerals', 1);
    service.build(planet, 'gas', 2);
    service.build(planet, 'power', 3);
    vi.advanceTimersByTime(6000);
    const snapshot = service.colonies()[planet.id];
    const results = [snapshot.buildings, [...snapshot.buildings].reverse()].map((buildings) =>
      advanceColony(
        {
          ...snapshot,
          buildings,
          stocks: { ...snapshot.stocks, energy: 0 },
        },
        Date.now(),
      ),
    );
    expect(results[0].stocks).toEqual(results[1].stocks);
    expect(results[0].stocks.energy).toBe(15);
    expect(results[0].stocks.gas).toBe(snapshot.stocks.gas + 5);
    const withoutGenerator = {
      ...snapshot,
      buildings: snapshot.buildings.filter((building) => building.type !== 'power'),
      stocks: { ...snapshot.stocks, energy: 0 },
    };
    expect(advanceColony(withoutGenerator, Date.now()).stocks).toEqual(
      advanceColony(
        { ...withoutGenerator, buildings: [...withoutGenerator.buildings].reverse() },
        Date.now(),
      ).stocks,
    );
  });

  it('exposes immutable snapshots and serializable building definitions', () => {
    const planet = planets()[1];
    service.openPlanet(planet);
    service.build(planet, 'base', 0);
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
