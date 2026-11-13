import { Component, OnChanges, computed, inject, input, output, signal } from '@angular/core';
import { BuildingDefinition, BuildingType, PlacedBuilding } from '../../models/interface/colony';
import { Planet } from '../../models/interface/planet';
import { ColonyService } from '../../services/colony.service';
import { GameIconComponent } from '../game-icon/game-icon.component';
import { BUILD_ERROR_LABELS, BUILDING_STATUS_LABELS } from './building-labels';
import { createHexMap, terrainColor } from './hex-map';

@Component({
  selector: 'app-planet-map',
  standalone: true,
  imports: [GameIconComponent],
  templateUrl: './planet-map.component.html',
  styleUrls: ['./planet-map.component.scss'],
})
export class PlanetMapComponent implements OnChanges {
  readonly planet = input.required<Planet>();
  readonly back = output<void>();
  readonly game: ColonyService = inject(ColonyService);
  readonly colony = computed(() => this.game.colonies()[this.planet().id]);
  readonly side = computed(() => this.game.gridSize(this.planet().radius));
  readonly blueprint = signal<BuildingType | null>(null);
  readonly dragging = signal<BuildingType | null>(null);
  readonly statusLabels = BUILDING_STATUS_LABELS;
  readonly selectedTile = signal<number | null>(null);
  readonly message = signal('');
  readonly zoom = signal(1);
  readonly tileBuildings = computed(
    () =>
      new Map<number, PlacedBuilding>(
        this.colony()?.buildings.map((building) => [building.tile, building]),
      ),
  );
  readonly inspected = computed(() => this.tileBuildings().get(this.selectedTile() ?? -1));
  readonly geometry = computed(() => createHexMap(this.side()));

  ngOnChanges(): void {
    this.game.openPlanet(this.planet());
    this.blueprint.set(null);
    this.dragEnd();
    this.selectedTile.set(null);
    this.message.set('');
  }

  choose(definition: BuildingDefinition): void {
    this.blueprint.set(definition.type);
    this.message.set('');
    const tile = this.selectedTile();
    if (tile !== null && !this.tileBuildings().has(tile)) this.place(definition.type, tile);
  }

  selectTile(tile: number): void {
    this.selectedTile.set(tile);
    this.message.set('');
    const type = this.blueprint();
    if (type && !this.tileBuildings().has(tile)) this.place(type, tile);
  }

  dragStart(event: DragEvent, definition: BuildingDefinition): void {
    if (this.game.buildProblem(this.planet(), definition.type)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', definition.type);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    this.dragging.set(definition.type);
    this.message.set('');
  }

  dragEnd(): void {
    this.dragging.set(null);
  }

  buildProblem(type: BuildingType): string | null {
    const problem = this.game.buildProblem(this.planet(), type);
    return problem ? BUILD_ERROR_LABELS[problem] : null;
  }

  allowDrop(event: Event): void {
    event.preventDefault();
  }

  drop(event: Event, tile: number): void {
    event.preventDefault();
    this.dragEnd();
    const type = (event as DragEvent).dataTransfer?.getData('text/plain');
    const definition = this.game.catalogue.find((building) => building.type === type);
    if (definition) {
      this.selectedTile.set(tile);
      this.place(definition.type, tile);
    }
  }

  progress(building: PlacedBuilding): number {
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((this.game.clock() - building.startedAt) / (building.completesAt - building.startedAt)) *
            100,
        ),
      ),
    );
  }

  remaining(building: PlacedBuilding): number {
    return Math.max(0, Math.ceil((building.completesAt - this.game.clock()) / 1000));
  }

  terrain(tile: number): string {
    return terrainColor(this.planet(), tile);
  }

  changeZoom(amount: number): void {
    this.zoom.update((zoom) => Math.max(0.6, Math.min(1.6, zoom + amount)));
  }

  private place(type: BuildingType, tile: number): void {
    const problem = this.game.build(this.planet(), type, tile);
    this.message.set(problem ? BUILD_ERROR_LABELS[problem] : 'Строительство начато');
    if (!problem) this.blueprint.set(null);
  }
}
