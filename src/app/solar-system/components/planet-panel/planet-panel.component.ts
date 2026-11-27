import { Component, computed, inject, input, output } from '@angular/core';
import { Planet } from '../../../shared/models/interface/planet';
import { GameSessionService } from '../../../game-session/services/game-session.service';

@Component({
  selector: 'app-planet-panel',
  standalone: true,
  templateUrl: './planet-panel.component.html',
  styleUrls: ['./planet-panel.component.scss'],
})
export class PlanetPanelComponent {
  readonly planet = input.required<Planet>();
  private readonly game = inject(GameSessionService);
  readonly finances = computed(() =>
    this.game.colonyFinances().find((colony) => colony.planetId === this.planet().id),
  );
  readonly numbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  readonly closed = output<void>();
  readonly opened = output<void>();
}
