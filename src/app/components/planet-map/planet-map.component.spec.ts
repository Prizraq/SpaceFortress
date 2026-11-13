import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanetService } from '../../services/planet.service';
import { PlanetMapComponent } from './planet-map.component';

describe('PlanetMapComponent', () => {
  let fixture: ComponentFixture<PlanetMapComponent>;
  let component: PlanetMapComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [PlanetMapComponent] }).compileComponents();
    fixture = TestBed.createComponent(PlanetMapComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('planet', new PlanetService().getPlanets()[1]);
    fixture.detectChanges();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('creates radius-dependent hexagons and displays global and planetary resources', () => {
    expect(fixture.nativeElement.querySelectorAll('.hex-tile')).toHaveLength(81);
    expect(fixture.nativeElement.querySelector('[data-resource="credits"]').textContent).toBe('2000');
    expect(fixture.nativeElement.querySelector('[data-resource="minerals"]').textContent).toBe('240');
    expect(fixture.nativeElement.querySelectorAll('.building-option')).toHaveLength(6);
  });

  it('builds through the catalogue and tile, then displays the completed building overview', () => {
    (fixture.nativeElement.querySelector('.build-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-tile="0"]') as SVGElement).dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(component.colony().buildings).toHaveLength(1);
    expect(component.remaining(component.inspected()!)).toBe(4);
    expect(component.game.credits()).toBe(1800);
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-tile="0"] text').textContent).toBe('HQ');
    expect(fixture.nativeElement.querySelector('.inspector h3').textContent).toBe('Главная база');
    expect(component.inspected()!.completed).toBe(true);
    expect(component.colony().stocks.population).toBe(5);
  });

  it('supports drop placement and rejects occupied tiles and unknown drag payloads', () => {
    component.game.build(component.planet(), 'base', 0);
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
    drop('unknown', 2);
    expect(component.colony().buildings).toHaveLength(2);
    expect(component.game.credits()).toBe(credits);
  });

  it('preserves colonies and global credits when switching planets', () => {
    const first = component.planet();
    component.game.build(first, 'base', 0);
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
    component.game.build(component.planet(), 'base', 0);
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
    component.game.build(component.planet(), 'base', 0);
    vi.advanceTimersByTime(4000);
    component.choose(component.game.definition('water'));
    const event = { preventDefault: vi.fn(), dataTransfer: { setData: vi.fn() } } as unknown as DragEvent;
    component.dragStart(event, component.game.definition('power'));
    component.dragEnd();
    expect(component.blueprint()).toBe('water');
    component.selectTile(1);
    expect(component.colony().buildings[1].type).toBe('water');
  });
});
