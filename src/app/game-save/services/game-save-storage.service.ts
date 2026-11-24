import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { readGameSave } from '../domain/game-save-validation';
import { GameSave } from '../models/interface/game-save';
import { GameSaveFileService } from './game-save-file.service';

export const GAME_SAVE_STORAGE_KEY = 'space-fortress.save';

@Injectable({ providedIn: 'root' })
export class GameSaveStorageService {
  private readonly document = inject(DOCUMENT);
  private readonly files = inject(GameSaveFileService);

  private get storage(): Storage {
    const window = this.document.defaultView;
    if (!window) throw new Error('Браузерное хранилище недоступно.');
    return window.localStorage;
  }

  readRaw(): string | null {
    try {
      return this.storage.getItem(GAME_SAVE_STORAGE_KEY);
    } catch (error) {
      throw new Error('Не удалось прочитать сохранение: localStorage недоступно.', {
        cause: error,
      });
    }
  }

  read(): GameSave | null {
    const raw = this.readRaw();
    return raw === null ? null : readGameSave(raw);
  }

  downloadRaw(raw: string): void {
    this.files.downloadOriginal(raw);
  }

  write(save: GameSave): void {
    const json = JSON.stringify(readGameSave(save));
    try {
      this.storage.setItem(GAME_SAVE_STORAGE_KEY, json);
    } catch (error) {
      const quotaExceeded =
        (error instanceof DOMException || error instanceof Error) &&
        (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      throw new Error(
        quotaExceeded
          ? 'Не удалось сохранить игру: превышена квота localStorage. Освободите место в хранилище браузера.'
          : 'Не удалось сохранить игру: localStorage недоступно.',
        { cause: error },
      );
    }
  }
}
