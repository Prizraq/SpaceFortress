import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { PlanetMapComponent } from '../../../planet/components/planet-map/planet-map.component';
import { BuildingType } from '../../../planet/models/enum/building-type';
import { SolarSystemRendererService } from '../../services/solar-system-renderer.service';
import { SolarSystemComponent } from './solar-system.component';

describe('SolarSystemComponent', () => {
  let component: SolarSystemComponent;
  let fixture: ComponentFixture<SolarSystemComponent>;
  let renderer: {
    init: ReturnType<typeof vi.fn>;
    updatePlanets: ReturnType<typeof vi.fn>;
    selectPlanet: ReturnType<typeof vi.fn>;
    setPaused: ReturnType<typeof vi.fn>;
    setMotionPaused: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    });
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
    renderer = {
      init: vi.fn().mockResolvedValue(undefined),
      updatePlanets: vi.fn(),
      selectPlanet: vi.fn(),
      setPaused: vi.fn(),
      setMotionPaused: vi.fn(),
      destroy: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [SolarSystemComponent],
    })
      .overrideComponent(SolarSystemComponent, {
        set: { providers: [{ provide: SolarSystemRendererService, useValue: renderer }] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(SolarSystemComponent);
    component = fixture.componentInstance;
    component.game.setSystemPaused(false);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('pauses orbital motion with the game while keeping rendering independent', () => {
    const pause = fixture.nativeElement.querySelector('[data-pause-toggle]') as HTMLButtonElement;
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(false);
    expect(fixture.nativeElement.querySelector('[data-game-time]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-connection]').textContent).toContain('Связь установлена');
    component.openPlanet(component.planets[1]);
    fixture.detectChanges();
    expect(renderer.setPaused).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(component.game.clock()).toBe(2000);
    pause.click();
    fixture.detectChanges();
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    expect(pause.getAttribute('aria-label')).toBe('Продолжить игру');
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(true);
    expect(fixture.nativeElement.querySelector('[data-connection]').textContent).toContain('Связь прервана');
    expect(fixture.nativeElement.querySelector('.connection.disconnected')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.signal-interference')).not.toBeNull();
    component.returnToSystem();
    fixture.detectChanges();
    expect(renderer.setPaused).toHaveBeenLastCalledWith(false);
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(60000);
    expect(component.game.clock()).toBe(2000);
    expect(component.game.paused()).toBe(true);
    pause.click();
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(component.game.clock()).toBe(4000);
    expect(pause.getAttribute('aria-pressed')).toBe('false');
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(false);
    expect(fixture.nativeElement.querySelector('.signal-interference')).toBeNull();
  });

  it('toggles pause with Space on both screens without scrolling or handling repeats', () => {
    const press = (options: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', {
        code: 'Space', bubbles: true, cancelable: true, ...options,
      });
      document.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };
    expect(press().defaultPrevented).toBe(true);
    expect(component.game.manualPaused()).toBe(true);
    press({ repeat: true });
    expect(component.game.manualPaused()).toBe(true);
    component.openPlanet(component.planets[1]);
    fixture.detectChanges();
    press();
    expect(component.game.manualPaused()).toBe(false);
  });

  it('does not intercept Space for interactive controls, editing, modifiers or an open menu', () => {
    const root: HTMLElement = fixture.nativeElement;
    for (const tag of ['button', 'input', 'textarea', 'select', 'a', 'div']) {
      const element = document.createElement(tag);
      if (tag === 'div') element.setAttribute('contenteditable', 'true');
      root.append(element);
      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(component.game.manualPaused()).toBe(false);
      element.remove();
    }
    for (const option of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }]) {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', ...option }));
      expect(component.game.manualPaused()).toBe(false);
    }
    root.querySelector<HTMLButtonElement>('[data-game-menu-toggle]')!.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(component.game.manualPaused()).toBe(false);
  });

  it('keeps restored paused sessions still until manual pause is cleared', () => {
    const saved = component.game.createSave(new Date());
    component.game.restoreSave({ ...saved, manualPaused: true });
    fixture.detectChanges();
    expect(renderer.updatePlanets).toHaveBeenLastCalledWith(component.planets);
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(true);
    component.game.setManualPaused(false);
    fixture.detectChanges();
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(false);
  });

  it('shows automatic pause without turning it into manual pause', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    const pause = fixture.nativeElement.querySelector('[data-pause-toggle]') as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('[data-connection]').title).toContain('вкладка скрыта');
    expect(pause.getAttribute('aria-pressed')).toBe('false');
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(60000);
    expect(component.game.clock()).toBe(0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(false);
  });

  it('shows system stop globally and cannot clear it with the manual pause button or navigation', () => {
    const game = component.game;
    game.setSystemPaused(true);
    fixture.detectChanges();
    const pause = fixture.nativeElement.querySelector('[data-pause-toggle]') as HTMLButtonElement;
    expect(component.selectedPlanet()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-connection]').title)
      .toContain('Служебная остановка');
    pause.click();
    fixture.detectChanges();
    expect(game.manualPaused()).toBe(false);
    expect(pause.disabled).toBe(true);
    pause.click();
    fixture.detectChanges();
    expect(game.manualPaused()).toBe(false);
    expect(game.systemPaused()).toBe(true);
    expect(game.paused()).toBe(true);
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(true);
    component.openPlanet(component.planets[1]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-pause-toggle]')).toBe(pause);
    expect(fixture.nativeElement.querySelector('[data-connection]').title)
      .toContain('Служебная остановка');
    expect(Array.from(
      fixture.nativeElement.querySelectorAll('.catalogue .build-button') as NodeListOf<HTMLButtonElement>,
    ).every((button) => button.disabled)).toBe(true);
    component.returnToSystem();
    fixture.detectChanges();
    vi.advanceTimersByTime(60000);
    expect(game.clock()).toBe(0);
    game.setSystemPaused(false);
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(game.clock()).toBe(2000);
    expect(renderer.setMotionPaused).toHaveBeenLastCalledWith(false);
    expect(fixture.nativeElement.querySelector('[data-connection]').textContent).toContain('Связь установлена');
  });

  it('should initialize the renderer with all three planets', () => {
    expect(component.planets).toHaveLength(3);
    expect(renderer.init).toHaveBeenCalledWith(
      component.pixiContainer.nativeElement,
      component.planets,
      expect.any(Function),
      expect.any(Function),
    );
    expect(fixture.nativeElement.querySelectorAll('.planet-target')).toHaveLength(3);
  });

  it('should show data for each selected planet', () => {
    const buttons = fixture.nativeElement.querySelectorAll(
      '.planet-target',
    ) as NodeListOf<HTMLButtonElement>;
    component.planets.forEach((planet, index) => {
      buttons[index].click();
      fixture.detectChanges();
      expect(component.selectedPlanet()).toBe(planet);
      expect(renderer.selectPlanet).toHaveBeenLastCalledWith(planet);
      expect(fixture.nativeElement.querySelector('h2').textContent).toBe(planet.name);
      const resources = fixture.nativeElement.querySelectorAll('.resource strong');
      expect(Array.from(resources, (resource) => (resource as HTMLElement).textContent)).toEqual([
        `${planet.resourses.minerals}%`,
        `${planet.resourses.water}%`,
        `${planet.resourses.gas}%`,
      ]);
    });
  });

  it('should handle selection from the canvas and clear it when closed', () => {
    const onSelect = renderer.init.mock.calls[0][2];
    onSelect(component.planets[1]);
    fixture.detectChanges();
    expect(component.selectedPlanet()).toBe(component.planets[1]);
    (fixture.nativeElement.querySelector('.close-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.selectedPlanet()).toBeNull();
    expect(renderer.selectPlanet).toHaveBeenLastCalledWith(null);
    expect(fixture.nativeElement.querySelector('.ui-panel')).toBeNull();
  });

  it('should release renderer resources on destruction', () => {
    fixture.destroy();
    expect(renderer.destroy).toHaveBeenCalledOnce();
  });

  it('keeps one simulation timer alive between screen instances', () => {
    const game = component.game;
    const planet = component.planets[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    const tick = vi.spyOn(game, 'tick');
    fixture.destroy();
    vi.advanceTimersByTime(6000);
    expect(game.clock()).toBe(6000);
    expect(game.colonies()[planet.id].buildings[0].completed).toBe(true);
    expect(tick).toHaveBeenCalledTimes(3);

    fixture = TestBed.createComponent(SolarSystemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.game).toBe(game);
    vi.advanceTimersByTime(2000);
    expect(game.clock()).toBe(8000);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('should open the surface from the panel and return without resetting the map', () => {
    component.selectPlanet(component.planets[1]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.open-surface') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.surfacePlanet()).toBe(component.planets[1]);
    expect(renderer.setPaused).toHaveBeenLastCalledWith(true);
    expect(fixture.nativeElement.querySelectorAll('.hex-tile')).toHaveLength(81);
    (fixture.nativeElement.querySelector('.back-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.surfacePlanet()).toBeNull();
    expect(renderer.setPaused).toHaveBeenLastCalledWith(false);
  });

  it.each(['orbit', 'another colony'])(
    'finishes construction while viewing %s and restores the completed surface',
    (screen) => {
      const planet = component.planets[1];
      const game = component.game;
      component.openPlanet(planet);
      fixture.detectChanges();
      game.build(planet, BuildingType.Base, 0);
      vi.advanceTimersByTime(4000);
      game.build(planet, BuildingType.Minerals, 1);
      vi.advanceTimersByTime(2000);
      const surface = fixture.debugElement.query(By.directive(PlanetMapComponent))
        .injector.get(PlanetMapComponent);
      surface.selectTile(1);
      fixture.detectChanges();
      expect(surface.progress(surface.inspected()!)).toBe(33);
      const minerals = game.colonies()[planet.id].stocks.minerals;

      component.returnToSystem();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(PlanetMapComponent))).toBeNull();
      if (screen === 'another colony') {
        component.openPlanet(component.planets[0]);
        fixture.detectChanges();
        game.build(component.planets[0], BuildingType.Base, 0);
      }
      vi.advanceTimersByTime(4000);
      expect(game.clock()).toBe(10000);
      expect(game.colonies()[planet.id].buildings[1].completed).toBe(true);
      expect(game.colonies()[planet.id].stocks.minerals).toBe(minerals);
      if (screen === 'another colony') {
        expect(game.colonies()[component.planets[0].id].buildings[0].completed).toBe(true);
      }

      component.returnToSystem();
      fixture.detectChanges();
      component.openPlanet(planet);
      fixture.detectChanges();
      expect(game.clock()).toBe(10000);
      const reopened = fixture.debugElement.query(By.directive(PlanetMapComponent))
        .injector.get(PlanetMapComponent);
      reopened.selectTile(1);
      fixture.detectChanges();
      expect(reopened).not.toBe(surface);
      expect(fixture.nativeElement.querySelector('[data-tile="1"] text').textContent.trim())
        .toBe('MIN');
      expect(fixture.nativeElement.querySelector('.construction-progress')).toBeNull();
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(game.colonies()[planet.id].stocks.minerals).toBe(minerals + 11);
      expect(fixture.nativeElement.querySelector('[data-resource="minerals"]').textContent.trim())
        .toBe(`${minerals + 11}`);
    },
  );

  it('should open a planet from the renderer double-click callback', () => {
    renderer.init.mock.calls[0][3](component.planets[0]);
    expect(component.surfacePlanet()).toBe(component.planets[0]);
  });

  it('reconnects the screens and renderer to restored session data without changing its time', () => {
    const game = component.game;
    const date = new Date('2030-01-01T00:00:00.000Z');
    component.openPlanet(component.planets[1]);
    fixture.detectChanges();
    const planet = component.planets[1];
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(5000);
    game.build(planet, BuildingType.Minerals, 1);
    vi.advanceTimersByTime(4000);
    const original = game.createSave(date);
    const saved = {
      ...original,
      planets: original.planets.map((entry) => ({
        ...entry,
        name: entry.id === planet.id ? 'Restored Terra' : entry.name,
      })),
    };
    vi.advanceTimersByTime(10000);
    component.returnToSystem();
    fixture.detectChanges();
    component.openPlanet(component.planets[0]);
    fixture.detectChanges();

    game.restoreSave(saved);
    fixture.detectChanges();
    expect(game.clock()).toBe(9000);
    expect(component.surfacePlanet()).toBeNull();
    expect(component.selectedPlanet()).toBeNull();
    expect(fixture.debugElement.query(By.directive(PlanetMapComponent))).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Restored Terra');
    expect(renderer.updatePlanets).toHaveBeenLastCalledWith(game.planets());
    expect(Object.keys(game.colonies())).toEqual([planet.id]);
    component.openPlanet(component.planets[1]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.planet-name h1').textContent).toBe('Restored Terra');
    expect(game.colonies()[planet.id].buildings[1].completed).toBe(false);
    const minerals = game.colonies()[planet.id].stocks.minerals;
    vi.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(game.colonies()[planet.id].buildings[1].completed).toBe(true);
    expect(game.colonies()[planet.id].stocks.minerals).toBe(minerals);
    vi.advanceTimersByTime(2000);
    expect(game.colonies()[planet.id].stocks.minerals).toBe(minerals + 11);
  });

  it('drops the old surface and colony after a confirmed session reset', () => {
    const game = component.game;
    const planet = component.planets[1];
    component.openPlanet(planet);
    fixture.detectChanges();
    const oldSurface = fixture.debugElement.query(By.directive(PlanetMapComponent))
      .injector.get(PlanetMapComponent);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    const oldColony = oldSurface.colony();
    oldSurface.selectTile(0);
    game.resetSession();
    fixture.detectChanges();
    expect(component.surfacePlanet()).toBeNull();
    expect(component.selectedPlanet()).toBeNull();
    expect(fixture.debugElement.query(By.directive(PlanetMapComponent))).toBeNull();
    expect(renderer.updatePlanets).toHaveBeenLastCalledWith(game.planets());
    expect(game.colonies()).toEqual({});
    component.openPlanet(component.planets[1]);
    fixture.detectChanges();
    const newSurface = fixture.debugElement.query(By.directive(PlanetMapComponent))
      .injector.get(PlanetMapComponent);
    expect(newSurface).not.toBe(oldSurface);
    expect(newSurface.colony()).not.toBe(oldColony);
    expect(newSurface.colony().buildings).toEqual([]);
    expect(newSurface.selectedTile()).toBeNull();
    expect(game.clock()).toBe(0);
    expect(oldColony.buildings[0].completed).toBe(true);
  });

  it('does not require a motion toggle to display the orbital map', () => {
    expect(fixture.nativeElement.querySelector('.motion-toggle')).toBeNull();
    expect(renderer.init).toHaveBeenCalledOnce();
  });
});
