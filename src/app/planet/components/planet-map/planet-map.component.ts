import {
  AfterViewInit,
  Component,
  ElementRef,
  OnChanges,
  OnDestroy,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import * as ColonySimulation from '../../domain/colony-simulation';
import * as ColonyWorkforce from '../../domain/colony-workforce';
import { BuildingType } from '../../models/enum/building-type';
import { BuildingDefinition } from '../../models/interface/building-definition';
import { PlacedBuilding } from '../../models/interface/placed-building';
import { Planet } from '../../../shared/models/interface/planet';
import { GameSessionService } from '../../../game-session/services/game-session.service';
import { GameIconComponent } from '../../../shared/components/game-icon/game-icon.component';
import { FinancialSummaryComponent } from '../../../game-session/components/financial-summary/financial-summary.component';
import { formatCredits } from '../../../game-session/components/financial-summary/format-credits';
import * as ColonyFinance from '../../domain/colony-finances';
import {
  BUILD_ERROR_LABELS,
  BUILDING_OPERATION_ERROR_LABELS,
  BUILDING_STATUS_LABELS,
  DEMOLITION_ERROR_LABELS,
} from './building-labels';
import { MAP_VERTICAL_SCALE, createHexMap } from './hex-map';
import { createSurfaceTexture } from './surface-texture';

const HORIZON_CURVE = 12;
const SKY_HEIGHT = 24;
const MIN_PANEL_WIDTH = 200;
const MAX_PANEL_WIDTH = 480;
type SidePanel = 'catalogue' | 'inspector';
type InspectorTab = 'overview' | 'building' | 'finances';

@Component({
  selector: 'app-planet-map',
  standalone: true,
  imports: [GameIconComponent, FinancialSummaryComponent],
  templateUrl: './planet-map.component.html',
  styleUrls: ['./planet-map.component.scss'],
})
export class PlanetMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private static nextSurfaceId = 0;
  readonly surfacePatternId = `planet-surface-${PlanetMapComponent.nextSurfaceId++}`;
  readonly planet = input.required<Planet>();
  readonly back = output<void>();
  readonly game = inject(GameSessionService);
  readonly catalogue: readonly BuildingDefinition[] = this.game.catalogue;
  readonly colony = computed(() => this.game.colonies()[this.planet().id]);
  readonly water = computed(() => ColonySimulation.waterEconomy(this.colony()));
  readonly food = computed(() => ColonySimulation.foodEconomy(this.colony()));
  readonly workforce = computed(() => ColonyWorkforce.colonyWorkforce(this.colony()));
  readonly foodLevel = computed(() => {
    const balance = this.food().balance;
    return balance < 0 ? 'deficit' : balance <= 0.2 ? 'balanced' : 'surplus';
  });
  readonly resourceNumbers = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  readonly creditText = computed(() => formatCredits(this.game.wholeCredits(), this.game.creditRemainder()));
  readonly maintenancePerMinute = ColonyFinance.maintenancePerMinute;
  readonly buildingMaintenancePerMinute = ColonyFinance.buildingMaintenancePerMinute;
  readonly side = computed(() => this.game.gridSize(this.planet().radius));
  readonly blueprint = signal<BuildingType | null>(null);
  readonly dragging = signal<BuildingType | null>(null);
  readonly statusLabels = BUILDING_STATUS_LABELS;
  readonly buildingTypes = BuildingType;
  readonly demolitionTarget = signal<number | null>(null);
  readonly buildingImages: Readonly<Record<BuildingType, string>> = {
    [BuildingType.Base]: 'assets/buildings/MainBase.png',
    [BuildingType.Power]: 'assets/buildings/SolarPower.png',
    [BuildingType.Water]: 'assets/buildings/WaterPurification.png',
    [BuildingType.Minerals]: 'assets/buildings/MineralExtractionFacility.png',
    [BuildingType.Gas]: 'assets/buildings/GasExtractor.png',
    [BuildingType.Housing]: 'assets/buildings/ResidentialHabitat.png',
    [BuildingType.Farm]: 'assets/buildings/Farm.png',
  };
  readonly selectedTile = signal<number | null>(null);
  readonly message = signal('');
  readonly zoom = signal(1.5);
  readonly mapOffset = signal({ x: 0, y: 0 });
  readonly panning = signal(false);
  readonly tabs: readonly { id: InspectorTab; label: string }[] = [
    { id: 'overview', label: 'Планета' },
    { id: 'building', label: 'Здание' },
    { id: 'finances', label: 'Финансы' },
  ];
  readonly activeTab = signal<InspectorTab>('overview');
  readonly panelWidths = signal({ catalogue: 264, inspector: 320 });
  readonly minimumPanelWidth = MIN_PANEL_WIDTH;
  readonly maximumPanelWidth = signal(MAX_PANEL_WIDTH);
  private readonly workspace = viewChild.required<ElementRef<HTMLDivElement>>('workspace');
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('panelTab');
  private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('mapViewport');
  private resizeObserver?: ResizeObserver;
  private panelGesture: {
    panel: SidePanel;
    pointerId: number;
    startX: number;
    width: number;
  } | null = null;
  private panGesture: {
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null = null;
  private suppressMapClick = false;
  readonly tileBuildings = computed(
    () =>
      new Map<number, PlacedBuilding>(
        this.colony()?.buildings.map((building) => [building.tile, building]),
      ),
  );
  readonly inspected = computed(() => this.tileBuildings().get(this.selectedTile() ?? -1));
  readonly demolitionProblem = computed(() => {
    const building = this.inspected();
    if (!building) return null;
    const problem = this.game.demolitionProblem(this.planet(), building.id);
    return problem ? DEMOLITION_ERROR_LABELS[problem] : null;
  });
  readonly geometry = computed(() => createHexMap(this.side()));
  readonly surfaceBounds = computed(() => ({
    x: -96,
    y: -96 * MAP_VERTICAL_SCALE,
    width: this.geometry().width + 192,
    height: this.geometry().height + 192 * MAP_VERTICAL_SCALE,
  }));
  readonly surfaceTexture = computed(() => {
    const surface = this.surfaceBounds();
    return createSurfaceTexture(this.planet(), surface.width, surface.height / MAP_VERTICAL_SCALE);
  });
  readonly horizonPath = computed(() => {
    const surface = this.surfaceBounds();
    const top = surface.y + HORIZON_CURVE;
    return `M ${surface.x} ${top} Q ${surface.x + surface.width / 2} ${surface.y - HORIZON_CURVE} ${surface.x + surface.width} ${top}`;
  });
  readonly surfaceOutline = computed(() => {
    const surface = this.surfaceBounds();
    return `${this.horizonPath()} V ${surface.y + surface.height} H ${surface.x} Z`;
  });

  ngAfterViewInit(): void {
    const viewport = this.viewport().nativeElement;
    this.resizeObserver = new ResizeObserver(() => {
      const width = this.workspace().nativeElement.getBoundingClientRect().width;
      if (width > 900) {
        this.maximumPanelWidth.set(Math.min(MAX_PANEL_WIDTH, Math.floor(width * 0.35)));
        this.panelWidths.update((widths) => ({
          catalogue: this.clampPanelWidth(widths.catalogue),
          inspector: this.clampPanelWidth(widths.inspector),
        }));
      }
      this.fitMap(viewport);
    });
    this.resizeObserver.observe(viewport);
    this.resizeObserver.observe(this.workspace().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  ngOnChanges(): void {
    this.game.openPlanet(this.planet());
    this.blueprint.set(null);
    this.dragEnd();
    this.selectedTile.set(null);
    this.activeTab.set('overview');
    this.demolitionTarget.set(null);
    this.message.set('');
    this.zoom.set(1.5);
    this.mapOffset.set({ x: 0, y: 0 });
    this.panGesture = null;
    this.panelGesture = null;
    this.panning.set(false);
    this.suppressMapClick = false;
    if (this.resizeObserver) this.fitMap(this.viewport().nativeElement);
  }

  choose(definition: BuildingDefinition): void {
    const problem = this.buildProblem(definition.type);
    if (problem) {
      this.message.set(problem);
      return;
    }
    this.demolitionTarget.set(null);
    this.blueprint.set(definition.type);
    this.message.set('');
    const tile = this.selectedTile();
    if (tile !== null && !this.tileBuildings().has(tile)) this.place(definition.type, tile);
  }

  selectTile(tile: number, event?: MouseEvent): void {
    if (event && this.suppressMapClick) {
      this.suppressMapClick = false;
      return;
    }
    this.selectedTile.set(tile);
    this.activeTab.set('building');
    this.demolitionTarget.set(null);
    this.message.set('');
    const type = this.blueprint();
    if (type && !this.tileBuildings().has(tile)) this.place(type, tile);
  }

  navigateTabs(event: KeyboardEvent, index: number): void {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + this.tabs.length - 1) % this.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    else return;
    event.preventDefault();
    this.activeTab.set(this.tabs[next].id);
    this.tabButtons()[next].nativeElement.focus();
  }

  startPanelResize(event: PointerEvent, panel: SidePanel): void {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    this.panelGesture = {
      panel,
      pointerId: event.pointerId,
      startX: event.clientX,
      width: this.clampPanelWidth(this.panelWidths()[panel]),
    };
  }

  movePanelResize(event: PointerEvent): void {
    const gesture = this.panelGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = (event.clientX - gesture.startX) * (gesture.panel === 'catalogue' ? 1 : -1);
    this.setPanelWidth(gesture.panel, gesture.width + delta);
  }

  endPanelResize(event: PointerEvent): void {
    if (this.panelGesture?.pointerId !== event.pointerId) return;
    this.panelGesture = null;
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }

  resizePanelWithKeyboard(event: KeyboardEvent, panel: SidePanel): void {
    const direction = panel === 'catalogue' ? 1 : -1;
    let width: number;
    if (event.key === 'ArrowLeft')
      width = this.clampPanelWidth(this.panelWidths()[panel]) - 16 * direction;
    else if (event.key === 'ArrowRight')
      width = this.clampPanelWidth(this.panelWidths()[panel]) + 16 * direction;
    else if (event.key === 'Home') width = MIN_PANEL_WIDTH;
    else if (event.key === 'End') width = this.maximumPanelWidth();
    else return;
    event.preventDefault();
    this.setPanelWidth(panel, width);
  }

  dragStart(event: DragEvent, definition: BuildingDefinition): void {
    this.demolitionTarget.set(null);
    const problem = this.buildProblem(definition.type);
    if (problem) {
      this.message.set(problem);
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

  buildingYield(building: PlacedBuilding): number {
    const definition = this.game.definition(building.type);
    return Math.min(
      definition.availableYield(this.planet(), this.colony().deposits),
      definition.yieldFor(this.planet()) * this.workforce().efficiency(building),
    );
  }

  paidBuildings(type: BuildingType): number {
    return this.colony().buildings.filter((building) =>
      building.type === type && ColonyFinance.buildingMaintenancePerMinute(building) > 0,
    ).length;
  }

  financiallyDisabledBuildings(type: BuildingType): number {
    return this.colony().buildings.filter((building) =>
      building.type === type && building.disabledByFinance,
    ).length;
  }

  requestDemolition(): void {
    const building = this.inspected();
    if (!building) return;
    const problem = this.demolitionProblem();
    if (problem) {
      this.message.set(problem);
      return;
    }

    this.demolitionTarget.set(building.id);
  }

  toggleBuilding(): void {
    const building = this.inspected();
    if (!building) return;
    this.demolitionTarget.set(null);
    const problem = this.game.toggleBuilding(this.planet(), building.id);
    this.message.set(
      problem
        ? BUILDING_OPERATION_ERROR_LABELS[problem]
        : building.enabled
          ? 'Здание отключено.'
          : 'Здание включено.',
    );
  }

  confirmDemolition(): void {
    const id = this.demolitionTarget();
    if (id === null) return;
    const problem = this.game.demolish(this.planet(), id);
    this.demolitionTarget.set(null);
    if (problem) {
      this.message.set(DEMOLITION_ERROR_LABELS[problem]);
      return;
    }
    this.blueprint.set(null);
    this.dragEnd();
    this.message.set('Здание снесено. Участок освобождён.');
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
      this.demolitionTarget.set(null);
      this.selectedTile.set(tile);
      this.activeTab.set('building');
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

  zoomMap(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY === 0 || this.panGesture) return;
    const viewport = event.currentTarget as HTMLElement;
    const bounds = viewport.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
    const delta = Math.max(-500, Math.min(500, event.deltaY * unit));
    const previousZoom = this.zoom();
    const nextZoom = Math.max(
      this.minimumZoom(bounds),
      Math.min(3, previousZoom * Math.exp(-delta * 0.0015)),
    );
    const ratio = nextZoom / previousZoom;
    const anchorX = event.clientX - bounds.left - bounds.width / 2;
    const anchorY = event.clientY - bounds.top - bounds.height / 2;
    const offset = this.mapOffset();
    this.zoom.set(nextZoom);
    this.setMapOffset(
      anchorX - (anchorX - offset.x) * ratio,
      anchorY - (anchorY - offset.y) * ratio,
      viewport,
    );
  }

  startPan(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary || this.dragging()) return;
    this.fitMap(event.currentTarget as HTMLElement);
    const offset = this.mapOffset();
    this.suppressMapClick = false;
    this.panGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
      moved: false,
    };
  }

  movePan(event: PointerEvent): void {
    const gesture = this.panGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
    const viewport = event.currentTarget as HTMLElement;
    if (!gesture.moved) {
      gesture.moved = true;
      viewport.setPointerCapture(event.pointerId);
      this.panning.set(true);
      this.suppressMapClick = true;
    }
    event.preventDefault();
    this.setMapOffset(gesture.offsetX + dx, gesture.offsetY + dy, viewport);
  }

  endPan(event: PointerEvent): void {
    if (this.panGesture?.pointerId !== event.pointerId) return;
    const viewport = event.currentTarget as HTMLElement;
    this.panGesture = null;
    this.panning.set(false);
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  }

  leaveMap(event: PointerEvent): void {
    if (!this.panGesture?.moved) this.endPan(event);
  }

  revealTile(event: FocusEvent): void {
    const tile = event.target as SVGElement;
    if (!tile.matches(':focus-visible')) return;
    const viewport = event.currentTarget as HTMLElement;
    const bounds = viewport.getBoundingClientRect();
    const tileBounds = tile.getBoundingClientRect();
    const dx =
      Math.max(0, bounds.left - tileBounds.left) + Math.min(0, bounds.right - tileBounds.right);
    const dy =
      Math.max(0, bounds.top - tileBounds.top) + Math.min(0, bounds.bottom - tileBounds.bottom);
    const offset = this.mapOffset();
    this.setMapOffset(offset.x + dx, offset.y + dy, viewport);
  }

  private setMapOffset(x: number, y: number, viewport: HTMLElement): void {
    const bounds = viewport.getBoundingClientRect();
    const surface = this.surfaceBounds();
    const limitX = Math.max(0, (surface.width * this.zoom() - bounds.width) / 2);
    const minY = (bounds.height - surface.height * this.zoom()) / 2;
    const maxY = Math.max(minY, -minY + SKY_HEIGHT);
    this.mapOffset.set({
      x: Math.max(-limitX, Math.min(limitX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    });
  }

  private minimumZoom(bounds: { width: number; height: number }): number {
    const surface = this.surfaceBounds();
    return Math.max(
      0.6,
      bounds.width / surface.width,
      (bounds.height - SKY_HEIGHT) / surface.height,
    );
  }

  private fitMap(viewport: HTMLElement): void {
    this.zoom.update((zoom) => Math.max(zoom, this.minimumZoom(viewport.getBoundingClientRect())));
    const offset = this.mapOffset();
    this.setMapOffset(offset.x, offset.y, viewport);
  }

  private place(type: BuildingType, tile: number): void {
    this.activeTab.set('building');
    const problem = this.game.build(this.planet(), type, tile);
    this.message.set(problem ? BUILD_ERROR_LABELS[problem] : 'Строительство начато');
    if (!problem) this.blueprint.set(null);
  }

  private clampPanelWidth(width: number): number {
    return Math.max(MIN_PANEL_WIDTH, Math.min(this.maximumPanelWidth(), width));
  }

  private setPanelWidth(panel: SidePanel, width: number): void {
    this.panelWidths.update((widths) => ({ ...widths, [panel]: this.clampPanelWidth(width) }));
  }
}
