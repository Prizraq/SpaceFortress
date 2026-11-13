import { Injectable } from '@angular/core';
import { Application, Circle, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Planet } from '../models/interface/planet';

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

  async init(host: HTMLDivElement, planets: readonly Planet[], onSelect: (planet: Planet) => void): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundColor: 0x060c0e,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    host.appendChild(app.canvas);
    app.canvas.style.display = 'block';

    const stars = this.createStars();
    const scene = new Container();
    const maxDistance = Math.max(1, ...planets.map((planet) => planet.distanceFromSun));
    const views = planets.map((planet, index) => this.createPlanet(planet, index, maxDistance, onSelect));
    scene.addChild(this.createGrid(), this.createOrbits(views), this.createSun());
    views.forEach((view) => scene.addChild(view.container, view.label));
    app.stage.addChild(stars, scene);
    this.startAnimation(app, scene, stars, views);
  }

  selectPlanet(planet: Planet | null): void {
    this.selectedPlanet = planet;
  }

  destroy(): void {
    this.destroyed = true;
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.textures.forEach((texture) => texture.destroy(true));
    this.textures = [];
    this.selectedPlanet = null;
  }

  private createStars(): Graphics {
    const stars = new Graphics();
    for (let index = 0; index < 220; index++) {
      const horizontal = ((Math.sin(index * 127.1 + 4) * 43758.5453) % 1 + 1) % 1;
      const vertical = ((Math.sin(index * 311.7 + 7) * 22578.1459) % 1 + 1) % 1;
      stars.circle(horizontal * 2000, vertical * 1400, index % 9 === 0 ? 1.1 : 0.55)
        .fill({ color: index % 5 === 0 ? 0xf0cd91 : 0xb7d2d3, alpha: 0.15 + (index % 4) * 0.12 });
    }
    return stars;
  }

  private createGrid(): Graphics {
    const grid = new Graphics();
    for (let coordinate = -480; coordinate <= 480; coordinate += 40) {
      grid.moveTo(coordinate, -360).lineTo(coordinate, 360);
      grid.moveTo(-480, coordinate).lineTo(480, coordinate);
    }
    return grid.stroke({ width: 0.5, color: 0x79e7ec, alpha: 0.055 });
  }

  private createOrbits(views: readonly PlanetView[]): Graphics {
    const orbit = new Graphics();
    views.forEach(({ orbitRadius }) => {
      orbit.ellipse(0, 0, orbitRadius, orbitRadius * 0.65)
        .stroke({ width: 1, color: 0x79e7ec, alpha: 0.2 });
    });
    for (let index = 0; index < 72; index++) {
      const angle = index * Math.PI / 36;
      const length = index % 6 === 0 ? 8 : 3;
      orbit.moveTo(Math.cos(angle) * 330, Math.sin(angle) * 215)
        .lineTo(Math.cos(angle) * (330 + length), Math.sin(angle) * (215 + length * 0.65));
    }
    return orbit.stroke({ width: 1, color: 0x79e7ec, alpha: 0.25 });
  }

  private createSun(): Container {
    const container = new Container();
    const sun = new Graphics();
    for (let radius = 70; radius > 28; radius -= 3) {
      sun.circle(0, 0, radius).fill({ color: 0xf3b65e, alpha: 0.014 });
    }
    sun.circle(0, 0, 28).fill(0xf6c776).circle(-5, -5, 21).fill(0xffdb94)
      .circle(-9, -9, 12).fill({ color: 0xfff0bd, alpha: 0.6 });
    const label = new Text({ text: 'ГЕЛИОС', style: { fontFamily: 'Consolas, monospace', fontSize: 10, fill: 0xdfbd7f } });
    label.anchor.set(0.5, 0);
    label.position.set(0, 48);
    container.addChild(sun, label);
    return container;
  }

  private createPlanet(data: Planet, index: number, maxDistance: number, onSelect: (planet: Planet) => void): PlanetView {
    const container = new Container();
    const body = new Container();
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
    const reticle = new Graphics().arc(0, 0, 47, -0.5, 0.5).stroke({ width: 1.5, color: 0x79e7ec })
      .arc(0, 0, 47, Math.PI - 0.5, Math.PI + 0.5).stroke({ width: 1.5, color: 0x79e7ec });
    reticle.alpha = 0.55;
    body.addChild(this.createAtmosphere(data.athmosphere), globe, this.createCoordinates(), reticle);
    container.addChild(body);
    container.on('pointerdown', () => onSelect(data));
    container.on('pointerover', () => { reticle.alpha = 1; });
    container.on('pointerout', () => { reticle.alpha = 0.55; });
    const label = new Text({ text: data.name.toUpperCase(), style: { fontFamily: 'Consolas, monospace', fontSize: 11, fill: 0xa2dbde } });
    return { data, container, label, reticle, orbitRadius: data.distanceFromSun / maxDistance * 300, angle: -2.6 + index * 1.95 };
  }

  private createAtmosphere(visible: boolean): Graphics {
    const atmosphere = new Graphics();
    if (visible) {
      for (let radius = 46; radius > 35; radius--) {
        atmosphere.circle(0, 0, radius).fill({ color: 0x69dce9, alpha: 0.025 });
      }
    }
    return atmosphere.circle(0, 0, 36).stroke({ width: 1, color: 0x9df4ef, alpha: visible ? 0.8 : 0.25 });
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

  private startAnimation(app: Application, scene: Container, stars: Graphics, views: PlanetView[]): void {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    app.ticker.add((ticker) => {
      const mobile = app.screen.width <= 700;
      const scale = Math.min(1.35, (app.screen.width - (mobile ? 32 : 380)) / 760, app.screen.height / 680);
      scene.scale.set(Math.max(0.35, scale));
      scene.position.set(app.screen.width * (mobile ? 0.5 : 0.38), app.screen.height * (mobile ? 0.31 : 0.53));
      stars.scale.set(app.screen.width / 2000, app.screen.height / 1400);
      views.forEach((view) => {
        if (!reducedMotion) view.angle += 0.0007 * ticker.deltaTime * 365 / view.data.orbitalPeriod;
        view.container.position.set(Math.cos(view.angle) * view.orbitRadius, Math.sin(view.angle) * view.orbitRadius * 0.65);
        view.label.anchor.set(view.container.x >= 0 ? 1 : 0, view.container.y >= 0 ? 0 : 1);
        view.label.position.set(view.container.x, view.container.y + (view.container.y >= 0 ? 60 : -60));
        view.reticle.rotation = reducedMotion ? 0 : view.angle * 3;
        view.reticle.tint = this.selectedPlanet === view.data ? 0xffd18a : 0x79e7ec;
      });
    });
  }

  private createPlanetTexture(planet: Planet, index: number): Texture {
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(size, size);
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const horizontal = (column + 0.5 - size / 2) / (size / 2);
        const vertical = (row + 0.5 - size / 2) / (size / 2);
        const distance = horizontal * horizontal + vertical * vertical;
        if (distance > 1) continue;
        const depth = Math.sqrt(1 - distance);
        const longitude = Math.atan2(horizontal, depth) + 0.7 + index * 1.3;
        const latitude = Math.asin(vertical);
        const terrain = Math.sin(longitude * 3 + Math.sin(latitude * 4))
          + Math.cos(latitude * 7 - longitude * 2) * 0.6
          + Math.sin(longitude * 13 + latitude * 11) * 0.18
          + Math.cos(longitude * 29 - latitude * 23) * 0.08;
        const land = terrain > planet.resourses.water / 100 - 0.67;
        const ice = Math.abs(latitude) > 1.15 && planet.resourses.water > 30;
        const cloud = planet.athmosphere ? Math.pow(Math.max(0, Math.sin(longitude * 8 + latitude * 15 + Math.sin(longitude * 4)) * Math.cos(latitude * 13 - longitude * 6)), 8) * 0.5 : 0;
        const light = 0.16 + 0.84 * Math.max(0, horizontal * -0.6 + vertical * -0.35 + depth * 0.72);
        const rim = Math.pow(1 - depth, 3) * (planet.athmosphere ? 0.5 : 0.1);
        const base = ice ? [172, 214, 209] : land
          ? planet.resourses.water < 20 ? [145 + terrain * 16, 93 + terrain * 14, 65] : [58 + terrain * 16, 126 + terrain * 14, 111]
          : [15, 62, 85];
        const offset = (row * size + column) * 4;
        image.data[offset] = Math.min(255, (base[0] + cloud * 150) * light + rim * 55);
        image.data[offset + 1] = Math.min(255, (base[1] + cloud * 150) * light + rim * 150);
        image.data[offset + 2] = Math.min(255, (base[2] + cloud * 150) * light + rim * 170);
        image.data[offset + 3] = Math.min(255, (1 - distance) * size * 255);
      }
    }
    context.putImageData(image, 0, 0);
    return Texture.from(canvas);
  }
}
