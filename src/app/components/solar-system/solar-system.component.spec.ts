import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SolarSystemRendererService } from '../../services/solar-system-renderer.service';
import { SolarSystemComponent } from './solar-system.component';

describe('SolarSystemComponent', () => {
  let component: SolarSystemComponent;
  let fixture: ComponentFixture<SolarSystemComponent>;
  let renderer: {
    init: ReturnType<typeof vi.fn>;
    selectPlanet: ReturnType<typeof vi.fn>;
    setPaused: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    renderer = {
      init: vi.fn().mockResolvedValue(undefined),
      selectPlanet: vi.fn(),
      setPaused: vi.fn(),
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
    fixture.detectChanges();
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

  it('should open a planet from the renderer double-click callback', () => {
    renderer.init.mock.calls[0][3](component.planets[0]);
    expect(component.surfacePlanet()).toBe(component.planets[0]);
  });

  it('does not require a motion toggle to display the orbital map', () => {
    expect(fixture.nativeElement.querySelector('.motion-toggle')).toBeNull();
    expect(renderer.init).toHaveBeenCalledOnce();
  });
});
