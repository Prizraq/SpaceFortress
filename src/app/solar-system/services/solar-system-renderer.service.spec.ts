import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Application as PixiApplication, Circle, Sprite, Text, Texture } from 'pixi.js';
import { SolarSystemRendererService } from './solar-system-renderer.service';
import { PlanetService } from '../../shared/services/planet.service';
import { createPlanetPixels } from './planet-texture';
import { createSunPixels } from './sun-texture';

const mocks = vi.hoisted(() => ({
  applications: [] as PixiApplication[],
  initialize: vi.fn<(app: PixiApplication) => Promise<void>>(),
}));

vi.mock('pixi.js', () => {
  class Container {
    children: Container[] = [];
    scale = { set: vi.fn() };
    position = { set: vi.fn() };
    anchor = { set: vi.fn() };
    addChild(...children: Container[]) {
      this.children.push(...children);
      return children[0];
    }
    removeChildren() {
      return this.children.splice(0);
    }
    destroy = vi.fn(() => this.children.forEach((child) => child.destroy()));
    on() {
      return this;
    }
  }
  class Graphics extends Container {
    circle() {
      return this;
    }
    ellipse() {
      return this;
    }
    arc() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
    fill() {
      return this;
    }
    stroke() {
      return this;
    }
  }
  class Application {
    stage = new Container();
    renderer: { canvas: HTMLCanvasElement } | undefined;
    screen = { width: 1200, height: 800 };
    ticker = { add: vi.fn(), remove: vi.fn(), destroy: vi.fn() };
    constructor() {
      mocks.applications.push(this as unknown as PixiApplication);
    }
    async init() {
      await mocks.initialize(this as unknown as PixiApplication);
      this.renderer = { canvas: document.createElement('canvas') };
    }
    get canvas() {
      return this.renderer!.canvas;
    }
    start = vi.fn();
    stop = vi.fn();
    resize = vi.fn();
    destroy = vi.fn(() => {
      this.stage.destroy();
      this.renderer?.canvas.remove();
    });
  }
  return {
    Application,
    Container,
    Graphics,
    Sprite: Container,
    Text: Container,
    Circle: class {
      constructor(public x: number, public y: number, public radius: number) {}
    },
    Texture: { from: vi.fn() },
  };
});

describe('SolarSystemRendererService lifecycle', () => {
  let service: SolarSystemRendererService;
  let host: HTMLDivElement;

  beforeEach(() => {
    mocks.applications.length = 0;
    mocks.initialize.mockReset().mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: vi.fn(),
    } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    vi.mocked(Texture.from)
      .mockReset()
      .mockImplementation(() => ({ destroy: vi.fn() }) as unknown as Texture);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    service = new SolarSystemRendererService();
    host = document.createElement('div');
  });
  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('releases the stage when renderer initialization rejects', async () => {
    const error = new Error('No rendering backend');
    mocks.initialize.mockRejectedValueOnce(error);
    await expect(service.init(host, [], vi.fn())).rejects.toBe(error);
    expect(mocks.applications[0].stage.destroy).toHaveBeenCalledOnce();
    expect(mocks.applications[0].destroy).not.toHaveBeenCalled();
    expect(host.children).toHaveLength(0);
  });

  it('cleans up a renderer created before init rejects', async () => {
    const destroy = vi.fn();
    const error = new Error('Initialization interrupted');
    mocks.initialize.mockImplementationOnce(async (app) => {
      app.renderer = { destroy } as unknown as PixiApplication['renderer'];
      throw error;
    });
    await expect(service.init(host, [], vi.fn())).rejects.toBe(error);
    expect(destroy).toHaveBeenCalledWith(true);
    expect(mocks.applications[0].ticker.destroy).toHaveBeenCalledOnce();
    expect(mocks.applications[0].stage.destroy).toHaveBeenCalledOnce();
  });

  it('defers destruction until a pending initialization settles', async () => {
    let resolve!: () => void;
    mocks.initialize.mockImplementationOnce(
      () =>
        new Promise<void>((complete) => {
          resolve = complete;
        }),
    );
    const initialization = service.init(host, [], vi.fn());
    const app = mocks.applications[0];
    service.setPaused(true);
    service.destroy();
    expect(app.destroy).not.toHaveBeenCalled();
    resolve();
    await initialization;
    expect(app.destroy).toHaveBeenCalledOnce();
    expect(app.start).not.toHaveBeenCalled();
    expect(host.children).toHaveLength(0);
  });

  it('releases a partial scene and owned textures on construction failure', async () => {
    const texture = { destroy: vi.fn() };
    const error = new Error('Texture creation failed');
    vi.mocked(Texture.from)
      .mockReturnValueOnce(texture as unknown as Texture)
      .mockImplementationOnce(() => {
        throw error;
      });
    await expect(service.init(host, new PlanetService().getPlanets(), vi.fn())).rejects.toBe(error);
    const app = mocks.applications[0];
    expect(app.stage.children.length).toBeGreaterThan(0);
    expect(app.destroy).toHaveBeenCalledOnce();
    expect(app.start).not.toHaveBeenCalled();
    expect(texture.destroy).toHaveBeenCalledWith(true);
    service.setPaused(false);
    service.destroy();
    expect(app.start).not.toHaveBeenCalled();
    expect(app.destroy).toHaveBeenCalledOnce();
    expect(texture.destroy).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
  });

  it('keeps an initially paused scene stopped and destroys it exactly once', async () => {
    service.setPaused(true);
    await service.init(host, [], vi.fn());
    const app = mocks.applications[0];
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(app.start).not.toHaveBeenCalled();
    service.setPaused(false);
    expect(app.resize).toHaveBeenCalledOnce();
    expect(app.start).toHaveBeenCalledOnce();
    service.destroy();
    service.destroy();
    expect(app.destroy).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
  });

  it('rejects concurrent initialization and ignores initialization after destruction', async () => {
    const initialization = service.init(host, [], vi.fn());
    await expect(service.init(host, [], vi.fn())).rejects.toThrow('already initialized');
    await initialization;
    service.destroy();
    await service.init(host, [], vi.fn());
    expect(mocks.applications).toHaveLength(1);
  });

  it('rebuilds restored planets without retaining old animation callbacks, scene, or textures', async () => {
    const planets = new PlanetService().getPlanets();
    await service.init(host, planets.slice(0, 1), vi.fn());
    const app = mocks.applications[0];
    const children = [...app.stage.children];
    const animation = vi.mocked(app.ticker.add).mock.calls[0][0];
    const textures = vi.mocked(Texture.from).mock.results.map((result) => result.value as Texture);
    service.updatePlanets(planets);
    expect(app.ticker.remove).toHaveBeenCalledExactlyOnceWith(animation);
    expect(app.ticker.add).toHaveBeenCalledTimes(2);
    children.forEach((child) => expect(child.destroy).toHaveBeenCalledOnce());
    textures.forEach((texture) => expect(texture.destroy).toHaveBeenCalledExactlyOnceWith(true));
    const scene = app.stage.children[1];
    expect(scene.children.filter((child) => child.hitArea)).toHaveLength(3);
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(app.destroy).not.toHaveBeenCalled();
  });

  it('uses the restored planets if they change while initialization is pending', async () => {
    let resolve!: () => void;
    mocks.initialize.mockImplementationOnce(() => new Promise<void>((complete) => {
      resolve = complete;
    }));
    const planets = new PlanetService().getPlanets();
    const initialization = service.init(host, planets.slice(0, 1), vi.fn());
    service.updatePlanets(planets);
    resolve();
    await initialization;
    const scene = mocks.applications[0].stage.children[1];
    expect(scene.children.filter((child) => child.hitArea)).toHaveLength(3);
    expect(mocks.applications[0].ticker.add).toHaveBeenCalledOnce();
  });

  it('keeps visible planets smaller than the sun without shrinking their click areas', async () => {
    const planets = [1, 3389, 6371, 8500, 100000].map((radius) => ({
      ...new PlanetService().getPlanets()[0],
      radius,
    }));
    await service.init(host, planets, vi.fn());
    const scene = mocks.applications[0].stage.children[1];
    const sun = scene.children[2].children[0] as Sprite;
    const canvas = vi.mocked(Texture.from).mock.calls[0][0] as HTMLCanvasElement;
    const pixels = createSunPixels(canvas.width);
    let opaquePixels = 0;
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[((canvas.height / 2) * canvas.width + x) * 4 + 3] === 255) opaquePixels++;
    }
    const sunDiameter = (opaquePixels / canvas.width) * sun.width;
    const markers = scene.children.filter((child) => child.hitArea);
    expect(markers).toHaveLength(planets.length);
    markers.forEach((marker, index) => {
      const body = marker.children[0];
      const globe = body.children[1] as Sprite;
      const scale = vi.mocked(body.scale.set).mock.calls[0][0]!;
      const previousRadius = Math.max(20, Math.min(44, 36 * Math.sqrt(planets[index].radius / 6371)));
      const diameter = globe.width * scale;
      expect(diameter).toBeCloseTo(previousRadius * 2 * 0.75);
      expect(sunDiameter).toBeGreaterThan(diameter);
      expect(marker.hitArea).toBeInstanceOf(Circle);
      expect((marker.hitArea as Circle).radius).toBeCloseTo(previousRadius + 12);
      expect(marker.eventMode).toBe('static');
      expect(marker.cursor).toBe('pointer');
    });
  });

  it('releases the partial renderer and textures when rebuilding a restored scene fails', async () => {
    await service.init(host, [], vi.fn());
    const error = new Error('Texture creation failed');
    const texture = { destroy: vi.fn() };
    vi.mocked(Texture.from)
      .mockReturnValueOnce(texture as unknown as Texture)
      .mockImplementationOnce(() => { throw error; });
    expect(() => service.updatePlanets(new PlanetService().getPlanets())).toThrow(error);
    expect(texture.destroy).toHaveBeenCalledExactlyOnceWith(true);
    expect(mocks.applications[0].destroy).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
  });

  it.each([true, false])(
    'always animates smoothly with reducedMotion=%s',
    async (reducedMotion) => {
      vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
      service = new SolarSystemRendererService();
      vi.mocked(Texture.from).mockReturnValue({ destroy: vi.fn() } as unknown as Texture);
      await service.init(host, new PlanetService().getPlanets().slice(0, 1), vi.fn());
      const app = mocks.applications[0];
      const scene = app.stage.children[1];
      const marker = scene.children.find((child) => child.hitArea)!;
      const positions = vi.mocked(marker.position.set);
      const update = vi.mocked(app.ticker.add).mock.calls[0][0] as (ticker: {
        deltaMS: number;
      }) => void;
      const initial = positions.mock.lastCall;
      for (const fps of [30, 60, 144]) {
        for (let frame = 0; frame < fps; frame++) update({ deltaMS: 1000 / fps });
        const elapsedSeconds = [30, 60, 144].indexOf(fps) + 1;
        const planet = new PlanetService().getPlanets()[0];
        const angle = -2.6 + (0.042 * elapsedSeconds * 365) / planet.orbitalPeriod;
        const radius = (planet.distanceFromSun / Math.max(1, planet.distanceFromSun)) * 300;
        expect(positions.mock.lastCall![0]).toBeCloseTo(Math.cos(angle) * radius, 8);
        expect(positions.mock.lastCall![1]).toBeCloseTo(Math.sin(angle) * radius * 0.65, 8);
      }
      expect(positions.mock.lastCall).not.toEqual(initial);
      const beforeSpike = positions.mock.lastCall!;
      update({ deltaMS: 1000 });
      expect(
        Math.hypot(
          positions.mock.lastCall![0]! - beforeSpike[0]!,
          positions.mock.lastCall![1]! - beforeSpike[1]!,
        ),
      ).toBeLessThan(1);
      expect(scene.scale.set).toHaveBeenCalledOnce();
      const label = scene.children[scene.children.length - 1] as Text;
      expect(label.anchor.set).toHaveBeenCalledExactlyOnceWith(0.5, 0);
      app.screen.width = 390;
      update({ deltaMS: 1000 / 60 });
      expect(scene.scale.set).toHaveBeenCalledTimes(2);
      expect(app.ticker.add).toHaveBeenCalledOnce();
    },
  );

  it('freezes orbital positions on pause while allowing selection and resize, then resumes without catch-up', async () => {
    const planets = new PlanetService().getPlanets().slice(0, 1);
    service.setMotionPaused(true);
    await service.init(host, planets, vi.fn());
    const app = mocks.applications[0];
    const scene = app.stage.children[1];
    const marker = scene.children.find((child) => child.hitArea)!;
    const reticle = marker.children[0].children[3];
    const positions = vi.mocked(marker.position.set);
    const initial = positions.mock.lastCall;
    const rotation = reticle.rotation;
    const update = vi.mocked(app.ticker.add).mock.calls[0][0] as (ticker: {
      deltaMS: number;
    }) => void;

    service.selectPlanet(planets[0]);
    app.screen.width = 390;
    for (let frame = 0; frame < 120; frame++) update({ deltaMS: 1000 / 60 });
    expect(positions.mock.lastCall).toEqual(initial);
    expect(reticle.rotation).toBe(rotation);
    expect(reticle.tint).toBe(0xffd18a);
    expect(scene.scale.set).toHaveBeenCalledTimes(2);
    expect(app.stop).not.toHaveBeenCalled();

    service.setMotionPaused(false);
    update({ deltaMS: 1000 / 60 });
    const angle = -2.6 + (0.042 * (1 / 60) * 365) / planets[0].orbitalPeriod;
    const radius = (planets[0].distanceFromSun / Math.max(1, planets[0].distanceFromSun)) * 300;
    expect(positions.mock.lastCall![0]).toBeCloseTo(Math.cos(angle) * radius, 8);
    expect(positions.mock.lastCall![1]).toBeCloseTo(Math.sin(angle) * radius * 0.65, 8);
    service.setMotionPaused(true);
    const resumed = positions.mock.lastCall;
    update({ deltaMS: 1000 });
    expect(positions.mock.lastCall).toEqual(resumed);
  });

  it('generates deterministic nonblank planet pixels with transparent corners', () => {
    const [dry, wet] = new PlanetService().getPlanets();
    const pixels = createPlanetPixels(wet, 1, 32);
    expect(pixels).toHaveLength(32 * 32 * 4);
    expect(pixels[3]).toBe(0);
    expect(pixels[(16 * 32 + 16) * 4 + 3]).toBe(255);
    expect(pixels[(16 * 32 + 16) * 4 + 2]).toBeGreaterThan(0);
    expect(pixels).toEqual(createPlanetPixels(wet, 1, 32));
    expect(pixels).not.toEqual(createPlanetPixels(dry, 0, 32));
  });

  it('renders an emissive sun with a bright core and a fading transparent corona', () => {
    const size = 64;
    const pixels = createSunPixels(size);
    const pixel = (x: number, y: number) =>
      pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4);
    expect(pixel(0, 0)[3]).toBe(0);
    expect(pixel(32, 32)[3]).toBe(255);
    expect(pixel(32, 32)[1]).toBeGreaterThan(235);
    expect(pixel(32, 32)[2]).toBeGreaterThan(190);
    expect(pixel(46, 32)[3]).toBeGreaterThan(pixel(60, 32)[3]);
    expect(pixel(60, 32)[3]).toBeGreaterThan(0);
    const quadrants = [pixel(28, 28), pixel(35, 28), pixel(28, 35), pixel(35, 35)];
    for (const sample of quadrants) {
      expect(sample[0]).toBe(255);
      expect(sample[1]).toBeGreaterThan(220);
      expect(sample[3]).toBe(255);
    }
    expect(pixels).toEqual(createSunPixels(size));
  });
});
