import { describe, expect, it } from 'vitest';
import { PlanetService } from '../../shared/services/planet.service';
import { BuildingType } from '../../planet/models/enum/building-type';
import * as GameSaveValidation from './game-save-validation';

function validSave() {
  return {
    version: 3,
    savedAt: '2030-01-01T00:00:00.000Z',
    gameTime: 101000,
    lastProductionTick: 100000,
    credits: 1680,
    creditRemainder: 0,
    maintenanceShortfall: 0,
    planets: new PlanetService().getPlanets(),
    colonies: [
      {
        planetId: 'terra-3',
        stocks: { minerals: 5.5, water: 0, food: 0, gas: 120, population: 30 },
        deposits: { minerals: 0, gas: 35000 },
        buildings: [
          {
            id: 1,
            type: BuildingType.Base,
            tile: 0,
            startedAt: 0,
            completesAt: 4000,
            completed: true,
            enabled: true,
            disabledByFinance: false,
          },
          {
            id: 8,
            type: BuildingType.Minerals,
            tile: 1,
            startedAt: 95000,
            completesAt: 101000,
            completed: false,
            enabled: true,
            disabledByFinance: false,
          },
        ],
      },
    ],
    nextBuildingId: 9,
    manualPaused: false,
  };
}

type Fixture = ReturnType<typeof validSave>;

describe('game save validation', () => {
  it.each([1, 2])('migrates v%s without applying finances, changing deadlines or scaling credits', (version) => {
    const source = validSave();
    const legacy = { ...source, version, credits: Number.MAX_SAFE_INTEGER };
    if (version === 1) {
      Reflect.deleteProperty(legacy, 'creditRemainder');
      Reflect.deleteProperty(legacy, 'maintenanceShortfall');
    }
    for (const colony of legacy.colonies) {
      for (const building of colony.buildings) Reflect.deleteProperty(building, 'disabledByFinance');
    }
    expect(GameSaveValidation.readGameSave(JSON.stringify(legacy))).toEqual({
      ...validSave(), credits: Number.MAX_SAFE_INTEGER,
    });
  });

  it('preserves exact cents and the historical unpaid step in v3', () => {
    const source = { ...validSave(), creditRemainder: 25, maintenanceShortfall: 110 };
    expect(GameSaveValidation.readGameSave(JSON.stringify(source))).toEqual(source);
  });

  it('migrates a manually disabled v2 mine without inventing a financial reason or changing money', () => {
    const source = validSave();
    source.colonies[0].buildings[1] = {
      ...source.colonies[0].buildings[1], startedAt: 4000, completesAt: 10000,
      completed: true, enabled: false,
    };
    const legacy = { ...source, version: 2, creditRemainder: 73, maintenanceShortfall: 50 };
    for (const building of legacy.colonies[0].buildings)
      Reflect.deleteProperty(building, 'disabledByFinance');
    expect(GameSaveValidation.readGameSave(JSON.stringify(legacy))).toEqual({
      ...source, version: 3, creditRemainder: 73, maintenanceShortfall: 50,
      colonies: source.colonies.map((colony) => ({
        ...colony, buildings: colony.buildings.map((building) => ({
          ...building, disabledByFinance: false,
        })),
      })),
    });
  });

  it('round-trips the persistent financial reason independently of available credits', () => {
    const source = validSave();
    source.colonies[0].buildings[1] = {
      ...source.colonies[0].buildings[1], startedAt: 4000, completesAt: 10000,
      completed: true, enabled: false, disabledByFinance: true,
    };
    expect(GameSaveValidation.readGameSave(JSON.stringify(source))).toEqual(source);
  });

  it.each(['missing', 'string', 'enabled', 'construction', 'base', 'housing'])(
    'rejects an invalid financial reason: %s', (reason) => {
      const source = validSave();
      const building = source.colonies[0].buildings[1];
      Object.assign(building, {
        startedAt: 0, completesAt: 6000, completed: true,
        enabled: false, disabledByFinance: true,
      });
      if (reason === 'missing') Reflect.deleteProperty(building, 'disabledByFinance');
      if (reason === 'string') Object.assign(building, { disabledByFinance: 'true' });
      if (reason === 'enabled') building.enabled = true;
      if (reason === 'construction') {
        Object.assign(building, {
          startedAt: 95000, completesAt: 101000, completed: false, enabled: true,
        });
      }
      if (reason === 'base' || reason === 'housing') {
        building.type = reason === 'base' ? BuildingType.Base : BuildingType.Housing;
        building.enabled = true;
      }
      expect(() => GameSaveValidation.readGameSave(source)).toThrow('disabledByFinance');
    },
  );

  it.each([
    ['creditRemainder', -1], ['creditRemainder', 100], ['creditRemainder', 0.5],
    ['maintenanceShortfall', -1], ['maintenanceShortfall', 0.1],
    ['credits', 1.5], ['credits', Number.MAX_SAFE_INTEGER + 1],
    ['creditRemainder', '25'], ['creditRemainder', NaN], ['creditRemainder', Infinity],
    ['maintenanceShortfall', Number.MAX_SAFE_INTEGER + 1],
  ])('rejects invalid %s=%s', (key, amount) => {
    expect(() => GameSaveValidation.readGameSave({ ...validSave(), [key]: amount })).toThrow(key);
  });

  it('accepts JSON and unknown objects with crisis states and construction due between ticks', () => {
    const source = validSave();
    const input: unknown = source;
    const saved = GameSaveValidation.readGameSave(input);
    expect(saved).toStrictEqual(source);
    expect(GameSaveValidation.readGameSave(JSON.stringify(source))).toStrictEqual(source);
    expect(saved.colonies[0].stocks.population).toBe(30);
    expect(saved.colonies[0].buildings[1].completed).toBe(false);
    expect(saved.planets).not.toBe(source.planets);
    expect(saved.planets[1].resourses).not.toBe(source.planets[1].resourses);
    expect(saved.colonies[0].stocks).not.toBe(source.colonies[0].stocks);
    expect(saved.colonies[0].buildings[0]).not.toBe(source.colonies[0].buildings[0]);
  });

  it('accepts fractional game time, completed disabled production, and unused identifier gaps', () => {
    const source = validSave();
    source.gameTime = 102000.25;
    source.lastProductionTick = 102000;
    source.colonies[0].buildings[1].startedAt = 8191.9;
    source.colonies[0].buildings[1].completesAt = 8191.9 + 6000;
    source.colonies[0].buildings[1].completed = true;
    source.colonies[0].buildings[1].enabled = false;
    source.nextBuildingId = Number.MAX_SAFE_INTEGER;
    expect(GameSaveValidation.readGameSave(source)).toStrictEqual(source);
  });

  it('keeps only schema fields, never trusting injected computed values', () => {
    const source = validSave();
    Object.assign(source, {
      tabHidden: true, systemPaused: true,
      finances: { income: 999, incomeCentsPerStep: 999, maintenance: 999, balance: 999 },
      colonyFinances: [{ income: 999 }],
    });
    Object.assign(source.colonies[0], { income: 999, maintenance: 999, balance: 999 });
    Object.assign(source.colonies[0].stocks, { energy: Infinity, populationCapacity: -1 });
    Object.assign(source.colonies[0].buildings[0], {
      status: 'invalid', maintenancePerMinute: 999,
    });
    expect(GameSaveValidation.readGameSave(source)).toStrictEqual(validSave());
  });

  it.each([
    [2000, true],
    [8000, false],
  ] as const)(
    'accepts a historical %s ms construction duration with completed=%s',
    (duration, completed) => {
      const source = validSave();
      source.colonies[0].buildings[0].completesAt = 2000;
      const mine = source.colonies[0].buildings[1];
      mine.completesAt = mine.startedAt + duration;
      mine.completed = completed;
      expect(GameSaveValidation.readGameSave(JSON.stringify(source))).toStrictEqual(source);
    },
  );

  it.each([
    ['broken JSON', '{"version":', 'JSON'],
    ['null JSON', 'null', 'корень'],
    ['array JSON', '[]', 'корень'],
    ['non-object', false, 'корень'],
    ['missing version', {}, 'version'],
    ['string version', { version: '1' }, 'version'],
    ['unsupported version', { version: 4 }, 'не поддерживается'],
  ])('rejects %s', (_name, input: unknown, reason) => {
    expect(() => GameSaveValidation.readGameSave(input)).toThrow(`${reason}`);
  });

  it.each([
    'savedAt',
    'gameTime',
    'lastProductionTick',
    'credits',
    'creditRemainder',
    'maintenanceShortfall',
    'planets',
    'colonies',
    'nextBuildingId',
    'manualPaused',
  ])('requires %s', (key) => {
    const source = validSave();
    Reflect.deleteProperty(source, key);
    expect(() => GameSaveValidation.readGameSave(source)).toThrow(key);
  });

  const invalidCases: [string, (save: Fixture) => void, string][] = [
    [
      'invalid date',
      (save) => {
        save.savedAt = '2030-02-30T00:00:00.000Z';
      },
      'savedAt',
    ],
    ['wrong boolean', (save) => Object.assign(save, { manualPaused: 'false' }), 'manualPaused'],
    ['wrong numeric type', (save) => Object.assign(save, { credits: '100' }), 'credits'],
    [
      'non-finite credits',
      (save) => {
        save.credits = NaN;
      },
      'credits',
    ],
    [
      'negative credits',
      (save) => {
        save.credits = -1;
      },
      'credits',
    ],
    [
      'fractional population',
      (save) => {
        save.colonies[0].stocks.population = 1.5;
      },
      'population',
    ],
    [
      'negative water',
      (save) => {
        save.colonies[0].stocks.water = -1;
      },
      'stocks.water',
    ],
    [
      'non-finite stocks',
      (save) => {
        save.colonies[0].stocks.food = Infinity;
      },
      'stocks.food',
    ],
    [
      'excess deposits',
      (save) => {
        save.colonies[0].deposits.gas = 35001;
      },
      'deposits.gas',
    ],
    [
      'invalid abundance',
      (save) => {
        save.planets[1].resourses.water = 101;
      },
      'resourses.water',
    ],
    [
      'zero distance',
      (save) => {
        save.planets[1].distanceFromSun = 0;
      },
      'distanceFromSun',
    ],
    [
      'overflowing power',
      (save) => {
        save.planets[1].distanceFromSun = Number.MIN_VALUE;
      },
      'distanceFromSun',
    ],
    [
      'zero period',
      (save) => {
        save.planets[1].orbitalPeriod = 0;
      },
      'orbitalPeriod',
    ],
    [
      'invalid radius',
      (save) => {
        save.planets[1].radius = -1;
      },
      'radius',
    ],
    [
      'empty planets',
      (save) => {
        save.planets = [];
      },
      'planets',
    ],
    ['wrong array', (save) => Object.assign(save, { colonies: {} }), 'colonies'],
    [
      'negative game time',
      (save) => {
        save.gameTime = -1;
      },
      'gameTime',
    ],
    [
      'partial tick boundary',
      (save) => {
        save.lastProductionTick = 100001;
      },
      'lastProductionTick',
    ],
    [
      'future tick',
      (save) => {
        save.lastProductionTick = 102000;
      },
      'lastProductionTick',
    ],
    [
      'unprocessed ticks',
      (save) => {
        save.lastProductionTick = 98000;
      },
      'lastProductionTick',
    ],
    [
      'unknown building',
      (save) => Object.assign(save.colonies[0].buildings[1], { type: 'unknown' }),
      '.type',
    ],
    [
      'duplicate building id',
      (save) => {
        save.colonies[0].buildings[1].id = 1;
      },
      'buildings[1].id',
    ],
    [
      'invalid building id',
      (save) => {
        save.colonies[0].buildings[1].id = 0;
      },
      'buildings[1].id',
    ],
    [
      'outside map',
      (save) => {
        save.colonies[0].buildings[1].tile = 81;
      },
      'buildings[1].tile',
    ],
    [
      'fractional tile',
      (save) => {
        save.colonies[0].buildings[1].tile = 1.5;
      },
      'buildings[1].tile',
    ],
    [
      'overlapping buildings',
      (save) => {
        save.colonies[0].buildings[1].tile = 0;
      },
      'buildings[1].tile',
    ],
    [
      'future construction',
      (save) => {
        save.colonies[0].buildings[1].startedAt = 102000;
        save.colonies[0].buildings[1].completesAt = 108000;
      },
      '.startedAt',
    ],
    [
      'zero duration',
      (save) => {
        const building = save.colonies[0].buildings[1];
        building.completesAt = building.startedAt;
      },
      '.completesAt',
    ],
    [
      'negative duration',
      (save) => {
        const building = save.colonies[0].buildings[1];
        building.completesAt = building.startedAt - 1;
      },
      '.completesAt',
    ],
    [
      'missed completion',
      (save) => {
        save.colonies[0].buildings[1].startedAt = 94000;
        save.colonies[0].buildings[1].completesAt = 100000;
      },
      '.completed',
    ],
    [
      'early completion',
      (save) => {
        save.colonies[0].buildings[1].completed = true;
      },
      '.completed',
    ],
    [
      'disabled construction',
      (save) => {
        save.colonies[0].buildings[1].enabled = false;
      },
      '.enabled',
    ],
    [
      'disabled base',
      (save) => {
        save.colonies[0].buildings[0].enabled = false;
      },
      '.enabled',
    ],
    [
      'missing base',
      (save) => {
        save.colonies[0].buildings = save.colonies[0].buildings.slice(1);
      },
      '.buildings',
    ],
    [
      'duplicate base',
      (save) => {
        save.colonies[0].buildings.push({ ...save.colonies[0].buildings[0], id: 9, tile: 2 });
      },
      '.buildings',
    ],
    [
      'construction before the base completion tick',
      (save) => {
        save.colonies[0].buildings[0].startedAt = 0.25;
        save.colonies[0].buildings[0].completesAt = 4000.25;
        save.colonies[0].buildings[1].startedAt = 5000;
        save.colonies[0].buildings[1].completesAt = 11000;
        save.colonies[0].buildings[1].completed = true;
      },
      '.buildings',
    ],
    [
      'disabled housing',
      (save) => {
        Object.assign(save.colonies[0].buildings[1], {
          type: BuildingType.Housing,
          startedAt: 4000,
          completesAt: 10000,
          completed: true,
          enabled: false,
        });
      },
      '.enabled',
    ],
    [
      'missing planet',
      (save) => {
        save.colonies[0].planetId = 'missing';
      },
      '.planetId',
    ],
    [
      'reserved identifier',
      (save) => {
        save.planets[0] = { ...save.planets[0], id: '__proto__' };
      },
      '.id',
    ],
    [
      'duplicate planet',
      (save) => {
        save.planets.push({ ...save.planets[0] });
      },
      'planets',
    ],
    [
      'duplicate colony',
      (save) => {
        save.colonies.push({ ...save.colonies[0] });
      },
      '.planetId',
    ],
    [
      'global duplicate building',
      (save) => {
        save.colonies.push({ ...save.colonies[0], planetId: save.planets[0].id });
      },
      '.buildings[0].id',
    ],
    [
      'unsafe next id',
      (save) => {
        save.nextBuildingId = Number.MAX_SAFE_INTEGER + 1;
      },
      'nextBuildingId',
    ],
    [
      'fractional next id',
      (save) => {
        save.nextBuildingId = 9.5;
      },
      'nextBuildingId',
    ],
    [
      'reused next id',
      (save) => {
        save.nextBuildingId = 8;
      },
      'nextBuildingId',
    ],
  ];

  it.each(invalidCases)('rejects %s with a field-specific reason', (_name, change, reason) => {
    const source = validSave();
    change(source);
    expect(() => GameSaveValidation.readGameSave(source)).toThrow(reason);
  });
});
