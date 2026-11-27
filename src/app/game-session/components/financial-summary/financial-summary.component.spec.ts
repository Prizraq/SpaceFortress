import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingType } from '../../../planet/models/enum/building-type';
import { FinancialSummaryComponent } from './financial-summary.component';

describe('FinancialSummaryComponent', () => {
  let fixture: ComponentFixture<FinancialSummaryComponent>;
  let component: FinancialSummaryComponent;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [FinancialSummaryComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(FinancialSummaryComponent);
    component = fixture.componentInstance;
    component.game.setSystemPaused(false);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  const text = (selector: string) =>
    fixture.nativeElement.querySelector(selector)?.textContent.trim();
  const prepare = () => {
    const game = component.game;
    const planet = game.planets()[1];
    game.openPlanet(planet);
    game.build(planet, BuildingType.Base, 0);
    vi.advanceTimersByTime(4000);
    game.build(planet, BuildingType.Minerals, 1);
    game.build(planet, BuildingType.Gas, 2);
    vi.advanceTimersByTime(6000);
    return game.createSave(new Date());
  };

  it('closes to a compact toggle and reopens with current finances without pausing the game', () => {
    prepare();
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.toggle-button');
    const before = component.game.credits();
    button.focus();
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Открыть финансы колоний');
    expect(button.textContent?.trim()).toBe('Финансы');
    expect(fixture.nativeElement.classList.contains('collapsed')).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-financial-summary]')).toBeNull();
    expect(component.game.paused()).toBe(false);
    expect(component.game.credits()).toBe(before);
    expect(document.activeElement).toBe(button);

    component.game.toggleBuilding(component.game.planets()[1], 3);
    vi.advanceTimersByTime(2000);
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Закрыть финансы колоний');
    expect(fixture.nativeElement.classList.contains('collapsed')).toBe(false);
    expect(text('[data-financial-credits]')).toBe(String(before + 0.5).replace('.', ','));
    expect(text('[data-financial-maintenance]')).toBe('15');
    expect(document.activeElement).toBe(button);
  });

  it.each([
    [5, '9007199254740991,05'],
    [65, '9007199254740991,65'],
  ])(
    'displays the exact saved money at the safe whole-credit limit with remainder %s',
    (creditRemainder, expected) => {
      const game = component.game;
      game.restoreSave({
        ...game.createSave(new Date()),
        credits: Number.MAX_SAFE_INTEGER,
        creditRemainder,
      });
      fixture.detectChanges();
      expect(text('[data-financial-credits]')).toBe(expected);
    },
  );

  it('shows exact shared and local forecasts and updates them after a toggle without counting construction', () => {
    const game = component.game;
    const [first, second] = game.planets();
    for (const planet of [first, second]) {
      game.openPlanet(planet);
      game.build(planet, BuildingType.Base, 0);
    }
    vi.advanceTimersByTime(4000);
    game.build(first, BuildingType.Minerals, 1);
    game.build(second, BuildingType.Gas, 1);
    vi.advanceTimersByTime(6000);
    const save = game.createSave(new Date());
    game.restoreSave({
      ...save,
      credits: 10,
      creditRemainder: 73,
      colonies: save.colonies.map((colony, index) => ({
        ...colony,
        stocks: { ...colony.stocks, population: index === 0 ? 1 : 5 },
      })),
    });
    fixture.componentRef.setInput('colonyId', first.id);
    fixture.detectChanges();
    expect(text('[data-financial-credits]')).toBe('10,73');
    expect(text('[data-financial-income]')).toBe('36');
    expect(text('[data-financial-maintenance]')).toBe('30');
    expect(text('[data-financial-balance]')).toBe('+6');
    expect(text('[data-local-finances]')).toContain('доход 6, расходы 15, вклад -9');
    expect(fixture.nativeElement.querySelector('[data-financial-deficit]')).toBeNull();
    game.toggleBuilding(first, save.colonies[0].buildings[1].id);
    fixture.detectChanges();
    expect(text('[data-financial-credits]')).toBe('10,73');
    expect(text('[data-financial-maintenance]')).toBe('15');
    expect(text('[data-financial-balance]')).toBe('+21');
    expect(text('[data-local-finances]')).toContain('доход 6, расходы 0, вклад +6');
  });

  it('shows an approximate deficit forecast, freezes it on pause, and removes it at zero or positive balance', () => {
    const save = prepare();
    const game = component.game;
    const restore = (population: number, credits = 10, creditRemainder = 73) =>
      game.restoreSave({
        ...save,
        credits,
        creditRemainder,
        colonies: save.colonies.map((colony) => ({
          ...colony,
          stocks: { ...colony.stocks, population },
        })),
      });
    restore(1);
    fixture.detectChanges();
    expect(text('[data-financial-deficit]')).toContain('приблизительно 27 с игрового времени');
    expect(text('[data-depletion-assumptions]')).toContain('будущие действия не учтены');
    game.setManualPaused(true);
    vi.advanceTimersByTime(60000);
    fixture.detectChanges();
    expect(text('[data-financial-deficit]')).toContain('27 с');
    for (const population of [5, 6]) {
      restore(population);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-financial-deficit]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-depletion-assumptions]')).toBeNull();
    }
    restore(1, 0, 0);
    fixture.detectChanges();
    expect(text('[data-financial-deficit]')).toContain('Кредиты исчерпаны');
  });

  it('keeps financial shutdowns visible despite a funded positive forecast', () => {
    const save = prepare();
    component.game.restoreSave({
      ...save,
      colonies: save.colonies.map((colony) => ({
        ...colony,
        buildings: colony.buildings.map((building) =>
          building.type === BuildingType.Base
            ? building
            : { ...building, enabled: false, disabledByFinance: true },
        ),
      })),
    });
    fixture.detectChanges();
    expect(text('[data-financial-shutdowns]')).toContain('отключено зданий — 2');
    expect(text('[data-financial-shutdowns]')).toContain('Минеральная шахта #2');
    expect(text('[data-financial-shutdowns]')).toContain('включение — вручную');
    expect(fixture.nativeElement.querySelector('[data-financial-deficit]')).toBeNull();
    expect(text('[data-financial-maintenance]')).toBe('0');
  });
});
