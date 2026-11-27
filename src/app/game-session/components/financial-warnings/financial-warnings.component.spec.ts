import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingType } from '../../../planet/models/enum/building-type';
import { GameSessionService } from '../../services/game-session.service';
import { FinancialWarningsComponent } from './financial-warnings.component';

describe('FinancialWarningsComponent', () => {
  let fixture: ComponentFixture<FinancialWarningsComponent>;
  let game: GameSessionService;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [FinancialWarningsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(FinancialWarningsComponent);
    game = TestBed.inject(GameSessionService);
    game.setSystemPaused(false);
    fixture.detectChanges();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  const prepare = (credits: number) => {
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    game.build(planet, BuildingType.Minerals, 1);
    game.build(planet, BuildingType.Gas, 2);
    vi.advanceTimersByTime(6000);
    const save = game.createSave(new Date());
    game.restoreSave({
      ...save,
      credits,
      creditRemainder: 0,
      colonies: save.colonies.map((colony) => ({
        ...colony,
        stocks: { ...colony.stocks, population: 1 },
      })),
    });
    fixture.detectChanges();
    return planet;
  };
  const notification = () =>
    fixture.nativeElement.querySelector('[data-financial-notification]')?.textContent;

  it('announces a deficit once, without restarting its lifetime on repeated production steps', () => {
    const planet = prepare(10);
    expect(notification()).toContain('Отрицательный регулярный баланс');
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(game.finances().balance).toBeLessThan(0);
    expect(notification()).toBeUndefined();
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(notification()).toBeUndefined();
    game.toggleBuilding(planet, 2);
    game.toggleBuilding(planet, 3);
    fixture.detectChanges();
    expect(notification()).toContain('Финансовая проблема устранена');
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(notification()).toBeUndefined();
  });

  it('announces new financial shutdowns and distinguishes a resolved deficit from still-disabled buildings', () => {
    const planet = prepare(0);
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect(notification()).toContain('отключено зданий — 2');
    expect(notification()).toContain('баланс устранён');
    expect(notification()).not.toContain('Финансовая проблема устранена');
    fixture.componentInstance.dismiss();
    vi.advanceTimersByTime(6000);
    fixture.detectChanges();
    expect(notification()).toBeUndefined();
    const save = game.createSave(new Date());
    game.restoreSave({ ...save, credits: 100 });
    fixture.detectChanges();
    expect(notification()).toBeUndefined();
    expect(game.colonies()[planet.id].buildings[1].enabled).toBe(false);
    game.toggleBuilding(planet, 2);
    game.toggleBuilding(planet, 3);
    fixture.detectChanges();
    expect(notification()).toContain('Финансовая проблема устранена');
  });

  it('clears notifications and their lifetime when starting a new game', () => {
    prepare(10);
    expect(notification()).toBeDefined();
    game.resetSession();
    fixture.detectChanges();
    expect(notification()).toBeUndefined();
    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(notification()).toBeUndefined();
  });
});
