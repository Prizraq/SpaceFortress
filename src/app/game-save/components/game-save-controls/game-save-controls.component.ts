import { DatePipe } from '@angular/common';
import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { GameSaveService } from '../../services/game-save.service';
import { GameIconComponent } from '../../../shared/components/game-icon/game-icon.component';

@Component({
  selector: 'app-game-save-controls',
  imports: [DatePipe, GameIconComponent],
  templateUrl: './game-save-controls.component.html',
  styleUrl: './game-save-controls.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'closeMenu($event)',
  },
})
export class GameSaveControlsComponent {
  readonly saves = inject(GameSaveService);
  readonly lastSavedAt = this.saves.lastSavedAt;
  readonly message = this.saves.message;
  readonly error = this.saves.error;
  readonly menuOpen = signal(false);
  readonly confirmingNewGame = signal(false);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menuToggle = viewChild.required<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly newGameCancel = viewChild<ElementRef<HTMLButtonElement>>('newGameCancel');

  constructor() {
    this.saves.inspectStoredSave();
    effect(() => this.newGameCancel()?.nativeElement.focus());
  }

  save(): void {
    this.saves.save();
    this.closeMenu();
  }

  load(): void {
    this.saves.load();
    this.closeMenu();
  }

  exportSave(): void {
    this.saves.exportSave();
    this.closeMenu();
  }

  requestNewGame(): void {
    this.confirmingNewGame.set(true);
    this.menuOpen.set(false);
  }

  confirmNewGame(): void {
    this.saves.newGame();
    this.cancelNewGame();
  }

  cancelNewGame(): void {
    this.confirmingNewGame.set(false);
    this.menuToggle().nativeElement.focus();
  }

  onDocumentClick(event: MouseEvent): void {
    if (event.target instanceof Node && !this.element.nativeElement.contains(event.target)) {
      this.menuOpen.set(false);
    }
  }

  closeMenu(event?: Event): void {
    event?.stopPropagation();
    if (this.confirmingNewGame()) this.cancelNewGame();
    else {
      this.menuOpen.set(false);
      this.menuToggle().nativeElement.focus();
    }
  }

  chooseImport(input: HTMLInputElement): void {
    if (!this.saves.beginImport()) return;
    this.closeMenu();
    try {
      input.value = '';
      input.click();
    } catch (error) {
      this.saves.failImport(error);
    }
  }

  async importSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      this.saves.cancelImport();
      return;
    }
    await this.saves.readImport(file);
  }
}
