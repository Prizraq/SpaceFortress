import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as GameSaveValidation from '../domain/game-save-validation';
import { GameSessionService } from '../../game-session/services/game-session.service';
import { GameSaveFileService } from './game-save-file.service';

describe('GameSaveFileService', () => {
  let files: GameSaveFileService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    files = TestBed.inject(GameSaveFileService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exports dated JSON without storage, reads it back, and releases download resources', async () => {
    const saved = TestBed.inject(GameSessionService).createSave(new Date('2030-01-02T03:04:05.006Z'));
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    const create = vi
      .fn<(blob: Blob | MediaSource) => string>()
      .mockReturnValueOnce('blob:export-one')
      .mockReturnValueOnce('blob:export-two');
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
      expect(this.download).toBe('space-fortress-2030-01-02T03-04-05-006Z.json');
    });
    files.exportSave(saved);
    expect(click).toHaveBeenCalledOnce();
    const blob = create.mock.calls[0][0];
    if (!(blob instanceof Blob)) throw new Error('Expected JSON Blob');
    expect(blob.type).toBe('application/json;charset=utf-8');
    const text = await files.read(new File([blob], 'roundtrip.json'), new AbortController().signal);
    expect(GameSaveValidation.readGameSave(text)).toEqual(saved);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    files.exportSave(saved);
    expect(revoke).toHaveBeenCalledWith('blob:export-one');
    TestBed.resetTestingModule();
    expect(revoke).toHaveBeenCalledWith('blob:export-two');
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('rejects corrupted v2 cents before starting a download', () => {
    const saved = TestBed.inject(GameSessionService).createSave(new Date());
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(() => files.exportSave({ ...saved, creditRemainder: 100 })).toThrow('creditRemainder');
    expect(click).not.toHaveBeenCalled();
  });

  it('reads source text without altering whitespace or requiring valid JSON', async () => {
    const raw = '  {"version":broken}\nисходные данные\n';
    const text = await files.read(new File([raw], 'broken.json'), new AbortController().signal);
    expect(text).toBe(raw);
  });

  it('aborts pending reads and removes reader and signal handlers', async () => {
    const readers: FileReader[] = [];
    vi.stubGlobal(
      'FileReader',
      class extends FileReader {
        constructor() {
          super();
          readers.push(this);
        }
      },
    );
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = files.read(new File(['pending text'], 'pending.json'), controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(readers[0].readyState).toBe(FileReader.DONE);
    expect(readers[0].onload).toBeNull();
    expect(readers[0].onerror).toBeNull();
    expect(readers[0].onabort).toBeNull();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('reports read failures instead of returning empty content', async () => {
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      queueMicrotask(() => this.dispatchEvent(new ProgressEvent('error')));
    });
    await expect(
      files.read(new File(['text'], 'unreadable.json'), new AbortController().signal),
    ).rejects.toThrow('Не удалось прочитать файл сохранения');
  });
});
