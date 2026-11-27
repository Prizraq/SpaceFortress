import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanetService } from '../../shared/services/planet.service';
import { GAME_SAVE_VERSION, GameSave } from '../models/interface/game-save';
import { GAME_SAVE_STORAGE_KEY, GameSaveStorageService } from './game-save-storage.service';

function snapshot(): GameSave {
  return {
    version: GAME_SAVE_VERSION,
    savedAt: '2030-01-01T00:00:00.000Z',
    gameTime: 1500,
    lastProductionTick: 0,
    credits: 2000,
    creditRemainder: 0,
    maintenanceShortfall: 0,
    planets: new PlanetService().getPlanets(),
    colonies: [],
    nextBuildingId: 1,
    manualPaused: false,
  };
}

describe('GameSaveStorageService', () => {
  let storage: GameSaveStorageService;

  beforeEach(() => {
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
    TestBed.configureTestingModule({});
    storage = TestBed.inject(GameSaveStorageService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
  });

  it('returns null for an absent save without writing anything', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(storage.read()).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it('writes JSON and reads an independently validated snapshot', () => {
    const source = snapshot();
    storage.write(source);
    expect(JSON.parse(localStorage.getItem(GAME_SAVE_STORAGE_KEY)!)).toEqual(source);
    const restored = storage.read();
    expect(restored).toEqual(source);
    expect(restored?.planets).not.toBe(source.planets);
  });

  it.each([
    ['broken JSON', '{"version":', 'JSON'],
    ['unsupported version', '{"version":4}', 'не поддерживается'],
    ['invalid fields', JSON.stringify({ ...snapshot(), gameTime: -1 }), 'gameTime'],
  ])('rejects %s without deleting or overwriting it', (_name, raw, reason) => {
    localStorage.setItem(GAME_SAVE_STORAGE_KEY, raw);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(() => storage.read()).toThrow(reason);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects an invalid outgoing snapshot before replacing the previous save', () => {
    storage.write(snapshot());
    const previous = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(() => storage.write({ ...snapshot(), nextBuildingId: 0 })).toThrow('nextBuildingId');
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(previous);
  });

  it('reports an inaccessible localStorage getter for both reading and writing', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    expect(() => storage.read()).toThrow('localStorage недоступно');
    expect(() => storage.write(snapshot())).toThrow('localStorage недоступно');
  });

  it('reports getItem failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    expect(() => storage.read()).toThrow('Не удалось прочитать сохранение');
  });

  it.each([
    ['QuotaExceededError', 'превышена квота'],
    ['SecurityError', 'localStorage недоступно'],
  ])('reports %s without replacing the existing save', (name, reason) => {
    storage.write(snapshot());
    const previous = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage rejected write', name);
    });
    expect(() => storage.write({ ...snapshot(), credits: 1000 })).toThrow(reason);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(previous);
  });

  it('downloads the untouched malformed text and releases backup URLs on replacement and destruction', async () => {
    const raw = '{"version":broken}\noriginal text';
    const create = vi
      .fn<(blob: Blob | MediaSource) => string>()
      .mockReturnValueOnce('blob:original-one')
      .mockReturnValueOnce('blob:original-two');
    const revoke = vi.fn<(url: string) => void>();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = create;
        static override revokeObjectURL = revoke;
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe('space-fortress-save-original.json');
    });
    localStorage.setItem(GAME_SAVE_STORAGE_KEY, raw);
    storage.downloadRaw(storage.readRaw()!);
    expect(click).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error('Expected the original text as a Blob');
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toBe(raw);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    storage.downloadRaw(raw);
    expect(revoke).toHaveBeenCalledWith('blob:original-one');
    TestBed.resetTestingModule();
    expect(revoke).toHaveBeenCalledWith('blob:original-two');
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
