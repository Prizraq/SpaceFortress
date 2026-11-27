import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import * as GameSaveValidation from '../domain/game-save-validation';
import { GameSave } from '../models/interface/game-save';
import { GameSessionService } from '../../game-session/services/game-session.service';
import { GameSaveStorageService } from './game-save-storage.service';
import { GameSaveFileService } from './game-save-file.service';

interface ImportOperation {
  readonly previousSystemPause: boolean;
  readonly controller: AbortController;
  saved?: GameSave;
}

interface ImportPreview {
  readonly fileName: string;
  readonly savedAt: string;
  readonly gameTime: number;
}

@Injectable({ providedIn: 'root' })
export class GameSaveService {
  private readonly game = inject(GameSessionService);
  private readonly storage = inject(GameSaveStorageService);
  private readonly files = inject(GameSaveFileService);
  private readonly document = inject(DOCUMENT);
  private readonly lastSavedAtState = signal<string | null>(null);
  private readonly messageState = signal<string | null>(null);
  private readonly errorState = signal<string | null>(null);
  private readonly fileMessageState = signal<string | null>(null);
  private readonly fileErrorState = signal<string | null>(null);
  private readonly importBusyState = signal(false);
  private readonly importPreviewState = signal<ImportPreview | null>(null);
  private importOperation: ImportOperation | null = null;
  private sessionStarted = false;
  private preserveUnreadSave = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  private baselineState: string | null = null;

  readonly lastSavedAt = this.lastSavedAtState.asReadonly();
  readonly message = this.messageState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly fileMessage = this.fileMessageState.asReadonly();
  readonly fileError = this.fileErrorState.asReadonly();
  readonly importBusy = this.importBusyState.asReadonly();
  readonly importPreview = this.importPreviewState.asReadonly();

  constructor() {
    // The session registers first: its visibility handler samples time and pauses before saving.
    const visibilityChanged = () => {
      if (this.document.visibilityState === 'hidden') this.autoSave();
    };
    this.document.addEventListener('visibilitychange', visibilityChanged);
    inject(DestroyRef).onDestroy(() => {
      if (this.timer !== null) clearInterval(this.timer);
      if (this.messageTimer !== null) clearTimeout(this.messageTimer);
      this.document.removeEventListener('visibilitychange', visibilityChanged);
      if (this.importOperation !== null) this.finishImport(this.importOperation);
    });
  }

  startSession(): void {
    this.baselineState = this.stateKey(this.game.createSave(new Date()));
    this.preserveUnreadSave = false;
    this.sessionStarted = true;
    if (this.timer === null) this.timer = setInterval(() => this.autoSave(), 30000);
  }

  inspectStoredSave(): void {
    try {
      const saved = this.storage.read();
      if (saved) this.lastSavedAtState.set(saved.savedAt);
    } catch (error) {
      this.showError(error);
    }
  }

  newGame(): void {
    try {
      this.assertSessionReady();
      this.game.resetSession();
      this.startSession();
      this.errorState.set(null);
      this.fileMessageState.set(null);
      this.fileErrorState.set(null);
      this.showMessage('Новая игра начата.');
    } catch (error) {
      this.showError(error);
    }
  }

  save(): void {
    try {
      this.assertSessionReady();
      this.preserveUnreadSave = false;
      this.write(this.game.createSave(new Date()), false);
    } catch (error) {
      this.showError(error);
    }
  }

  load(): void {
    try {
      this.assertSessionReady();
      const saved = this.storage.read();
      if (!saved) {
        this.preserveUnreadSave = false;
        this.errorState.set(null);
        this.showMessage('Сохранение не найдено.');
        return;
      }
      this.game.restoreSave(saved);
      this.baselineState = this.stateKey(this.game.createSave(new Date(saved.savedAt)));
      this.preserveUnreadSave = false;
      this.lastSavedAtState.set(saved.savedAt);
      this.errorState.set(null);
      this.showMessage('Игра загружена.');
    } catch (error) {
      this.preserveUnreadSave = true;
      const reason = error instanceof Error ? error.message : 'Не удалось загрузить сохранение.';
      this.showError(
        new Error(
          `${reason} Автосохранение приостановлено до успешного чтения или ручного сохранения.`,
          { cause: error },
        ),
      );
    }
  }

  exportSave(): void {
    this.fileMessageState.set(null);
    this.fileErrorState.set(null);
    try {
      this.assertSessionReady();
      this.files.exportSave(this.game.createSave(new Date()));
      this.fileMessageState.set('Файл сохранения подготовлен для скачивания.');
    } catch (error) {
      this.showFileError(error);
    }
  }

  beginImport(): boolean {
    try {
      this.assertSessionReady();
      this.importOperation = {
        previousSystemPause: this.game.systemPaused(),
        controller: new AbortController(),
      };
      this.game.setSystemPaused(true);
      this.importBusyState.set(true);
      this.fileMessageState.set(null);
      this.fileErrorState.set(null);
      return true;
    } catch (error) {
      this.showFileError(error);
      return false;
    }
  }

  async readImport(file: File): Promise<void> {
    const operation = this.importOperation;
    if (operation === null) {
      this.showFileError(new Error('Сначала начните импорт файла.'));
      return;
    }
    try {
      const text = await this.files.read(file, operation.controller.signal);
      if (this.importOperation !== operation) return;
      operation.saved = GameSaveValidation.readGameSave(text);
      this.importPreviewState.set({
        fileName: file.name,
        savedAt: operation.saved.savedAt,
        gameTime: operation.saved.gameTime,
      });
    } catch (error) {
      if (this.importOperation !== operation) return;
      this.failImport(error);
    }
  }

  cancelImport(): void {
    if (this.importOperation === null) return;
    this.finishImport(this.importOperation);
    this.fileErrorState.set(null);
    this.fileMessageState.set('Импорт отменён.');
  }

  failImport(error: unknown): void {
    if (this.importOperation !== null) this.finishImport(this.importOperation);
    this.showFileError(error);
  }

  confirmImport(): void {
    const operation = this.importOperation;
    if (!operation?.saved) {
      this.showFileError(new Error('Сначала выберите корректный файл и подтвердите замену.'));
      return;
    }
    try {
      this.game.restoreSave(operation.saved);
      this.baselineState = null;
      this.preserveUnreadSave = false;
      this.fileMessageState.set('Импорт выполнен. Сессия восстановлена.');
      this.fileErrorState.set(null);
      try {
        this.write(this.game.createSave(new Date()), false);
        this.showMessage('Импортированная сессия сохранена локально.');
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Хранилище недоступно.';
        this.showError(
          new Error(`Локальная запись после импорта не удалась. ${reason}`, { cause: error }),
        );
      }
    } catch (error) {
      this.showFileError(error);
    } finally {
      this.finishImport(operation);
    }
  }

  private finishImport(operation: ImportOperation): void {
    this.importOperation = null;
    operation.controller.abort();
    this.importPreviewState.set(null);
    this.importBusyState.set(false);
    this.game.setSystemPaused(operation.previousSystemPause);
  }

  private showFileError(error: unknown): void {
    this.fileMessageState.set(null);
    this.fileErrorState.set(
      error instanceof Error ? error.message : 'Не удалось обработать файл сохранения.',
    );
  }

  private autoSave(): void {
    if (!this.sessionStarted || this.game.systemPaused() || this.preserveUnreadSave) return;
    try {
      this.write(this.game.createSave(new Date()), true);
    } catch (error) {
      this.showError(error);
    }
  }

  private write(saved: GameSave, automatic: boolean): void {
    const state = this.stateKey(saved);
    if (automatic && state === this.baselineState) return;
    this.storage.write(saved);
    this.preserveUnreadSave = false;
    this.baselineState = state;
    this.lastSavedAtState.set(saved.savedAt);
    this.errorState.set(null);
    this.showMessage(automatic ? 'Игра сохранена автоматически.' : 'Игра сохранена.', automatic);
  }

  private showMessage(message: string | null, automatic = false): void {
    if (this.messageTimer !== null) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    this.messageState.set(message);
    if (automatic) {
      this.messageTimer = setTimeout(() => {
        this.messageState.set(null);
        this.messageTimer = null;
      }, 4000);
    }
  }

  private stateKey(saved: GameSave): string {
    const { savedAt: _savedAt, ...state } = saved;
    return JSON.stringify(state);
  }

  private assertSessionReady(): void {
    if (!this.sessionStarted || this.game.systemPaused())
      throw new Error(
        'Сохранение и загрузка недоступны до окончания запуска или служебной остановки.',
      );
  }

  private showError(error: unknown): void {
    this.showMessage(null);
    this.errorState.set(
      error instanceof Error ? error.message : 'Не удалось выполнить операцию с сохранением.',
    );
  }
}
