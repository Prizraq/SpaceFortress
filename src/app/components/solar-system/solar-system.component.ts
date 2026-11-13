import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  NgZone,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { Planet } from '../../models/interface/planet';
import { PlanetService } from '../../services/planet.service';
import { SolarSystemRendererService } from '../../services/solar-system-renderer.service';
import { PlanetPanelComponent } from '../planet-panel/planet-panel.component';
import { PlanetMapComponent } from '../planet-map/planet-map.component';

@Component({
  selector: 'app-solar-system',
  standalone: true,
  imports: [PlanetPanelComponent, PlanetMapComponent],
  templateUrl: './solar-system.component.html',
  styleUrls: ['./solar-system.component.scss'],
  providers: [SolarSystemRendererService],
})
export class SolarSystemComponent implements AfterViewInit, OnDestroy {
  @ViewChild('pixiContainer', { static: true })
  pixiContainer!: ElementRef<HTMLDivElement>;

  private readonly ngZone = inject(NgZone);
  private readonly planetService = inject(PlanetService);
  private readonly renderer = inject(SolarSystemRendererService);

  readonly planets = this.planetService.getPlanets();
  readonly selectedPlanet = signal<Planet | null>(null);
  readonly renderError = signal(false);
  readonly surfacePlanet = signal<Planet | null>(null);
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

  ngOnDestroy(): void {
    this.renderer.destroy();
  }
}
