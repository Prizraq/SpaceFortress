import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  computed,
  effect,
  signal,
  untracked,
  ViewChild,
} from '@angular/core';
import { Planet } from '../../../shared/models/interface/planet';
import { SolarSystemRendererService } from '../../services/solar-system-renderer.service';
import { PlanetPanelComponent } from '../planet-panel/planet-panel.component';
import { PlanetMapComponent } from '../../../planet/components/planet-map/planet-map.component';
import { GameSessionService } from '../../../game-session/services/game-session.service';
import { GameSaveControlsComponent } from '../../../game-save/components/game-save-controls/game-save-controls.component';
import { GameIconComponent } from '../../../shared/components/game-icon/game-icon.component';
import { FinancialSummaryComponent } from '../../../game-session/components/financial-summary/financial-summary.component';
import { FinancialWarningsComponent } from '../../../game-session/components/financial-warnings/financial-warnings.component';

@Component({
  selector: 'app-solar-system',
  standalone: true,
  imports: [PlanetPanelComponent, PlanetMapComponent, GameSaveControlsComponent, GameIconComponent, FinancialSummaryComponent, FinancialWarningsComponent],
  templateUrl: './solar-system.component.html',
  styleUrls: ['./solar-system.component.scss'],
  providers: [SolarSystemRendererService],
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class SolarSystemComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pixiContainer', { static: true })
  pixiContainer!: ElementRef<HTMLDivElement>;

  private readonly ngZone = inject(NgZone);
  private readonly renderer = inject(SolarSystemRendererService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly game = inject(GameSessionService);
  readonly connectionDescription = computed(() => {
    if (this.game.systemPaused()) return 'Служебная остановка';
    if (this.game.tabHidden()) return 'Пауза: вкладка скрыта';
    if (this.game.manualPaused()) return 'Ручная пауза';
    return 'Игра идёт';
  });

  get planets(): readonly Planet[] {
    return this.game.planets();
  }
  readonly selectedPlanet = signal<Planet | null>(null);
  readonly renderError = signal(false);
  readonly surfacePlanet = signal<Planet | null>(null);

  constructor() {
    effect(() => {
      this.renderer.setMotionPaused(this.game.paused());
    });
    effect(() => {
      const planets = this.game.planets();
      untracked(() => {
        this.selectedPlanet.set(null);
        this.surfacePlanet.set(null);
        this.renderer.selectPlanet(null);
        try {
          this.renderer.updatePlanets(planets);
          this.renderer.setPaused(false);
        } catch {
          this.renderError.set(true);
        }
      });
    });
  }

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      void this.initPixi().catch(() => this.ngZone.run(() => this.renderError.set(true)));
    });
  }

  private initPixi(): Promise<void> {
    return this.renderer.init(
      this.pixiContainer.nativeElement,
      this.planets,
      (planet) => {
        this.ngZone.run(() => this.selectPlanet(planet));
      },
      (planet) => {
        this.ngZone.run(() => this.openPlanet(planet));
      },
    );
  }

  openPlanet(planet: Planet): void {
    this.selectPlanet(planet);
    this.surfacePlanet.set(planet);
    this.renderer.setPaused(true);
  }

  returnToSystem(): void {
    this.surfacePlanet.set(null);
    this.renderer.setPaused(false);
  }

  selectPlanet(planet: Planet): void {
    this.selectedPlanet.set(planet);
    this.renderer.selectPlanet(planet);
  }

  closePanel(): void {
    this.selectedPlanet.set(null);
    this.renderer.selectPlanet(null);
  }

  togglePause(): void {
    if (this.game.systemPaused() || this.game.tabHidden()) return;
    this.game.setManualPaused(!this.game.manualPaused());
  }

  onKeydown(event: KeyboardEvent): void {
    if (
      event.code !== 'Space' ||
      event.repeat ||
      event.isComposing ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) return;
    if (
      event.target instanceof Element &&
      event.target.closest(
        'button, a, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"]',
      )
    ) return;
    if (this.element.nativeElement.querySelector('[data-pause-blocker]:not([hidden])')) return;
    event.preventDefault();
    this.togglePause();
  }

  ngOnDestroy(): void {
    this.renderer.destroy();
  }
}
