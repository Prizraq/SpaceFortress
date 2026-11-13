import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { App } from './app';
import { routes } from './app.routes';
import { SolarSystemComponent } from './components/solar-system/solar-system.component';

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
});
