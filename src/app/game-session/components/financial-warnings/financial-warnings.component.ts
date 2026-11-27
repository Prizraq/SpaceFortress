import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { GameSessionService } from '../../services/game-session.service';

@Component({
  selector: 'app-financial-warnings',
  standalone: true,
  templateUrl: './financial-warnings.component.html',
  styleUrls: ['./financial-warnings.component.scss'],
})
export class FinancialWarningsComponent {
  private readonly game = inject(GameSessionService);
  private previousDeficit = false;
  private previousDisabled = new Set<number>();
  private messageTimer: ReturnType<typeof setTimeout> | null = null;
  readonly message = signal<string | null>(null);

  constructor() {
    effect(() => {
      const colonies = Object.values(this.game.colonies());
      const deficit = this.game.finances().balance < 0;
      const disabled = new Set(
        colonies.flatMap((colony) =>
          colony.buildings
            .filter((building) => building.disabledByFinance)
            .map((building) => building.id),
        ),
      );
      const newlyDisabled = [...disabled].filter((id) => !this.previousDisabled.has(id)).length;
      const messages: string[] = [];
      if (colonies.length === 0) {
        this.dismiss();
      } else {
        if (deficit && !this.previousDeficit)
          messages.push(
            'Отрицательный регулярный баланс. Проверьте прогноз исчерпания кредитов в финансовой сводке.',
          );
        if (newlyDisabled)
          messages.push(
            `Недостаточно кредитов: отключено зданий — ${newlyDisabled}. Включение только вручную.`,
          );
        if (!deficit && disabled.size === 0 && (this.previousDeficit || this.previousDisabled.size))
          messages.push(
            'Финансовая проблема устранена: регулярный баланс неотрицательный, финансовых отключений нет.',
          );
        else if (!deficit && this.previousDeficit)
          messages.push(
            'Отрицательный регулярный баланс устранён. Финансово отключённые здания остаются выключенными.',
          );
        if (messages.length) this.showMessage(messages.join(' '));
      }
      this.previousDeficit = deficit;
      this.previousDisabled = disabled;
    });
    inject(DestroyRef).onDestroy(() => this.dismiss());
  }

  dismiss(): void {
    if (this.messageTimer !== null) clearTimeout(this.messageTimer);
    this.messageTimer = null;
    this.message.set(null);
  }

  private showMessage(message: string): void {
    this.dismiss();
    this.message.set(message);
    this.messageTimer = setTimeout(() => this.dismiss(), 4000);
  }
}
