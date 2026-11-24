import { effect } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { foodEconomy, waterEconomy } from '../../planet/domain/colony-simulation';
import { BuildingStatus } from '../../planet/models/enum/building-status';
import { BuildingType } from '../../planet/models/enum/building-type';
import { GameSave } from '../models/interface/game-save';
import { GameSessionService } from '../../game-session/services/game-session.service';
import { GAME_SAVE_STORAGE_KEY, GameSaveStorageService } from './game-save-storage.service';
import { GameSaveService } from './game-save.service';
import { GameSaveFileService } from './game-save-file.service';

describe('GameSaveService', () => {
  let game: GameSessionService;
  let storage: GameSaveStorageService;
  let saves: GameSaveService;
  let files: GameSaveFileService;
  let delayedTime = 0;

  function start(manualPaused = false): void {
    game.setManualPaused(manualPaused);
    saves.startSession();
    game.setSystemPaused(false);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    delayedTime = 0;
    const now = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => now() + delayedTime);
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
    TestBed.configureTestingModule({});
    game = TestBed.inject(GameSessionService);
    storage = TestBed.inject(GameSaveStorageService);
    saves = TestBed.inject(GameSaveService);
    files = TestBed.inject(GameSaveFileService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
  });

  it('writes only at 30-second checks when game time alone has changed', () => {
    const write = vi.spyOn(storage, 'write');
    start();
    vi.advanceTimersByTime(29999);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledOnce();
    expect(storage.read()).toMatchObject({
      gameTime: 30000,
      lastProductionTick: 30000,
      colonies: [],
    });
    vi.advanceTimersByTime(30000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(storage.read()?.gameTime).toBe(60000);
    expect(saves.lastSavedAt()).toBe(storage.read()?.savedAt);
  });

  it('does not add production steps while synchronizing the save', () => {
    start();
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    game.build(planet, BuildingType.Minerals, 1);
    const initial = game.colonies()[planet.id];
    const amount = game.yieldFor(planet, game.definition(BuildingType.Minerals));
    vi.advanceTimersByTime(26000);
    const saved = storage.read();
    expect(saved?.lastProductionTick).toBe(30000);
    expect(saved?.colonies[0].stocks.minerals).toBe(initial.stocks.minerals + 10 * amount);
    expect(saved?.colonies[0].deposits.minerals).toBe(initial.deposits.minerals - 10 * amount);
  });

  it('restarts the notification timeout after another automatic save with the same message', () => {
    start(true);
    game.openPlanet(game.planets()[0]);
    vi.advanceTimersByTime(30000);
    expect(saves.message()).toContain('сохранена автоматически');
    vi.advanceTimersByTime(2000);
    game.openPlanet(game.planets()[1]);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    const savedAt = saves.lastSavedAt();
    vi.advanceTimersByTime(3999);
    expect(saves.message()).toContain('сохранена автоматически');
    vi.advanceTimersByTime(1);
    expect(saves.message()).toBeNull();
    expect(saves.lastSavedAt()).toBe(savedAt);
    expect(storage.read()?.savedAt).toBe(savedAt);
  });

  it.each(['save', 'error'])('does not let an autosave timeout dismiss a later %s result', (result) => {
    start();
    vi.advanceTimersByTime(30000);
    expect(saves.message()).toContain('сохранена автоматически');
    vi.advanceTimersByTime(2000);
    if (result === 'save') {
      saves.save();
    } else {
      vi.spyOn(storage, 'write').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      saves.save();
    }
    vi.advanceTimersByTime(4000);
    if (result === 'save') {
      expect(saves.message()).toBe('Игра сохранена.');
    } else {
      expect(saves.message()).toBeNull();
      expect(saves.error()).toBe('Storage unavailable');
    }
  });

  it('ignores wall time and new object references on pause, but saves a real paused change', () => {
    const write = vi.spyOn(storage, 'write');
    start(true);
    vi.advanceTimersByTime(90000);
    game.setManualPaused(true);
    expect(write).not.toHaveBeenCalled();
    saves.save();
    const date = saves.lastSavedAt();
    expect(write).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60000);
    expect(write).toHaveBeenCalledOnce();
    expect(saves.lastSavedAt()).toBe(date);
    game.openPlanet(game.planets()[1]);
    vi.advanceTimersByTime(30000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(storage.read()?.gameTime).toBe(0);
    expect(storage.read()?.colonies).toHaveLength(1);
  });

  it('saves on hide after active time has been sampled and automatic pause applied', () => {
    const write = vi.spyOn(storage, 'write');
    start();
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(1000);
    delayedTime += 4500;
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    write.mockImplementation((saved) => {
      expect(game.tabHidden()).toBe(true);
      expect(game.clock()).toBe(5500);
      expect(saved).toMatchObject({ gameTime: 5500, lastProductionTick: 4000 });
      expect(saved.colonies[0].buildings[0].completed).toBe(true);
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(write).toHaveBeenCalledOnce();
    expect(saves.error()).toBeNull();
    vi.advanceTimersByTime(90000);
    expect(write).toHaveBeenCalledOnce();
    expect(game.clock()).toBe(5500);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(write).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1500);
    game.tick();
    expect(game.clock()).toBe(7000);
  });

  it.each([null, '{"version":broken}'])(
    'does not overwrite %s before startup, even on hide',
    (raw) => {
      if (raw !== null) localStorage.setItem(GAME_SAVE_STORAGE_KEY, raw);
      const write = vi.spyOn(storage, 'write');
      vi.advanceTimersByTime(90000);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(write).not.toHaveBeenCalled();
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
      expect(game.clock()).toBe(0);
    },
  );

  it('skips service stops and resumes checks without counting time spent stopped', () => {
    const write = vi.spyOn(storage, 'write');
    start();
    vi.advanceTimersByTime(1000);
    game.setSystemPaused(true);
    vi.advanceTimersByTime(60000);
    expect(write).not.toHaveBeenCalled();
    expect(game.clock()).toBe(1000);
    game.setSystemPaused(false);
    vi.advanceTimersByTime(29000);
    expect(write).toHaveBeenCalledOnce();
    expect(storage.read()?.gameTime).toBe(30000);
  });

  it('keeps failed changes dirty, deduplicates errors, and reports recovery even on pause', () => {
    start(true);
    saves.save();
    const previousDate = saves.lastSavedAt();
    const previous = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    const seen: (string | null)[] = [];
    TestBed.runInInjectionContext(() =>
      effect(() => {
        seen.push(saves.error());
      }),
    );
    TestBed.tick();
    game.openPlanet(game.planets()[1]);
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    vi.advanceTimersByTime(30000);
    TestBed.tick();
    const error = saves.error();
    expect(error).toContain('превышена квота');
    expect(saves.lastSavedAt()).toBe(previousDate);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(previous);
    vi.advanceTimersByTime(60000);
    TestBed.tick();
    expect(failure).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([null, error]);
    failure.mockRestore();
    const recovered = vi.spyOn(Storage.prototype, 'setItem');
    vi.advanceTimersByTime(30000);
    TestBed.tick();
    expect(recovered).toHaveBeenCalledOnce();
    expect(saves.error()).toBeNull();
    expect(seen).toEqual([null, error, null]);
    expect(saves.lastSavedAt()).not.toBe(previousDate);
    expect(saves.lastSavedAt()).toBe(storage.read()?.savedAt);
    expect(saves.message()).toContain('сохранена автоматически');
    vi.advanceTimersByTime(30000);
    expect(recovered).toHaveBeenCalledOnce();
  });

  it('adopts a loaded paused snapshot as the unchanged baseline', () => {
    start(true);
    game.openPlanet(game.planets()[1]);
    saves.save();
    const saved = storage.read();
    const write = vi.spyOn(storage, 'write');
    game.openPlanet(game.planets()[0]);
    saves.load();
    vi.advanceTimersByTime(60000);
    expect(write).not.toHaveBeenCalled();
    expect(game.createSave(new Date(saved!.savedAt))).toEqual(saved);
  });

  it('does not automatically overwrite unreadable data after a failed manual load', () => {
    start();
    localStorage.setItem(GAME_SAVE_STORAGE_KEY, '{"version":broken}');
    saves.load();
    vi.advanceTimersByTime(60000);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe('{"version":broken}');
    expect(saves.error()).toContain('Автосохранение приостановлено');
    saves.save();
    expect(saves.error()).toBeNull();
    expect(storage.read()?.gameTime).toBe(60000);
  });

  it('resumes saving if a retry confirms that the unreadable record is now absent', () => {
    start();
    localStorage.setItem(GAME_SAVE_STORAGE_KEY, '{"version":broken}');
    saves.load();
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
    saves.load();
    expect(saves.error()).toBeNull();
    vi.advanceTimersByTime(30000);
    expect(storage.read()?.gameTime).toBe(30000);
    expect(saves.message()).toContain('сохранена автоматически');
  });

  it.each(['food', 'water', 'energy'])(
    'round-trips two active colonies through local storage during a %s crisis without replaying production',
    (crisis) => {
      const date = new Date();
      const initial = game.createSave(date);
      const planet = initial.planets[1];
      const other = initial.planets[0];
      const types = [
        BuildingType.Base,
        BuildingType.Housing,
        BuildingType.Power,
        BuildingType.Minerals,
        BuildingType.Gas,
        BuildingType.Farm,
        BuildingType.Water,
      ];
      const source: GameSave = {
        ...initial,
        gameTime: 13000,
        lastProductionTick: 12000,
        nextBuildingId: 20,
        credits: 750,
        colonies: [
          {
            planetId: planet.id,
            stocks: {
              minerals: 50,
              water: crisis === 'water' ? 0 : 100,
              food: crisis === 'food' ? 0 : 100,
              gas: 10,
              population: 25,
            },
            deposits: { minerals: 1000, gas: 1000 },
            buildings: types.map((type, index) => {
              const startedAt =
                type === BuildingType.Base ? 0 : type === BuildingType.Water ? 12000 : 4000;
              return {
                id: index + 1,
                type,
                tile: index,
                startedAt,
                completesAt: startedAt + game.definition(type).buildTime * 1000,
                completed: type !== BuildingType.Water,
                enabled:
                  type !== BuildingType.Gas &&
                  !(type === BuildingType.Farm && crisis === 'food') &&
                  !(type === BuildingType.Power && crisis === 'energy'),
              };
            }),
          },
          {
            planetId: other.id,
            stocks: { minerals: 70, water: 120, food: 100, gas: 20, population: 5 },
            deposits: { minerals: 2000, gas: 1000 },
            buildings: [BuildingType.Base, BuildingType.Minerals].map((type, index) => ({
              id: index + 11,
              type,
              tile: index,
              startedAt: index === 0 ? 0 : 4000,
              completesAt: (index === 0 ? 0 : 4000) + game.definition(type).buildTime * 1000,
              completed: true,
              enabled: true,
            })),
          },
        ],
      };
      game.restoreSave(source);
      start();
      const colony = game.colonies()[planet.id];
      if (crisis === 'food') expect(foodEconomy(colony).balance).toBeLessThan(0);
      if (crisis === 'water') expect(waterEconomy(colony).populationSupplied).toBe(false);
      if (crisis === 'energy') {
        expect(colony.stocks.energy).toBeLessThan(0);
        expect(colony.buildings[5].status).toBe(BuildingStatus.NoEnergy);
      }
      expect(colony.buildings[4].status).toBe(BuildingStatus.Disabled);
      saves.save();
      expect(saves.error()).toBeNull();
      expect(storage.read()).toEqual(source);
      const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
      vi.advanceTimersByTime(1000);
      game.tick();
      const firstStep = game.createSave(date);
      if (crisis !== 'energy') expect(firstStep.colonies[0].stocks.population).toBe(24);
      expect(firstStep.colonies[1].stocks.minerals).toBe(
        source.colonies[1].stocks.minerals +
          game.yieldFor(other, game.definition(BuildingType.Minerals)),
      );
      vi.advanceTimersByTime(5000);
      const expected = game.createSave(date);
      expect(expected.colonies[0].buildings[6].completed).toBe(true);
      game.setManualPaused(true);
      delayedTime += 86400000;
      vi.setSystemTime(new Date('2040-01-01T00:00:00.000Z'));
      saves.load();
      expect(saves.error()).toBeNull();
      game.tick();
      game.tick();
      expect(game.createSave(date)).toEqual(source);
      expect(game.colonies()[planet.id].buildings[4].status).toBe(BuildingStatus.Disabled);
      vi.advanceTimersByTime(999);
      game.tick();
      expect(game.colonies()[other.id].stocks.minerals).toBe(source.colonies[1].stocks.minerals);
      expect(game.colonies()[planet.id].stocks.population).toBe(25);
      vi.advanceTimersByTime(1);
      game.tick();
      expect(game.createSave(date)).toEqual(firstStep);
      vi.advanceTimersByTime(5000);
      expect(game.createSave(date)).toEqual(expected);
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    },
  );

  it('preserves a manually paused partial step through hiding, local loading, and returning to the tab', () => {
    const write = vi.spyOn(storage, 'write');
    start();
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(1000);
    game.setManualPaused(true);
    saves.save();
    const saved = storage.read();
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);
    saves.load();
    expect(saves.error()).toBeNull();
    expect(game.manualPaused()).toBe(true);
    expect(game.tabHidden()).toBe(true);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60000);
    expect(game.tabHidden()).toBe(false);
    expect(game.manualPaused()).toBe(true);
    expect(game.createSave(new Date(saved!.savedAt))).toEqual(saved);
    expect(write).toHaveBeenCalledOnce();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    game.setManualPaused(false);
    vi.advanceTimersByTime(2999);
    game.tick();
    expect(game.colonies()[planet.id].buildings[0].completed).toBe(false);
    vi.advanceTimersByTime(1);
    game.tick();
    expect(game.clock()).toBe(4000);
    expect(game.colonies()[planet.id].stocks.population).toBe(5);
  });

  it('exports a synchronized snapshot without accessing unavailable localStorage', () => {
    start();
    game.openPlanet(game.planets()[1]);
    game.build(game.planets()[1], BuildingType.Base, 0);
    vi.advanceTimersByTime(1500);
    const download = vi.spyOn(files, 'exportSave').mockImplementation(() => {});
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    saves.exportSave();
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][0]).toMatchObject({
      gameTime: 1500,
      lastProductionTick: 0,
    });
    expect(download.mock.calls[0][0].colonies[0].buildings[0].completed).toBe(false);
    expect(saves.lastSavedAt()).toBeNull();
    expect(saves.fileError()).toBeNull();
    expect(saves.fileMessage()).toContain('подготовлен');
  });

  it('round-trips an exported session only after confirmation and excludes all import waiting time', async () => {
    start();
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(5000);
    game.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(4000);
    const download = vi.spyOn(files, 'exportSave').mockImplementation(() => {});
    saves.exportSave();
    const exported = download.mock.calls[0][0];
    expect(exported.gameTime).toBe(9000);
    vi.advanceTimersByTime(10000);
    saves.save();
    const before = game.colonies();
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    vi.spyOn(files, 'read').mockResolvedValue(JSON.stringify(exported));
    expect(saves.beginImport()).toBe(true);
    await saves.readImport(new File(['exported'], 'roundtrip.json'));
    expect(saves.importPreview()?.fileName).toBe('roundtrip.json');
    vi.advanceTimersByTime(60000);
    expect(game.clock()).toBe(19000);
    expect(game.colonies()).toBe(before);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    saves.confirmImport();
    expect(game.createSave(new Date(exported.savedAt))).toEqual(exported);
    expect(game.systemPaused()).toBe(false);
    expect(saves.importBusy()).toBe(false);
    expect(saves.fileMessage()).toContain('Импорт выполнен');
    expect(saves.message()).toContain('сохранена локально');
    const stored = storage.read();
    expect(stored).toEqual({ ...exported, savedAt: stored?.savedAt });
    expect(saves.lastSavedAt()).toBe(stored?.savedAt);
    const minerals = game.colonies()[planet.id].stocks.minerals;
    const production = game.yieldFor(planet, game.definition(BuildingType.Minerals));
    vi.advanceTimersByTime(1000);
    expect(game.clock()).toBe(10000);
    expect(game.colonies()[planet.id].buildings[1].completed).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(game.colonies()[planet.id].buildings[1].completed).toBe(true);
    expect(game.colonies()[planet.id].stocks.minerals).toBe(minerals);
    vi.advanceTimersByTime(2000);
    expect(game.colonies()[planet.id].stocks.minerals).toBe(minerals + production);
  });

  it('cancels replacement without changing the session, local save, or manual pause', async () => {
    start(true);
    game.openPlanet(game.planets()[1]);
    saves.save();
    const before = game.createSave(new Date());
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    vi.spyOn(files, 'read').mockResolvedValue(JSON.stringify({ ...before, credits: 1000 }));
    saves.beginImport();
    await saves.readImport(new File(['candidate'], 'candidate.json'));
    vi.advanceTimersByTime(60000);
    saves.cancelImport();
    vi.advanceTimersByTime(30000);
    expect(game.createSave(new Date(before.savedAt))).toEqual(before);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(game.systemPaused()).toBe(false);
    expect(game.manualPaused()).toBe(true);
    expect(saves.importPreview()).toBeNull();
  });

  it.each([
    ['{"version":broken}', 'JSON'],
    ['{"version":2}', 'не поддерживается'],
    ['invalid-fields', 'credits'],
  ])('rejects invalid import %s without replacing or saving anything', async (text, reason) => {
    start(true);
    saves.save();
    const before = game.createSave(new Date());
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    const input = text === 'invalid-fields' ? JSON.stringify({ ...before, credits: -1 }) : text;
    vi.spyOn(files, 'read').mockResolvedValue(input);
    const restore = vi.spyOn(game, 'restoreSave');
    saves.beginImport();
    await saves.readImport(new File([input], 'broken.json'));
    vi.advanceTimersByTime(60000);
    expect(saves.fileError()).toContain(reason);
    expect(saves.importPreview()).toBeNull();
    expect(saves.importBusy()).toBe(false);
    expect(game.systemPaused()).toBe(false);
    expect(restore).not.toHaveBeenCalled();
    expect(game.createSave(new Date(before.savedAt))).toEqual(before);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
  });

  it.each(['QuotaExceededError', 'SecurityError'])(
    'keeps a successful import and retries its local write after %s',
    async (name) => {
      start(true);
      saves.save();
      const previousDate = saves.lastSavedAt();
      const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
      const imported = { ...game.createSave(new Date()), gameTime: 1500, credits: 1234 };
      vi.spyOn(files, 'read').mockResolvedValue(JSON.stringify(imported));
      saves.beginImport();
      await saves.readImport(new File(['valid'], 'valid.json'));
      const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Write blocked', name);
      });
      vi.advanceTimersByTime(60000);
      saves.confirmImport();
      expect(saves.fileError()).toBeNull();
      expect(saves.fileMessage()).toContain('Импорт выполнен');
      expect(saves.error()).toContain('Локальная запись после импорта не удалась');
      expect(saves.message()).toBeNull();
      expect(saves.lastSavedAt()).toBe(previousDate);
      expect(game.createSave(new Date(imported.savedAt))).toEqual(imported);
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
      expect(game.systemPaused()).toBe(false);
      failure.mockRestore();
      vi.advanceTimersByTime(30000);
      expect(game.clock()).toBe(1500);
      expect(storage.read()?.credits).toBe(1234);
      expect(saves.error()).toBeNull();
      expect(saves.lastSavedAt()).not.toBe(previousDate);
      expect(saves.fileMessage()).toContain('Импорт выполнен');
    },
  );

  it.each(['cancel', 'destroy'])(
    'aborts reading on %s and ignores its late completion',
    async (action) => {
      start(true);
      const before = game.createSave(new Date());
      let finish: ((text: string) => void) | undefined;
      let signal: AbortSignal | undefined;
      vi.spyOn(files, 'read').mockImplementation((_file, abortSignal) => {
        signal = abortSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      saves.beginImport();
      const pending = saves.readImport(new File(['pending'], 'pending.json'));
      if (action === 'cancel') saves.cancelImport();
      else TestBed.resetTestingModule();
      expect(signal?.aborted).toBe(true);
      finish!(JSON.stringify({ ...before, credits: 1 }));
      await pending;
      expect(saves.importPreview()).toBeNull();
      expect(saves.fileError()).toBeNull();
      expect(game.createSave(new Date(before.savedAt))).toEqual(before);
      expect(game.systemPaused()).toBe(false);
    },
  );

  it('does not create duplicate timers and releases both clock and saving resources', () => {
    start();
    expect(vi.getTimerCount()).toBe(2);
    saves.startSession();
    expect(vi.getTimerCount()).toBe(2);
    game.openPlanet(game.planets()[1]);
    const remove = vi.spyOn(document, 'removeEventListener');
    const write = vi.spyOn(storage, 'write');
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove.mock.calls.filter(([name]) => name === 'visibilitychange')).toHaveLength(2);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(90000);
    expect(write).not.toHaveBeenCalled();
  });
});
