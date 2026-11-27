import { Component, computed, inject, input, signal } from '@angular/core';
import { GameSessionService } from '../../services/game-session.service';
import { formatCredits } from './format-credits';
import * as ColonyFinance from '../../../planet/domain/colony-finances';

@Component({
  selector: 'app-financial-summary',
  standalone: true,
  templateUrl: './financial-summary.component.html',
  styleUrls: ['./financial-summary.component.scss'],
  host: { '[class.collapsed]': '!expanded()' },
})
export class FinancialSummaryComponent {
  readonly expanded = signal(true);
  readonly game = inject(GameSessionService);
  readonly creditText = computed(() =>
    formatCredits(this.game.wholeCredits(), this.game.creditRemainder()),
  );
  readonly taxPerResident = ColonyFinance.TAX_PER_RESIDENT_PER_MINUTE;
  readonly colonyId = input<string | null>(null);
  readonly localFinances = computed(() =>
    this.game.colonyFinances().find((colony) => colony.planetId === this.colonyId()),
  );
  readonly depletionSeconds = computed(() =>
    ColonyFinance.creditDepletionSeconds(this.game.credits(), this.game.finances().balance),
  );
  readonly financiallyDisabled = computed(() =>
    Object.values(this.game.colonies()).flatMap((colony) =>
      colony.buildings
        .filter((building) => building.disabledByFinance)
        .map((building) => ({
          id: building.id,
          colonyName: colony.planet.name,
          name: this.game.definition(building.type).name,
        })),
    ),
  );
  readonly numbers = new Intl.NumberFormat('ru-RU', {
    useGrouping: false,
    maximumFractionDigits: 2,
  });

  depletionTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    return minutes ? `${this.numbers.format(minutes)} мин ${seconds % 60} с` : `${seconds} с`;
  }
}
