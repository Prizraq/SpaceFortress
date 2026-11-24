import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingType } from '../../models/enum/building-type';
import { PlanetService } from '../../../shared/services/planet.service';
import { PlanetMapComponent } from './planet-map.component';

describe('PlanetMapComponent', () => {
  let fixture: ComponentFixture<PlanetMapComponent>;
  let component: PlanetMapComponent;
  let resizeViewport: () => void;
  const disconnectObserver = vi.fn<() => void>();

  beforeEach(async () => {
    vi.useFakeTimers();
    disconnectObserver.mockClear();
    vi.stubGlobal(
      'ResizeObserver',
      class implements ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeViewport = () => callback([], this);
        }
        observe(_target: Element): void {}
        unobserve(_target: Element): void {}
        disconnect(): void {
          disconnectObserver();
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number): ImageData => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
        colorSpace: 'srgb',
      }),
      putImageData(_image: ImageData, _x: number, _y: number): void {},
    } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,surface',
    );
    await TestBed.configureTestingModule({ imports: [PlanetMapComponent] }).compileComponents();
    fixture = TestBed.createComponent(PlanetMapComponent);
    component = fixture.componentInstance;
    component.game.setSystemPaused(false);
    fixture.componentRef.setInput('planet', new PlanetService().getPlanets()[1]);
    fixture.detectChanges();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const mapViewport = () => {
    const viewport = fixture.nativeElement.querySelector('.map-viewport') as HTMLDivElement;
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 500, 400));
    let captured = false;
    viewport.setPointerCapture = vi.fn(() => {
      captured = true;
    });
    viewport.hasPointerCapture = vi.fn(() => captured);
    viewport.releasePointerCapture = vi.fn(() => {
      captured = false;
    });
    return viewport;
  };
  const pointer = (
    target: Element,
    type: string,
    x: number,
    y: number,
    options: PointerEventInit = {},
  ) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y,
        ...options,
      }),
    );

  it('uses shared game time for construction displays through the completion boundary', () => {
    const game = component.game;
    const planet = component.planet();
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(5000);
    game.build(planet, BuildingType.Minerals, 1);
    component.selectTile(1);
    const minerals = component.colony().stocks.minerals;
    const expectProgress = (percent: number, seconds: number) => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-tile="1"] text').textContent.trim())
        .toBe(`${percent}%`);
      const bar = fixture.nativeElement.querySelector('.construction-progress span') as HTMLElement;
      expect(bar.style.width).toBe(`${percent}%`);
      const rows = fixture.nativeElement.querySelectorAll(
        '.inspector dl > div',
      ) as NodeListOf<HTMLDivElement>;
      const remaining = Array.from(rows).find(
        (row) => row.querySelector('dt')?.textContent?.trim() === 'До завершения',
      );
      expect(remaining?.querySelector('dd')?.textContent?.trim()).toBe(`${seconds} с`);
    };
    expectProgress(0, 6);
    vi.advanceTimersByTime(2000);
    game.tick();
    expectProgress(33, 4);
    vi.setSystemTime(new Date('2040-01-01'));
    game.tick();
    expectProgress(33, 4);
    vi.setSystemTime(new Date('2000-01-01'));
    game.tick();
    expectProgress(33, 4);
    vi.advanceTimersByTime(4000);
    game.tick();
    expect(game.clock()).toBe(11000);
    expect(component.inspected()!.completed).toBe(false);
    expectProgress(100, 0);
    vi.advanceTimersByTime(999);
    game.tick();
    expectProgress(100, 0);
    vi.advanceTimersByTime(1);
    fixture.detectChanges();
    expect(component.inspected()!.completed).toBe(true);
    expect(component.colony().stocks.minerals).toBe(minerals);
    expect(fixture.nativeElement.querySelector('.construction-progress')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-tile="1"] text').textContent.trim())
      .toBe('MIN');
    expect(fixture.nativeElement.querySelector('.inspector').textContent)
      .not.toContain('До завершения');
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(component.colony().stocks.minerals).toBe(minerals + 11);
  });

  it('freezes all construction displays on pause while allowing inspection and navigation', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    component.selectTile(0);
    vi.advanceTimersByTime(1000);
    component.game.setManualPaused(true);
    fixture.detectChanges();
    const building = component.inspected()!;
    expect(component.progress(building)).toBe(25);
    expect(component.remaining(building)).toBe(3);
    expect(fixture.nativeElement.querySelector('[data-tile="0"] text').textContent.trim()).toBe('25%');
    const progress = fixture.nativeElement.querySelector('.construction-progress span') as HTMLElement;
    expect(progress.style.width).toBe('25%');
    vi.advanceTimersByTime(60000);
    component.selectTile(1);
    expect(component.selectedTile()).toBe(1);
    component.selectTile(0);
    fixture.detectChanges();
    expect(component.progress(component.inspected()!)).toBe(25);
    expect(component.remaining(component.inspected()!)).toBe(3);
    expect(progress.style.width).toBe('25%');
    expect(Array.from(
      fixture.nativeElement.querySelectorAll('.catalogue .build-button') as NodeListOf<HTMLButtonElement>,
    ).every((button) => button.disabled)).toBe(true);
    expect(fixture.nativeElement.querySelector('.catalogue').textContent).toContain('Игра на паузе');
    const back = vi.fn();
    component.back.subscribe(back);
    (fixture.nativeElement.querySelector('.back-button') as HTMLButtonElement).click();
    expect(back).toHaveBeenCalledOnce();
    expect(component.game.paused()).toBe(true);
  });

  it.each(['manual', 'system'])(
    'blocks pending placement, drag, demolition confirmation, and switching during %s pause',
    (reason) => {
      const planet = component.planet();
      component.game.build(planet, BuildingType.Base, 0);
      vi.advanceTimersByTime(4000);
      component.game.build(planet, BuildingType.Minerals, 1);
      vi.advanceTimersByTime(6000);
      component.selectTile(1);
      component.requestDemolition();
      component.blueprint.set(BuildingType.Power);
      if (reason === 'manual') component.game.setManualPaused(true);
      else component.game.setSystemPaused(true);
      fixture.detectChanges();
      const snapshot = component.game.colonies();
      const toggle = fixture.nativeElement.querySelector(
        '[data-building-toggle]',
      ) as HTMLButtonElement;
      const confirm = fixture.nativeElement.querySelector(
        '[role="group"] .demolish-button',
      ) as HTMLButtonElement;
      expect(toggle.disabled).toBe(true);
      expect(toggle.title).toContain('Игра на паузе');
      expect(confirm.disabled).toBe(true);
      component.confirmDemolition();
      expect(component.message()).toContain('Игра на паузе');
      component.toggleBuilding();
      expect(component.message()).toContain('Игра на паузе');
      component.selectTile(2);
      expect(component.message()).toContain('Игра на паузе');
      const definition = component.game.definition(BuildingType.Power);
      const drag = new Event('dragstart', { cancelable: true }) as DragEvent;
      component.dragStart(drag, definition);
      expect(drag.defaultPrevented).toBe(true);
      const drop = new Event('drop', { cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', {
        value: { getData: () => BuildingType.Power },
      });
      component.drop(drop, 2);
      expect(component.message()).toContain('Игра на паузе');
      expect(component.game.colonies()).toBe(snapshot);
    },
  );

  it('shares one continuous texture across hexagons and regenerates only on planet changes', () => {
    const terrain = fixture.nativeElement.querySelector('.surface-terrain') as SVGImageElement;
    expect(terrain.getAttribute('href')).toBe('data:image/png;base64,surface');
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledOnce();
    const fills = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.hex-tile > polygon',
      ) as NodeListOf<SVGPolygonElement>,
      (polygon) => polygon.getAttribute('fill'),
    );
    expect(new Set(fills)).toEqual(new Set(['transparent']));
    expect(fixture.nativeElement.querySelector('.surface-background').getAttribute('fill')).toBe(
      `url(#${component.surfacePatternId})`,
    );
    component.selectTile(0);
    mapViewport().dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('planet', new PlanetService().getPlanets()[0]);
    fixture.detectChanges();
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(2);
    expect(terrain.getAttribute('href')).toBe('data:image/png;base64,surface');
  });

  it('extends the terrain beyond hexagons and clips its upper edge to a shallow horizon', () => {
    const background = fixture.nativeElement.querySelector(
      'rect.surface-background',
    ) as SVGRectElement;
    const pattern = fixture.nativeElement.querySelector('pattern') as SVGPatternElement;
    const terrain = fixture.nativeElement.querySelector('.surface-terrain') as SVGImageElement;
    const left = Number(background.getAttribute('x'));
    const top = Number(background.getAttribute('y'));
    const right = left + Number(background.getAttribute('width'));
    const bottom = top + Number(background.getAttribute('height'));
    const corners = component
      .geometry()
      .tiles.flatMap((tile) => tile.points.split(' ').map((point) => point.split(',').map(Number)));
    expect(left).toBeLessThan(Math.min(...corners.map(([x]) => x)));
    expect(top).toBeLessThan(Math.min(...corners.map(([, y]) => y)));
    expect(right).toBeGreaterThan(Math.max(...corners.map(([x]) => x)));
    expect(bottom).toBeGreaterThan(Math.max(...corners.map(([, y]) => y)));
    expect(background.getAttribute('fill')).toBe(`url(#${component.surfacePatternId})`);
    expect(background.getAttribute('pointer-events')).toBe('none');
    expect(background.getAttribute('clip-path')).toBe(`url(#${component.surfacePatternId}-clip)`);
    const clip = fixture.nativeElement.querySelector('clipPath path') as SVGPathElement;
    expect(clip.getAttribute('d')).toBe(component.surfaceOutline());
    const curve = component
      .horizonPath()
      .match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
    const [startX, startY, controlX, controlY, endX, endY] = curve;
    expect(startX).toBe(left);
    expect(endX).toBe(right);
    expect(controlX).toBeCloseTo((left + right) / 2);
    expect(startY).toBe(endY);
    expect(controlY).toBeLessThan(startY);
    expect((startY + controlY) / 2).toBe(top);
    expect(startY).toBeLessThan(Math.min(...corners.map(([, y]) => y)));
    for (const attribute of ['x', 'y', 'width', 'height']) {
      expect(pattern.getAttribute(attribute)).toBe(background.getAttribute(attribute));
    }
    for (const attribute of ['width', 'height']) {
      expect(terrain.getAttribute(attribute)).toBe(background.getAttribute(attribute));
    }
  });

  it('compresses the ground to 75% height without compressing building sprites', () => {
    const tile = component.geometry().tiles.find((tile) => tile.id === 0)!;
    const corners = tile.points.split(' ').map((point) => point.split(',').map(Number));
    const width = Math.max(...corners.map(([x]) => x)) - Math.min(...corners.map(([x]) => x));
    const height = Math.max(...corners.map(([, y]) => y)) - Math.min(...corners.map(([, y]) => y));
    expect(width).toBeCloseTo(30 * Math.sqrt(3));
    expect(height).toBeCloseTo(60 * 0.75);
    const surface = component.surfaceBounds();
    const unprojectedHeight = surface.height / 0.75;
    const textureScale = Math.min(1.5, 1200 / Math.max(surface.width, unprojectedHeight));
    const canvas = vi.mocked(HTMLCanvasElement.prototype.toDataURL).mock.instances[0];
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing terrain canvas');
    expect(canvas.height).toBe(Math.min(1200, Math.ceil(unprojectedHeight * textureScale)));
    component.selectTile(tile.id);
    component.choose(component.game.definition(BuildingType.Base));
    fixture.detectChanges();
    const group = fixture.nativeElement.querySelector(`[data-tile="${tile.id}"]`) as SVGGElement;
    const sprite = group.querySelector('.building-sprite')!;
    expect(Number(sprite.getAttribute('width'))).toBe(50);
    expect(Number(sprite.getAttribute('height'))).toBe(40);
    const spriteTop = Number(sprite.getAttribute('y'));
    expect(spriteTop).toBeGreaterThanOrEqual(Math.min(...corners.map(([, y]) => y)));
    expect(spriteTop + 40).toBeLessThanOrEqual(Math.max(...corners.map(([, y]) => y)));
    expect(Number(sprite.getAttribute('y')) + Number(sprite.getAttribute('height'))).toBe(
      tile.y + 18,
    );
    expect(Number(group.querySelector('.building-shadow')!.getAttribute('cy'))).toBe(tile.y + 18);
  });

  it('renders hexagons back-to-front while preserving their logical tile ids', () => {
    const tiles = component.geometry().tiles;
    const ids = Array.from(
      fixture.nativeElement.querySelectorAll('.hex-tile') as NodeListOf<SVGGElement>,
      (tile) => Number(tile.getAttribute('data-tile')),
    );
    expect([...ids].sort((a, b) => a - b)).toEqual(
      Array.from({ length: component.side() ** 2 }, (_, id) => id),
    );
    const depthOrder = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(ids).toEqual(depthOrder.map((tile) => tile.id));
    const nearest = depthOrder[depthOrder.length - 1];
    const group = fixture.nativeElement.querySelector(`[data-tile="${nearest.id}"]`) as SVGGElement;
    group.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    component.choose(component.game.definition(BuildingType.Base));
    expect(component.selectedTile()).toBe(nearest.id);
    expect(component.colony().buildings[0].tile).toBe(nearest.id);
  });

  it('opens at 150% and zooms toward the cursor without zoom buttons', () => {
    const viewport = mapViewport();
    const svg = fixture.nativeElement.querySelector('.hex-map') as SVGElement;
    expect(Number.parseFloat(svg.style.width)).toBe(component.geometry().width * 1.5);
    expect(fixture.nativeElement.querySelector('.zoom-controls')).toBeNull();
    const event = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 310,
      bubbles: true,
      cancelable: true,
    });
    viewport.dispatchEvent(event);
    fixture.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(component.zoom()).toBeGreaterThan(1.5);
    expect((130 - component.mapOffset().x) / component.zoom()).toBeCloseTo(130 / 1.5);
    expect((80 - component.mapOffset().y) / component.zoom()).toBeCloseTo(80 / 1.5);
    expect(Number.parseFloat(svg.style.width)).toBe(component.geometry().width * component.zoom());
    for (let step = 0; step < 20; step++)
      viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000 }));
    expect(component.zoom()).toBe(3);
    for (let step = 0; step < 20; step++)
      viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000 }));
    const surface = component.surfaceBounds();
    expect(component.zoom()).toBeCloseTo(
      Math.max(0.6, 500 / surface.width, (400 - 24) / surface.height),
    );
  });

  it.each([
    { mode: 0, delta: -16, pixels: 16 },
    { mode: 1, delta: -1, pixels: 16 },
    { mode: 2, delta: -1, pixels: 400 },
  ])('normalizes wheel delta mode $mode', ({ mode, delta, pixels }) => {
    const viewport = mapViewport();
    viewport.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: delta,
        deltaMode: mode,
        clientX: 270,
        clientY: 230,
      }),
    );
    expect(component.zoom()).toBeCloseTo(1.5 * Math.exp(pixels * 0.0015));
    expect(component.mapOffset()).toEqual({ x: 0, y: 0 });
  });

  it('pans without selecting or building, while allowing a short click to build', () => {
    const viewport = mapViewport();
    const tile = fixture.nativeElement.querySelector('[data-tile="0"]') as SVGElement;
    component.choose(component.game.definition(BuildingType.Base));
    pointer(tile, 'pointerdown', 100, 100);
    pointer(viewport, 'pointermove', 140, 120);
    fixture.detectChanges();
    expect(component.panning()).toBe(true);
    expect(component.mapOffset()).toEqual({ x: 40, y: 20 });
    expect(viewport.setPointerCapture).toHaveBeenCalledWith(1);
    pointer(viewport, 'pointerup', 140, 120);
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.selectedTile()).toBeNull();
    expect(component.colony().buildings).toHaveLength(0);
    expect(component.blueprint()).toBe(BuildingType.Base);
    expect(component.panning()).toBe(false);
    expect(viewport.releasePointerCapture).toHaveBeenCalledWith(1);
    pointer(tile, 'pointerdown', 100, 100);
    pointer(viewport, 'pointermove', 103, 100);
    pointer(tile, 'pointerup', 103, 100);
    tile.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.selectedTile()).toBe(0);
    expect(component.colony().buildings).toHaveLength(1);
  });

  it('bounds panning, ignores other pointers, and ends a cancelled gesture', () => {
    const viewport = mapViewport();
    pointer(viewport, 'pointerdown', 100, 100);
    pointer(viewport, 'pointermove', 200, 200, { pointerId: 2 });
    expect(component.mapOffset()).toEqual({ x: 0, y: 0 });
    pointer(viewport, 'pointermove', 10000, 10000);
    const offset = component.mapOffset();
    expect(offset.x).toBe((component.surfaceBounds().width * 1.5 - 500) / 2);
    expect(offset.y).toBe((component.surfaceBounds().height * 1.5 - 400) / 2 + 24);
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(component.zoom()).toBe(1.5);
    pointer(viewport, 'pointercancel', 10000, 10000);
    pointer(viewport, 'pointermove', 10, 10);
    expect(component.mapOffset()).toEqual(offset);
    expect(component.panning()).toBe(false);
    pointer(viewport, 'pointerdown', 100, 100, { button: 2 });
    pointer(viewport, 'pointermove', 200, 200);
    expect(component.mapOffset()).toEqual(offset);
    fixture.componentRef.setInput('planet', new PlanetService().getPlanets()[0]);
    fixture.detectChanges();
    expect(component.mapOffset()).toEqual({ x: 0, y: 0 });
    expect(component.zoom()).toBe(1.5);
  });

  it('keeps the viewport inside the surface at every pan edge and at minimum zoom', () => {
    const viewport = mapViewport();
    const surface = component.surfaceBounds();
    const expectCovered = () => {
      const zoom = component.zoom();
      const offset = component.mapOffset();
      const left = 250 + offset.x - (surface.width * zoom) / 2;
      const top = 200 + offset.y - (surface.height * zoom) / 2;
      expect(left).toBeLessThanOrEqual(0.000001);
      expect(left + surface.width * zoom).toBeGreaterThanOrEqual(500 - 0.000001);
      expect(top).toBeLessThanOrEqual(24 + 0.000001);
      expect(top + surface.height * zoom).toBeGreaterThanOrEqual(400 - 0.000001);
    };
    for (const [x, y] of [
      [10000, 10000],
      [-10000, -10000],
      [10000, -10000],
      [-10000, 10000],
    ]) {
      pointer(viewport, 'pointerdown', 200, 200);
      pointer(viewport, 'pointermove', x, y);
      pointer(viewport, 'pointerup', x, y);
      expectCovered();
    }
    for (let step = 0; step < 20; step++) {
      viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, clientX: 21, clientY: 31 }));
      expectCovered();
    }
    expect(component.colony().buildings).toHaveLength(0);
  });

  it('refits on resize and planet changes, even when filling requires more than 300% zoom', () => {
    const viewport = mapViewport();
    vi.mocked(viewport.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 2500, 1200));
    resizeViewport();
    const expectFitted = () => {
      const surface = component.surfaceBounds();
      expect(surface.width * component.zoom()).toBeGreaterThanOrEqual(2500);
      expect(surface.height * component.zoom()).toBeGreaterThanOrEqual(1200 - 24);
      const offset = component.mapOffset();
      expect(Math.abs(offset.x)).toBeLessThanOrEqual((surface.width * component.zoom() - 2500) / 2);
    };
    expectFitted();
    expect(component.zoom()).toBeGreaterThan(3);
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000 }));
    expectFitted();
    fixture.componentRef.setInput('planet', new PlanetService().getPlanets()[0]);
    fixture.detectChanges();
    expectFitted();
    vi.mocked(viewport.getBoundingClientRect).mockReturnValue(new DOMRect(0, 0, 500, 400));
    resizeViewport();
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000 }));
    expect(component.zoom()).toBe(3);
    fixture.destroy();
    expect(disconnectObserver).toHaveBeenCalledOnce();
  });

  it('creates radius-dependent hexagons and displays global and planetary resources', () => {
    expect(fixture.nativeElement.querySelectorAll('.hex-tile')).toHaveLength(81);
    expect(fixture.nativeElement.querySelector('[data-resource="credits"]').textContent).toBe(
      '2000',
    );
    expect(fixture.nativeElement.querySelector('[data-resource="minerals"]').textContent).toBe(
      '240',
    );
    expect(fixture.nativeElement.querySelectorAll('.building-option')).toHaveLength(7);
    const images = fixture.nativeElement.querySelectorAll(
      '.building-option img',
    ) as NodeListOf<HTMLImageElement>;
    expect(Array.from(images, (image) => image.getAttribute('src'))).toEqual([
      'assets/buildings/MainBase.png',
      'assets/buildings/SolarPower.png',
      'assets/buildings/WaterPurification.png',
      'assets/buildings/MineralExtractionFacility.png',
      'assets/buildings/GasExtractor.png',
      'assets/buildings/ResidentialHabitat.png',
      'assets/buildings/Farm.png',
    ]);
  });

  it('builds through the catalogue and tile, then displays the completed building overview', () => {
    (fixture.nativeElement.querySelector('.build-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-tile="0"]') as SVGElement).dispatchEvent(
      new MouseEvent('click'),
    );
    fixture.detectChanges();
    expect(component.colony().buildings).toHaveLength(1);
    expect(component.remaining(component.inspected()!)).toBe(4);
    expect(component.game.credits()).toBe(1800);
    expect(fixture.nativeElement.querySelector('[data-tile="0"] image').getAttribute('href')).toBe(
      'assets/buildings/MainBase.png',
    );
    expect(fixture.nativeElement.querySelector('.inspector img').getAttribute('src')).toBe(
      'assets/buildings/MainBase.png',
    );
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-tile="0"] text').textContent.trim()).toBe(
      'HQ',
    );
    expect(fixture.nativeElement.querySelector('.inspector h3').textContent).toBe('Главная база');
    expect(component.inspected()!.completed).toBe(true);
    expect(component.colony().stocks.population).toBe(5);
  });

  it('displays free power and population capacity instead of per-tick energy production', () => {
    const resource = (name: string) =>
      fixture.nativeElement.querySelector(`[data-resource="${name}"]`).textContent.trim();
    expect(resource('energy')).toBe('0');
    expect(resource('population')).toBe('0 / 0');
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.selectTile(0);
    fixture.detectChanges();
    expect(resource('energy')).toBe('10');
    expect(resource('population')).toBe('5 / 5');
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(
      'Выработка энергии',
    );
    expect(fixture.nativeElement.querySelector('.catalogue').textContent).toContain('+16 энергии');
    expect(fixture.nativeElement.querySelector('.catalogue').textContent).toContain(
      '+20 к лимиту населения',
    );
    component.game.build(component.planet(), BuildingType.Housing, 1);
    component.selectTile(1);
    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(resource('energy')).toBe('0');
    expect(resource('population')).toBe('5 / 25');
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(
      'Лимит населения',
    );
    expect(fixture.nativeElement.querySelector('[data-building-toggle]')).toBeNull();
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(resource('population')).toBe('6 / 25');
    expect(resource('energy')).toBe('0');
  });

  it.each([
    { index: 0, power: 25, water: 1 },
    { index: 1, power: 16, water: 12 },
    { index: 2, power: 10, water: 8 },
  ])('shows planet-specific station output for planet $index', ({ index, power, water }) => {
    fixture.componentRef.setInput('planet', new PlanetService().getPlanets()[index]);
    fixture.detectChanges();
    const options = fixture.nativeElement.querySelectorAll('.building-option');
    expect(options[1].textContent).toContain(`+${power} энергии`);
    expect(options[2].textContent).toContain(`+${water} / 2 с`);
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.game.build(component.planet(), BuildingType.Power, 1);
    component.selectTile(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(`+${power}`);
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-resource="energy"]').textContent).toBe(
      `${10 + power}`,
    );
    component.game.build(component.planet(), BuildingType.Water, 2);
    component.selectTile(2);
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(`+${water}`);
    expect(fixture.nativeElement.querySelector('[data-water-balance]').textContent.trim()).toBe(
      `+${water} / цикл`,
    );
  });

  it('shows colony employment, per-building staffing, and fractional production', () => {
    const planet = component.planet();
    component.game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.game.build(planet, BuildingType.Power, 1);
    vi.advanceTimersByTime(4000);
    component.game.build(planet, BuildingType.Minerals, 2);
    component.game.build(planet, BuildingType.Gas, 3);
    component.selectTile(3);
    fixture.detectChanges();
    const workers = () =>
      fixture.nativeElement.querySelector('[data-building-workers]').textContent.trim();
    const employed = () =>
      fixture.nativeElement.querySelector('[data-employed]').textContent.trim();
    expect(workers()).toBe('0 / 2');
    expect(employed()).toBe('Работает: 2');
    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(workers()).toBe('1 / 2');
    expect(employed()).toBe('Работает: 5');
    expect(
      fixture.nativeElement.querySelector('[data-building-efficiency]').textContent.trim(),
    ).toBe('50%');
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain('+2,5');
    const gas = component.colony().stocks.gas;
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(component.colony().stocks.gas).toBe(gas + 2.5);
    expect(fixture.nativeElement.querySelector('[data-resource="gas"]').textContent).toBe(
      component.resourceNumbers.format(gas + 2.5),
    );
    const mine = component.colony().buildings.find((building) => building.tile === 2)!;
    expect(component.game.demolish(planet, mine.id)).toBeNull();
    fixture.detectChanges();
    expect(workers()).toBe('2 / 2');
    expect(employed()).toBe('Работает: 4');
    expect(
      fixture.nativeElement.querySelector('[data-building-efficiency]').textContent.trim(),
    ).toBe('100%');
  });

  it('switches a completed mine off and on from the inspector without removing it', () => {
    const planet = component.planet();
    component.game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.selectTile(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-building-toggle]')).toBeNull();
    component.game.build(planet, BuildingType.Minerals, 1);
    component.selectTile(1);
    fixture.detectChanges();
    const toggle = () =>
      fixture.nativeElement.querySelector('[data-building-toggle]') as HTMLButtonElement;
    expect(toggle().disabled).toBe(true);
    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(toggle().disabled).toBe(false);
    toggle().click();
    fixture.detectChanges();
    expect(toggle().textContent).toContain('Включить здание');
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain('Отключено');
    expect(fixture.nativeElement.querySelector('[data-employed]').textContent).toContain(
      'Работает: 0',
    );
    expect(fixture.nativeElement.querySelector('[data-resource="energy"]').textContent).toBe('10');
    const stats = fixture.nativeElement
      .querySelector('.inspector dl')
      .textContent.replace(/\s+/g, '');
    expect(stats).toContain('Занимаемаяэнергия0');
    expect(stats).toContain('Вода/2с0');
    expect(stats).toContain('Производство/2с+0');
    const disabled = component.colony();
    vi.advanceTimersByTime(4000);
    expect(component.colony().stocks).toEqual(disabled.stocks);
    expect(component.colony().buildings).toHaveLength(2);
    toggle().click();
    fixture.detectChanges();
    expect(toggle().textContent).toContain('Отключить здание');
    expect(fixture.nativeElement.querySelector('[data-employed]').textContent).toContain(
      'Работает: 2',
    );
    vi.advanceTimersByTime(2000);
    expect(component.colony().stocks.minerals).toBe(disabled.stocks.minerals + 11);
  });

  it('shows full water demand while mines are paused and resumes when a station supplies water', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.game.build(component.planet(), BuildingType.Minerals, 1);
    component.game.build(component.planet(), BuildingType.Gas, 2);
    vi.advanceTimersByTime(6000);
    component.selectTile(1);
    fixture.detectChanges();
    const balance = () => fixture.nativeElement.querySelector('[data-water-balance]');
    expect(balance().textContent.trim()).toBe('-2 / цикл');
    expect(balance().classList.contains('water-deficit')).toBe(true);
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain('Вода / 2 с');
    vi.advanceTimersByTime(140000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-resource="water"]').textContent).toBe('0');
    expect(balance().textContent.trim()).toBe('-2 / цикл');
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(
      'Недостаточно воды',
    );
    expect(component.water().populationSupplied).toBe(true);
    const gasMine = component
      .colony()
      .buildings.find((building) => building.type === BuildingType.Gas)!;
    expect(component.game.demolish(component.planet(), gasMine.id)).toBeNull();
    component.game.build(component.planet(), BuildingType.Power, 3);
    vi.advanceTimersByTime(4000);
    component.game.build(component.planet(), BuildingType.Water, 4);
    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(balance().textContent.trim()).toBe('+11 / цикл');
    expect(balance().classList.contains('water-deficit')).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-resource="water"]').textContent).toBe('11');
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain('Работает');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).not.toContain(
      'население убывает',
    );
  });

  it('renders farm artwork and food colors through surplus, near balance, deficit, and famine', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.game.build(component.planet(), BuildingType.Power, 1);
    component.game.build(component.planet(), BuildingType.Water, 2);
    component.game.build(component.planet(), BuildingType.Farm, 3);
    vi.advanceTimersByTime(6000);
    component.selectTile(3);
    fixture.detectChanges();
    const indicator = () => fixture.nativeElement.querySelector('.food');
    const balance = () =>
      fixture.nativeElement.querySelector('[data-food-balance]').textContent.trim();
    expect(indicator().classList.contains('food-surplus')).toBe(true);
    expect(balance()).toBe('+4 / цикл');
    expect(fixture.nativeElement.querySelector('[data-tile="3"] image').getAttribute('href')).toBe(
      'assets/buildings/Farm.png',
    );
    expect(fixture.nativeElement.querySelector('.inspector img').getAttribute('src')).toBe(
      'assets/buildings/Farm.png',
    );
    component.game.build(component.planet(), BuildingType.Housing, 6);
    vi.advanceTimersByTime(10000);
    component.game.build(component.planet(), BuildingType.Minerals, 4);
    vi.advanceTimersByTime(12000);
    component.game.build(component.planet(), BuildingType.Power, 5);
    vi.advanceTimersByTime(4000);
    vi.advanceTimersByTime(2000);
    component.game.build(component.planet(), BuildingType.Housing, 7);
    vi.advanceTimersByTime(14000);
    fixture.detectChanges();
    expect(component.colony().stocks.population).toBe(23);
    expect(indicator().classList.contains('food-surplus')).toBe(true);
    expect(balance()).toBe('+0,4 / цикл');
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(indicator().classList.contains('food-balanced')).toBe(true);
    expect(balance()).toBe('+0,2 / цикл');
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(balance()).toBe('0 / цикл');
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(indicator().classList.contains('food-deficit')).toBe(true);
    expect(balance()).toBe('-0,2 / цикл');
    expect(indicator().querySelector('.hunger')).toBeNull();
    vi.advanceTimersByTime(400000);
    fixture.detectChanges();
    expect(component.colony().stocks.population).toBe(25);
    expect(component.colony().stocks.food).toBe(0);
    expect(indicator().classList.contains('food-balanced')).toBe(true);
    expect(indicator().querySelector('.hunger').textContent).toBe('Голод!');
  });

  it('protects the base and confirms or cancels demolition through the inspector', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.selectTile(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inspector .demolish-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain('Пища / 2 с');
    component.game.build(component.planet(), BuildingType.Housing, 1);
    component.selectTile(1);
    fixture.detectChanges();
    const demolitionButton = () =>
      fixture.nativeElement.querySelector('.inspector .demolish-button') as HTMLButtonElement;
    expect(demolitionButton().textContent).toContain('Отменить строительство');
    demolitionButton().click();
    fixture.detectChanges();
    const cancel = fixture.nativeElement.querySelector(
      '[aria-label="Подтверждение сноса"] button:last-child',
    ) as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();
    expect(component.colony().buildings).toHaveLength(2);
    expect(component.demolitionTarget()).toBeNull();
    demolitionButton().click();
    fixture.detectChanges();
    demolitionButton().click();
    fixture.detectChanges();
    expect(component.colony().buildings).toHaveLength(1);
    expect(component.colony().stocks.energy).toBe(10);
    expect(component.blueprint()).toBeNull();
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(
      'Свободный участок',
    );
    expect(component.message()).toContain('Участок освобождён');
    component.game.build(component.planet(), BuildingType.Power, 1);
    component.selectTile(1);
    component.requestDemolition();
    component.selectTile(0);
    component.confirmDemolition();
    expect(component.colony().buildings).toHaveLength(2);
  });

  it('explains why a needed power station cannot be demolished', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.game.build(component.planet(), BuildingType.Power, 1);
    vi.advanceTimersByTime(4000);
    component.game.build(component.planet(), BuildingType.Housing, 2);
    component.game.build(component.planet(), BuildingType.Water, 3);
    component.selectTile(1);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      '.inspector .demolish-button',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.inspector').textContent).toContain(
      'Сначала освободите энергию',
    );
    component.requestDemolition();
    expect(component.demolitionTarget()).toBeNull();
    expect(component.message()).toContain('Сначала освободите энергию');
  });

  it('supports drop placement and rejects occupied tiles and unknown drag payloads', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    const drop = (type: string, tile: number) => {
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { getData: () => type } });
      fixture.nativeElement.querySelector(`[data-tile="${tile}"]`).dispatchEvent(event);
      fixture.detectChanges();
    };
    drop('minerals', 1);
    expect(component.colony().buildings).toHaveLength(2);
    const credits = component.game.credits();
    drop('gas', 1);
    expect(component.message()).toBe('Участок уже занят');
    expect(fixture.nativeElement.querySelector('[data-tile="1"] image').getAttribute('href')).toBe(
      'assets/buildings/MineralExtractionFacility.png',
    );
    drop('unknown', 2);
    expect(component.colony().buildings).toHaveLength(2);
    expect(component.game.credits()).toBe(credits);
  });

  it('preserves colonies and global credits when switching planets', () => {
    const first = component.planet();
    component.game.build(first, BuildingType.Base, 0);
    fixture.componentRef.setInput('planet', new PlanetService().getPlanets()[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.hex-tile')).toHaveLength(36);
    expect(component.colony().buildings).toHaveLength(0);
    expect(component.colony().stocks.minerals).toBe(240);
    expect(component.game.credits()).toBe(1800);
    fixture.componentRef.setInput('planet', first);
    fixture.detectChanges();
    expect(component.colony().buildings).toHaveLength(1);
    expect(component.colony().stocks.minerals).toBe(180);
  });

  it('does not arm click construction after a cancelled drag', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    const option = fixture.nativeElement.querySelectorAll('.building-option')[1];
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    const setData = vi.fn();
    Object.defineProperty(event, 'dataTransfer', { value: { setData } });
    option.dispatchEvent(event);
    fixture.detectChanges();
    expect(setData).toHaveBeenCalledWith('text/plain', 'power');
    expect(component.dragging()).toBe('power');
    expect(component.blueprint()).toBeNull();
    option.dispatchEvent(new Event('dragend', { bubbles: true }));
    component.selectTile(1);
    fixture.detectChanges();
    expect(component.dragging()).toBeNull();
    expect(component.colony().buildings).toHaveLength(1);
    expect(component.game.credits()).toBe(1800);
  });

  it('keeps an explicitly chosen blueprint separate from drag state', () => {
    component.game.build(component.planet(), BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    component.choose(component.game.definition(BuildingType.Water));
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { setData: vi.fn() },
    } as unknown as DragEvent;
    component.dragStart(event, component.game.definition(BuildingType.Power));
    component.dragEnd();
    expect(component.blueprint()).toBe('water');
    component.selectTile(1);
    expect(component.colony().buildings[1].type).toBe('water');
  });
});
