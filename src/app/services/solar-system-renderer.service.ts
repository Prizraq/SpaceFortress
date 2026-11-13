import { Injectable } from '@angular/core';
import { Application, Circle, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Planet } from '../models/interface/planet';
import { createPlanetPixels } from './planet-texture';

interface PlanetView {
  data: Planet;
  container: Container;
  label: Text;
  reticle: Graphics;
  orbitRadius: number;
  angle: number;
}

@Injectable()
export class SolarSystemRendererService {
  private app: Application | null = null;
  private destroyed = false;
  private textures: Texture[] = [];
  private selectedPlanet: Planet | null = null;
  private paused = false;
  private initializing = false;
  async init(
    host: HTMLDivElement,
    planets: readonly Planet[],
    onSelect: (planet: Planet) => void,
    onOpen: (planet: Planet) => void = onSelect,
  ): Promise<void> {
    if (this.destroyed) return;
    if (this.initializing || this.app) throw new Error('Renderer is already initialized');
    this.initializing = true;
    const app = new Application();
    let initialized = false;
    try {
      await app.init({
        backgroundColor: 0x060c0e,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        autoStart: false,
      });
      initialized = true;
      if (this.destroyed) return;
      app.resizeTo = host;
      host.appendChild(app.canvas);
      app.canvas.style.display = 'block';
      this.createScene(app, planets, onSelect, onOpen);
      if (!this.paused) app.start();
      this.app = app;
    } finally {
      this.initializing = false;
      if (this.app !== app) this.releaseApplication(app, initialized);
    }
  }

  private createScene(
    app: Application,
    planets: readonly Planet[],
    onSelect: (planet: Planet) => void,
    onOpen: (planet: Planet) => void,
  ): void {
    const stars = this.createStars(app.stage);
    const scene = app.stage.addChild(new Container());
    const maxDistance = Math.max(1, ...planets.map((planet) => planet.distanceFromSun));
    this.createGrid(scene);
    this.createOrbits(
      scene,
      planets.map((planet) => (planet.distanceFromSun / maxDistance) * 300),
    );
    this.createSun(scene);
    const views = planets.map((planet, index) =>
      this.createPlanet(scene, planet, index, maxDistance, onSelect, onOpen),
    );
    this.startAnimation(app, scene, stars, views);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.app?.stop();
    else {
      this.app?.resize();
      this.app?.start();
    }
  }

  selectPlanet(planet: Planet | null): void {
    this.selectedPlanet = planet;
  }

  destroy(): void {
    this.destroyed = true;
    const app = this.app;
    this.app = null;
    if (app) this.releaseApplication(app, true);
    this.selectedPlanet = null;
  }

  private releaseApplication(app: Application, initialized: boolean): void {
    try {
      if (initialized) {
        app.destroy(true, { children: true });
      } else {
        try {
          app.ticker?.destroy();
        } finally {
          try {
            app.stage.destroy({ children: true });
          } finally {
            app.renderer?.destroy(true);
          }
        }
      }
    } finally {
      const textures = this.textures;
      this.textures = [];
      textures.forEach((texture) => texture.destroy(true));
    }
  }

  private createStars(parent: Container): Graphics {
    const stars = parent.addChild(new Graphics());
    for (let index = 0; index < 220; index++) {
      const horizontal = (((Math.sin(index * 127.1 + 4) * 43758.5453) % 1) + 1) % 1;
      const vertical = (((Math.sin(index * 311.7 + 7) * 22578.1459) % 1) + 1) % 1;
      stars
        .circle(horizontal * 2000, vertical * 1400, index % 9 === 0 ? 1.1 : 0.55)
        .fill({ color: index % 5 === 0 ? 0xf0cd91 : 0xb7d2d3, alpha: 0.15 + (index % 4) * 0.12 });
    }
    return stars;
  }

  private createGrid(parent: Container): Graphics {
    const grid = parent.addChild(new Graphics());
    for (let coordinate = -480; coordinate <= 480; coordinate += 40) {
      grid.moveTo(coordinate, -360).lineTo(coordinate, 360);
      grid.moveTo(-480, coordinate).lineTo(480, coordinate);
    }
    return grid.stroke({ width: 0.5, color: 0x79e7ec, alpha: 0.055 });
  }

  private createOrbits(parent: Container, radii: readonly number[]): Graphics {
    const orbit = parent.addChild(new Graphics());
    radii.forEach((orbitRadius) => {
      orbit
        .ellipse(0, 0, orbitRadius, orbitRadius * 0.65)
        .stroke({ width: 1, color: 0x79e7ec, alpha: 0.2 });
    });
    for (let index = 0; index < 72; index++) {
      const angle = (index * Math.PI) / 36;
      const length = index % 6 === 0 ? 8 : 3;
      orbit
        .moveTo(Math.cos(angle) * 330, Math.sin(angle) * 215)
        .lineTo(Math.cos(angle) * (330 + length), Math.sin(angle) * (215 + length * 0.65));
    }
    return orbit.stroke({ width: 1, color: 0x79e7ec, alpha: 0.25 });
  }

  private createSun(parent: Container): Container {
    const container = parent.addChild(new Container());
    const sun = container.addChild(new Graphics());
    for (let radius = 70; radius > 28; radius -= 3) {
      sun.circle(0, 0, radius).fill({ color: 0xf3b65e, alpha: 0.014 });
    }
    sun
      .circle(0, 0, 28)
      .fill(0xf6c776)
      .circle(-5, -5, 21)
      .fill(0xffdb94)
      .circle(-9, -9, 12)
      .fill({ color: 0xfff0bd, alpha: 0.6 });
    const label = new Text({
      text: 'ГЕЛИОС',
      style: { fontFamily: 'Consolas, monospace', fontSize: 10, fill: 0xdfbd7f },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 48);
    container.addChild(label);
    return container;
  }

  private createPlanet(
    parent: Container,
    data: Planet,
    index: number,
    maxDistance: number,
    onSelect: (planet: Planet) => void,
    onOpen: (planet: Planet) => void,
  ): PlanetView {
    const container = parent.addChild(new Container());
    const body = container.addChild(new Container());
    const size = Math.max(20, Math.min(44, 36 * Math.sqrt(data.radius / 6371)));
    body.scale.set(size / 36);
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.hitArea = new Circle(0, 0, size + 12);
    const texture = this.createPlanetTexture(data, index);
    this.textures.push(texture);
    const globe = new Sprite(texture);
    globe.anchor.set(0.5);
    globe.width = globe.height = 72;
    const reticle = new Graphics()
      .arc(0, 0, 47, -0.5, 0.5)
      .stroke({ width: 1.5, color: 0x79e7ec })
      .arc(0, 0, 47, Math.PI - 0.5, Math.PI + 0.5)
      .stroke({ width: 1.5, color: 0x79e7ec });
    reticle.alpha = 0.55;
    body.addChild(
      this.createAtmosphere(data.athmosphere),
      globe,
      this.createCoordinates(),
      reticle,
    );
    container.on('pointerdown', () => onSelect(data));
    container.on('pointertap', (event) => {
      if (event.detail === 2) onOpen(data);
    });
    container.on('pointerover', () => {
      reticle.alpha = 1;
    });
    container.on('pointerout', () => {
      reticle.alpha = 0.55;
    });
    const label = new Text({
      text: data.name.toUpperCase(),
      style: { fontFamily: 'Consolas, monospace', fontSize: 11, fill: 0xa2dbde },
    });
    label.anchor.set(0.5, 0);
    parent.addChild(label);
    return {
      data,
      container,
      label,
      reticle,
      orbitRadius: (data.distanceFromSun / maxDistance) * 300,
      angle: -2.6 + index * 1.95,
    };
  }

  private createAtmosphere(visible: boolean): Graphics {
    const atmosphere = new Graphics();
    if (visible) {
      for (let radius = 46; radius > 35; radius--) {
        atmosphere.circle(0, 0, radius).fill({ color: 0x69dce9, alpha: 0.025 });
      }
    }
    return atmosphere
      .circle(0, 0, 36)
      .stroke({ width: 1, color: 0x9df4ef, alpha: visible ? 0.8 : 0.25 });
  }

  private createCoordinates(): Graphics {
    const coordinates = new Graphics();
    [-18, 0, 18].forEach((offset) => {
      const width = Math.sqrt(36 * 36 - offset * offset);
      coordinates.ellipse(0, offset, width, 5).stroke({ width: 0.6, color: 0x9df4ef, alpha: 0.3 });
    });
    [12, 26, 36].forEach((width) => {
      coordinates.ellipse(0, 0, width, 36).stroke({ width: 0.6, color: 0x9df4ef, alpha: 0.22 });
    });
    return coordinates;
  }

  private startAnimation(
    app: Application,
    scene: Container,
    stars: Graphics,
    views: PlanetView[],
  ): void {
    let layoutWidth = -1;
    let layoutHeight = -1;
    const update = (deltaMS: number) => {
      const { width, height } = app.screen;
      if (width !== layoutWidth || height !== layoutHeight) {
        layoutWidth = width;
        layoutHeight = height;
        const mobile = width <= 700;
        const scale = Math.min(1.35, (width - (mobile ? 32 : 380)) / 760, height / 680);
        scene.scale.set(Math.max(0.35, scale));
        scene.position.set(width * (mobile ? 0.5 : 0.38), height * (mobile ? 0.31 : 0.53));
        stars.scale.set(width / 2000, height / 1400);
      }
      const deltaSeconds = Math.max(0, Math.min(deltaMS, 1000 / 30)) / 1000;
      views.forEach((view) => {
        view.angle += (0.042 * deltaSeconds * 365) / view.data.orbitalPeriod;
        view.container.position.set(
          Math.cos(view.angle) * view.orbitRadius,
          Math.sin(view.angle) * view.orbitRadius * 0.65,
        );
        view.label.position.set(view.container.x, view.container.y + 60);
        view.reticle.rotation = view.angle * 3;
        view.reticle.tint = this.selectedPlanet === view.data ? 0xffd18a : 0x79e7ec;
      });
    };
    update(0);
    app.ticker.add((ticker) => update(ticker.deltaMS));
  }

  private createPlanetTexture(planet: Planet, index: number): Texture {
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable');
    const image = context.createImageData(size, size);
    image.data.set(createPlanetPixels(planet, index, size));
    context.putImageData(image, 0, 0);
    return Texture.from(canvas);
  }
}
