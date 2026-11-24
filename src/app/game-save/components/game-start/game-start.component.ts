import { DatePipe } from '@angular/common';
import { Component, inject, output, signal } from '@angular/core';
import { readGameSave } from '../../domain/game-save-validation';
import { GameSave } from '../../models/interface/game-save';
import { GameSessionService } from '../../../game-session/services/game-session.service';
import { GameSaveStorageService } from '../../services/game-save-storage.service';
import { GameSaveService } from '../../services/game-save.service';

@Component({
  selector: 'app-game-start',
  imports: [DatePipe],
  templateUrl: './game-start.component.html',
  styleUrl: './game-start.component.scss',
})
export class GameStartComponent {
  private readonly game = inject(GameSessionService);
  private readonly storage = inject(GameSaveStorageService);
  private readonly saves = inject(GameSaveService);
  readonly started = output<void>();
  readonly saved = signal<GameSave | null>(null);
  readonly rawSave = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly confirmingNewGame = signal(false);

  constructor() {
    this.inspectSave();
  }

  inspectSave(): void {
    this.saved.set(null);
    this.rawSave.set(null);
    this.error.set(null);
    this.confirmingNewGame.set(false);
    try {
      const raw = this.storage.readRaw();
      this.rawSave.set(raw);
      if (raw !== null) this.saved.set(readGameSave(raw));
    } catch (error) {
      this.showError(error);
    }
  }

  continueGame(): void {
    try {
      const saved = this.saved();
      if (!saved) throw new Error('Нет корректного сохранения для продолжения.');
      this.game.restoreSave(saved);
      this.finishStartup();
    } catch (error) {
      this.showError(error);
    }
  }

  requestNewGame(): void {
    if (this.rawSave() !== null || this.error() !== null) {
      this.confirmingNewGame.set(true);
    } else {
      this.startNewGame();
    }
  }

  cancelNewGame(): void {
    this.confirmingNewGame.set(false);
  }

  confirmNewGame(): void {
    if (!this.confirmingNewGame()) {
      this.showError(new Error('Сначала подтвердите начало новой игры.'));
      return;
    }
    this.startNewGame();
  }

  downloadOriginal(): void {
    try {
      const raw = this.rawSave();
      if (raw === null) throw new Error('Исходные данные сохранения недоступны для скачивания.');
      this.storage.downloadRaw(raw);
    } catch (error) {
      this.showError(error);
    }
  }

  private startNewGame(): void {
    try {
      this.game.resetSession();
      this.finishStartup();
    } catch (error) {
      this.showError(error);
    }
  }

  private finishStartup(): void {
    this.saves.startSession();
    this.game.setSystemPaused(false);
    this.started.emit();
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'Не удалось подготовить игру.');
  }
}
