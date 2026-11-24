import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { SolarSystemComponent } from './solar-system/components/solar-system/solar-system.component';
import { GameSessionService } from './game-session/services/game-session.service';
import { GAME_SAVE_STORAGE_KEY } from './game-save/services/game-save-storage.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should open the solar system at the root URL', async () => {
    const initSpy = vi.spyOn(SolarSystemComponent.prototype, 'ngAfterViewInit')
      .mockImplementation(() => {});

    try {
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl('/', SolarSystemComponent);
      expect(component).toBeInstanceOf(SolarSystemComponent);
    } finally {
      initSpy.mockRestore();
    }
  });

  it('does not instantiate game screens or advance time until the startup choice is complete', async () => {
    vi.useFakeTimers();
    localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
    const init = vi.spyOn(SolarSystemComponent.prototype, 'ngAfterViewInit')
      .mockImplementation(() => {});
    try {
      const fixture = TestBed.createComponent(App);
      const root: HTMLElement = fixture.nativeElement;
      fixture.detectChanges();
      await TestBed.inject(Router).navigateByUrl('/');
      fixture.detectChanges();
      const game = TestBed.inject(GameSessionService);
      expect(root.querySelector('app-game-start')).not.toBeNull();
      expect(root.querySelector('app-solar-system')).toBeNull();
      vi.advanceTimersByTime(60000);
      expect(game.clock()).toBe(0);
      expect(init).not.toHaveBeenCalled();
      root.querySelector<HTMLButtonElement>('[data-new-game]')!.click();
      fixture.detectChanges();
      expect(root.querySelector('app-game-start')).toBeNull();
      expect(root.querySelector('app-solar-system')).not.toBeNull();
      expect(init).toHaveBeenCalledOnce();
      expect(game.systemPaused()).toBe(false);
      expect(game.clock()).toBe(0);
    } finally {
      TestBed.resetTestingModule();
      init.mockRestore();
      vi.useRealTimers();
      localStorage.removeItem(GAME_SAVE_STORAGE_KEY);
    }
  });
});
