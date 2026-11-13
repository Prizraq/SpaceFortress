import { Component, input, output } from '@angular/core';
import { Planet } from '../../models/interface/planet';

@Component({
  selector: 'app-planet-panel',
  standalone: true,
  templateUrl: './planet-panel.component.html',
  styleUrls: ['./planet-panel.component.scss'],
})
export class PlanetPanelComponent {
  readonly planet = input.required<Planet>();
  readonly closed = output<void>();
  readonly opened = output<void>();
}
