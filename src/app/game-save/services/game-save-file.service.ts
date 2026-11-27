import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import * as GameSaveValidation from '../domain/game-save-validation';
import { GameSave } from '../models/interface/game-save';

@Injectable({ providedIn: 'root' })
export class GameSaveFileService {
  private readonly document = inject(DOCUMENT);
  private downloadUrl: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.downloadUrl !== null) URL.revokeObjectURL(this.downloadUrl);
    });
  }

  exportSave(input: GameSave): void {
    const saved = GameSaveValidation.readGameSave(input);
    const timestamp = saved.savedAt.replace(/[:.]/g, '-');
    this.download(
      JSON.stringify(saved, null, 2),
      `space-fortress-${timestamp}.json`,
      'application/json;charset=utf-8',
    );
  }

  downloadOriginal(raw: string): void {
    this.download(raw, 'space-fortress-save-original.json', 'text/plain;charset=utf-8');
  }

  read(file: File, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const cleanup = () => {
        reader.onload = null;
        reader.onerror = null;
        reader.onabort = null;
        signal.removeEventListener('abort', cancel);
      };
      const cancel = () => {
        cleanup();
        reader.abort();
        reject(new DOMException('Чтение файла отменено.', 'AbortError'));
      };
      reader.onload = () => {
        const text = reader.result;
        cleanup();
        if (typeof text !== 'string') {
          reject(new Error('Не удалось прочитать файл сохранения как текст.'));
        } else {
          resolve(text);
        }
      };
      reader.onerror = () => {
        const cause = reader.error;
        cleanup();
        reject(new Error('Не удалось прочитать файл сохранения.', { cause }));
      };
      reader.onabort = () => {
        cleanup();
        reject(new DOMException('Чтение файла отменено.', 'AbortError'));
      };
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }
      try {
        reader.readAsText(file);
      } catch (error) {
        cleanup();
        reject(new Error('Не удалось прочитать файл сохранения.', { cause: error }));
      }
    });
  }

  private download(text: string, name: string, type: string): void {
    const anchor = this.document.createElement('a');
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      if (this.downloadUrl !== null) URL.revokeObjectURL(this.downloadUrl);
      this.downloadUrl = url;
      anchor.href = url;
      anchor.download = name;
      anchor.hidden = true;
      this.document.body.append(anchor);
      anchor.click();
    } catch (error) {
      throw new Error('Не удалось скачать файл сохранения.', { cause: error });
    } finally {
      anchor.remove();
    }
  }
}
