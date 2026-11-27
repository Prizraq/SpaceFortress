import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildError } from '../../../planet/models/enum/build-error';
import { BuildingType } from '../../../planet/models/enum/building-type';
import { GameSessionService } from '../../../game-session/services/game-session.service';
import {
  GAME_SAVE_STORAGE_KEY,
  GameSaveStorageService,
} from '../../services/game-save-storage.service';
import { GameStartComponent } from './game-start.component';

describe('GameStartComponent', () => {
  let fixture: ComponentFixture<GameStartComponent>;
  let root: HTMLElement;
  let game: GameSessionService;
  let storage: GameSaveStorageService;
  const started = vi.fn<() => void>();

  function render(): void {
    fixture = TestBed.createComponent(GameStartComponent);
    root = fixture.nativeElement;
    fixture.componentInstance.started.subscribe(started);
    fixture.detectChanges();
  }

  function click(selector: string): void {
    root.querySelector<HTMLButtonElement>(selector)!.click();
    fixture.detectChanges();
  }

  function savedProgress(manualPaused = false) {
    game.setSystemPaused(false);
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(5000);
    game.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(4000);
    game.setManualPaused(manualPaused);
    const saved = game.createSave(new Date());
    storage.write(saved);
    game.setSystemPaused(true);
    game.resetSession();
    return saved;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
    started.mockReset();
    await TestBed.configureTestingModule({ imports: [GameStartComponent] }).compileComponents();
    game = TestBed.inject(GameSessionService);
    storage = TestBed.inject(GameSaveStorageService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
  });

  it('keeps time stopped before storage access and throughout the menu, then starts at zero', () => {
    const read = vi.spyOn(storage, 'readRaw').mockImplementationOnce(() => {
      expect(game.systemPaused()).toBe(true);
      vi.advanceTimersByTime(60000);
      expect(game.clock()).toBe(0);
      return null;
    });
    render();
    expect(read).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60000);
    expect(game.clock()).toBe(0);
    expect(started).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLButtonElement>('[data-continue-game]')!.disabled).toBe(true);
    expect(game.build(game.planets()[1], BuildingType.Base, 0)).toBe(BuildError.Paused);
    click('[data-new-game]');
    expect(root.querySelector('[data-confirm-new-game]')).toBeNull();
    expect(started).toHaveBeenCalledOnce();
    expect(game.systemPaused()).toBe(false);
    expect(game.createSave(new Date())).toMatchObject({
      gameTime: 0,
      lastProductionTick: 0,
      credits: 2000,
      colonies: [],
      nextBuildingId: 1,
    });
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(1500);
    game.tick();
    expect(game.clock()).toBe(1500);
  });

  it.each([false, true])(
    'restores the whole session before releasing startup with manual pause %s',
    (manual) => {
      const saved = savedProgress(manual);
      render();
      const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
      expect(root.querySelector('time')?.dateTime).toBe(saved.savedAt);
      vi.advanceTimersByTime(3600000);
      vi.setSystemTime(new Date('2040-01-01'));
      expect(game.clock()).toBe(0);
      expect(game.colonies()).toEqual({});
      started.mockImplementationOnce(() => {
        expect(game.systemPaused()).toBe(false);
        expect(game.createSave(new Date(saved.savedAt))).toEqual(saved);
      });
      click('[data-continue-game]');
      expect(started).toHaveBeenCalledOnce();
      expect(root.querySelector('[role="alert"]')).toBeNull();
      expect(game.manualPaused()).toBe(manual);
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
      vi.advanceTimersByTime(1000);
      game.tick();
      expect(game.clock()).toBe(saved.gameTime + (manual ? 0 : 1000));
      const after = game.createSave(new Date());
      expect(after.lastProductionTick).toBe(manual ? saved.lastProductionTick : 10000);
      expect(after.colonies[0].buildings[1].completed).toBe(false);
    },
  );

  it('cancels a new game without clearing progress, resuming time, or preventing continuation', () => {
    const saved = savedProgress();
    render();
    const current = game.colonies();
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    click('[data-new-game]');
    expect(root.querySelector('[data-confirm-new-game]')).not.toBeNull();
    vi.advanceTimersByTime(60000);
    click('[data-cancel-new-game]');
    expect(started).not.toHaveBeenCalled();
    expect(game.clock()).toBe(0);
    expect(game.systemPaused()).toBe(true);
    expect(game.colonies()).toBe(current);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    click('[data-continue-game]');
    expect(game.createSave(new Date(saved.savedAt))).toEqual(saved);
  });

  it('starts fresh only after confirmation and preserves the previous local save', () => {
    savedProgress(true);
    render();
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    const write = vi.spyOn(storage, 'write');
    const before = game.planets();
    click('[data-new-game]');
    expect(game.systemPaused()).toBe(true);
    click('[data-confirm-new-game]');
    expect(started).toHaveBeenCalledOnce();
    expect(game.planets()).not.toBe(before);
    expect(game.createSave(new Date())).toMatchObject({
      gameTime: 0,
      lastProductionTick: 0,
      credits: 2000,
      colonies: [],
      nextBuildingId: 1,
      manualPaused: false,
    });
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    expect(game.colonies()[planet.id].buildings[0].id).toBe(1);
  });

  it('only replaces the old save automatically after confirmation and a changed running session', () => {
    savedProgress();
    render();
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    vi.advanceTimersByTime(60000);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    click('[data-new-game]');
    click('[data-confirm-new-game]');
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    vi.advanceTimersByTime(29999);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    vi.advanceTimersByTime(1);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBe(raw);
    expect(storage.read()).toMatchObject({
      gameTime: 30000,
      lastProductionTick: 30000,
      credits: 2000,
      colonies: [],
      manualPaused: false,
    });
  });

  it('does not rewrite a continued paused snapshot simply because menu or wall time passed', () => {
    const saved = savedProgress(true);
    render();
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    const write = vi.spyOn(storage, 'write');
    vi.advanceTimersByTime(60000);
    click('[data-continue-game]');
    vi.advanceTimersByTime(60000);
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(game.createSave(new Date(saved.savedAt))).toEqual(saved);
  });

  it.each([
    ['{"version":broken}\noriginal text', 'JSON'],
    ['{"version":4}', 'не поддерживается'],
    ['', 'JSON'],
  ])(
    'retains and offers the exact invalid input %s for download without parsing it',
    (raw, reason) => {
      localStorage.setItem(GAME_SAVE_STORAGE_KEY, raw);
      const download = vi.spyOn(storage, 'downloadRaw').mockImplementation(() => {});
      render();
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(reason);
      expect(root.querySelector<HTMLButtonElement>('[data-continue-game]')!.disabled).toBe(true);
      vi.advanceTimersByTime(60000);
      expect(game.clock()).toBe(0);
      click('[data-download-original]');
      expect(download).toHaveBeenCalledWith(raw);
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
      expect(started).not.toHaveBeenCalled();
      click('[data-new-game]');
      expect(root.querySelector('[data-confirm-new-game]')).not.toBeNull();
      click('[data-confirm-new-game]');
      expect(game.clock()).toBe(0);
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    },
  );

  it('shows inaccessible storage, requires confirmation, and allows a non-destructive retry', () => {
    vi.spyOn(storage, 'readRaw').mockImplementationOnce(() => {
      throw new Error('localStorage недоступно');
    });
    render();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('localStorage недоступно');
    expect(root.querySelector('[data-download-original]')).toBeNull();
    expect(game.systemPaused()).toBe(true);
    click('[data-new-game]');
    expect(root.querySelector('[data-confirm-new-game]')).not.toBeNull();
    click('[data-cancel-new-game]');
    click('[data-retry-startup]');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(game.clock()).toBe(0);
    expect(started).not.toHaveBeenCalled();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });
});
