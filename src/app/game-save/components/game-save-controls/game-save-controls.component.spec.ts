import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingType } from '../../../planet/models/enum/building-type';
import { GameSessionService } from '../../../game-session/services/game-session.service';
import { GameSaveService } from '../../services/game-save.service';
import { GameSaveFileService } from '../../services/game-save-file.service';
import {
  GAME_SAVE_STORAGE_KEY,
  GameSaveStorageService,
} from '../../services/game-save-storage.service';
import { GameSaveControlsComponent } from './game-save-controls.component';

describe('GameSaveControlsComponent', () => {
  let fixture: ComponentFixture<GameSaveControlsComponent>;
  let root: HTMLElement;
  let game: GameSessionService;
  let storage: GameSaveStorageService;
  let files: GameSaveFileService;

  function render(): void {
    fixture = TestBed.createComponent(GameSaveControlsComponent);
    root = fixture.nativeElement;
    fixture.detectChanges();
  }

  function click(selector: string): void {
    const button = root.querySelector<HTMLButtonElement>(selector)!;
    if (button.closest<HTMLElement>('#game-menu')?.hidden) {
      root.querySelector<HTMLButtonElement>('[data-game-menu-toggle]')!.click();
      fixture.detectChanges();
    }
    button.click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
    await TestBed.configureTestingModule({
      imports: [GameSaveControlsComponent],
    }).compileComponents();
    game = TestBed.inject(GameSessionService);
    game.setSystemPaused(false);
    TestBed.inject(GameSaveService).startSession();
    storage = TestBed.inject(GameSaveStorageService);
    files = TestBed.inject(GameSaveFileService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
  });

  it('opens the session actions and closes them on outside click or Escape, restoring focus', () => {
    render();
    const toggle = root.querySelector<HTMLButtonElement>('[data-game-menu-toggle]')!;
    const menu = root.querySelector<HTMLElement>('#game-menu')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);
    click('[data-game-menu-toggle]');
    expect(menu.hidden).toBe(false);
    expect(Array.from(menu.querySelectorAll('button'), (button) => button.textContent?.trim()))
      .toEqual(['Новая игра', 'Сохранить', 'Загрузить', 'Экспорт', 'Импорт']);
    document.body.click();
    fixture.detectChanges();
    expect(menu.hidden).toBe(true);
    click('[data-game-menu-toggle]');
    const save = root.querySelector<HTMLButtonElement>('[data-save-game]')!;
    save.focus();
    save.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
    click('[data-save-game]');
    expect(menu.hidden).toBe(true);
  });

  it('requires confirmation for a new game and keeps the local save until the next write', () => {
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(2000);
    game.setManualPaused(true);
    render();
    click('[data-save-game]');
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    const current = game.createSave(new Date());
    click('[data-new-game]');
    expect(root.querySelector('#session-new-game-title')).not.toBeNull();
    expect(document.activeElement).toBe(root.querySelector('[data-cancel-new-game]'));
    expect(game.createSave(new Date())).toEqual(current);
    root.querySelector('[data-cancel-new-game]')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(root.querySelector('#session-new-game-title')).toBeNull();
    expect(game.createSave(new Date())).toEqual(current);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    click('[data-new-game]');
    click('[data-confirm-new-game]');
    expect(game.clock()).toBe(0);
    expect(game.colonies()).toEqual({});
    expect(game.credits()).toBe(2000);
    expect(game.manualPaused()).toBe(false);
    expect(game.systemPaused()).toBe(false);
    expect(root.querySelector('#session-new-game-title')).toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Новая игра начата');
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    vi.advanceTimersByTime(30000);
    expect(storage.read()?.colonies).toEqual([]);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBe(raw);
  });

  it('treats an absent save as a normal state and does not create one on reading', () => {
    render();
    expect(root.querySelector('[data-last-saved]')?.textContent).toContain('нет');
    click('[data-load-game]');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Сохранение не найдено');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });

  it('manually saves elapsed time and restores construction and the production phase', () => {
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    render();
    vi.advanceTimersByTime(1500);
    click('[data-save-game]');
    const saved = storage.read();
    expect(saved).toMatchObject({ gameTime: 1500, lastProductionTick: 0 });
    expect(saved?.colonies[0].buildings[0].completed).toBe(false);
    expect(root.querySelector('time')?.dateTime).toBe(saved?.savedAt);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Игра сохранена');
    vi.advanceTimersByTime(6500);
    expect(game.colonies()[planet.id].buildings[0].completed).toBe(true);
    click('[data-load-game]');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Игра загружена');
    expect(game.createSave(new Date(saved!.savedAt))).toEqual(saved);
    vi.advanceTimersByTime(500);
    game.tick();
    expect(game.clock()).toBe(2000);
    expect(game.colonies()[planet.id].buildings[0].completed).toBe(false);
    vi.advanceTimersByTime(2000);
    game.tick();
    expect(game.colonies()[planet.id].buildings[0].completed).toBe(true);
  });

  it('saves on manual pause without advancing the simulation and restores that pause', () => {
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(1000);
    game.setManualPaused(true);
    const paused = game.colonies();
    render();
    vi.advanceTimersByTime(60000);
    expect(root.querySelector<HTMLButtonElement>('[data-save-game]')!.disabled).toBe(false);
    click('[data-save-game]');
    expect(game.clock()).toBe(1000);
    expect(game.colonies()).toBe(paused);
    const saved = storage.read();
    expect(saved).toMatchObject({ gameTime: 1000, manualPaused: true });
    game.setManualPaused(false);
    vi.advanceTimersByTime(10000);
    click('[data-load-game]');
    vi.advanceTimersByTime(60000);
    expect(game.clock()).toBe(1000);
    expect(game.manualPaused()).toBe(true);
    expect(game.createSave(new Date(saved!.savedAt))).toEqual(saved);
  });

  it('reads the stored date on startup without automatically restoring the game', () => {
    const saved = game.createSave(new Date());
    storage.write(saved);
    vi.advanceTimersByTime(6000);
    const current = game.colonies();
    render();
    expect(root.querySelector('time')?.dateTime).toBe(saved.savedAt);
    expect(game.clock()).toBe(6000);
    expect(game.colonies()).toBe(current);
  });

  it('shows quota failure and keeps the previous successful date and stored data', () => {
    render();
    click('[data-save-game]');
    const date = root.querySelector('time')?.dateTime;
    const previous = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    vi.advanceTimersByTime(5000);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    click('[data-save-game]');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('превышена квота');
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.querySelector('time')?.dateTime).toBe(date);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(previous);
    click('[data-load-game]');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Игра загружена');
  });

  it('shows unavailable storage during startup, reading, and writing without a success indicator', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    render();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('localStorage недоступно');
    click('[data-load-game]');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Не удалось прочитать');
    click('[data-save-game]');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Не удалось сохранить');
    expect(root.querySelector('time')).toBeNull();
    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it('exports successfully without hiding the separate localStorage error', () => {
    const download = vi.spyOn(files, 'exportSave').mockImplementation(() => {});
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    render();
    click('[data-export-game]');
    expect(download).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-file-result]')?.textContent).toContain('подготовлен');
    expect(root.querySelector('[data-file-error]')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('localStorage недоступно');
    expect(root.querySelector('time')).toBeNull();
  });

  it('previews a file, supports cancellation, and separates import success from local write failure', async () => {
    render();
    click('[data-save-game]');
    const saved = storage.read();
    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY);
    vi.spyOn(files, 'read').mockResolvedValue(JSON.stringify({ ...saved, credits: 777 }));
    const open = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    click('[data-import-game]');
    expect(open).toHaveBeenCalledOnce();
    expect(game.systemPaused()).toBe(true);
    Object.defineProperty(input, 'files', {
      value: [new File(['valid'], 'chosen-save.json')],
      configurable: true,
    });
    await fixture.componentInstance.importSelected(input);
    fixture.detectChanges();
    expect(root.querySelector('#import-confirmation-title')?.textContent).toContain(
      'chosen-save.json',
    );
    expect(game.credits()).toBe(2000);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(root.querySelector<HTMLButtonElement>('[data-save-game]')!.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-new-game]')!.disabled).toBe(true);
    click('[data-cancel-import]');
    expect(game.systemPaused()).toBe(false);
    expect(game.credits()).toBe(2000);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    click('[data-import-game]');
    await fixture.componentInstance.importSelected(input);
    fixture.detectChanges();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    click('[data-confirm-import]');
    expect(game.credits()).toBe(777);
    expect(root.querySelector('[data-file-result]')?.textContent).toContain('Импорт выполнен');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Локальная запись после импорта не удалась',
    );
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(root.querySelector('#import-confirmation-title')).toBeNull();
  });

  it('releases the service stop when the native file chooser is cancelled', () => {
    render();
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    click('[data-import-game]');
    expect(game.systemPaused()).toBe(true);
    root.querySelector('input[type="file"]')!.dispatchEvent(new Event('cancel'));
    fixture.detectChanges();
    expect(game.systemPaused()).toBe(false);
    expect(root.querySelector('[data-cancel-import]')).toBeNull();
    expect(root.querySelector('[data-file-result]')?.textContent).toContain('Импорт отменён');
  });

  it('shares automatic save results and suppresses duplicate alerts until writing recovers', () => {
    render();
    click('[data-save-game]');
    const previousDate = root.querySelector('time')?.dateTime;
    game.setManualPaused(true);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    vi.advanceTimersByTime(30000);
    fixture.detectChanges();
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('превышена квота');
    expect(root.querySelector('time')?.dateTime).toBe(previousDate);
    vi.advanceTimersByTime(30000);
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBe(alert);
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(1);
    write.mockRestore();
    vi.advanceTimersByTime(30000);
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('time')?.dateTime).toBe(storage.read()?.savedAt);
    expect(root.querySelector('time')?.dateTime).not.toBe(previousDate);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('сохранена автоматически');
    vi.advanceTimersByTime(3999);
    fixture.detectChanges();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('сохранена автоматически');
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.querySelector('time')?.dateTime).toBe(storage.read()?.savedAt);
  });

  it.each([
    ['{"version":', 'JSON'],
    ['{"version":2}', 'не поддерживается'],
  ])(
    'visibly rejects invalid storage %s without changing or overwriting the session',
    (raw, reason) => {
      localStorage.setItem(GAME_SAVE_STORAGE_KEY, raw);
      const colonies = game.colonies();
      render();
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(reason);
      click('[data-load-game]');
      expect(root.querySelector('[role="alert"]')?.textContent).toContain(reason);
      expect(root.querySelector('time')).toBeNull();
      expect(game.colonies()).toBe(colonies);
      expect(game.clock()).toBe(0);
      vi.advanceTimersByTime(60000);
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(raw);
    },
  );
});
