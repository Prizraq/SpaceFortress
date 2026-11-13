import { PlanetService } from './planet.service';

describe('PlanetService', () => {
  const service = new PlanetService();

  it('should provide three distinct planets with valid orbital and resource data', () => {
    const planets = service.getPlanets();
    expect(planets).toHaveLength(3);
    expect(new Set(planets.map((planet) => planet.name)).size).toBe(3);
    planets.forEach((planet) => {
      expect(planet.radius).toBeGreaterThan(0);
      expect(planet.distanceFromSun).toBeGreaterThan(0);
      expect(planet.orbitalPeriod).toBeGreaterThan(0);
      Object.values(planet.resourses).forEach((amount) => {
        expect(amount).toBeGreaterThanOrEqual(0);
        expect(amount).toBeLessThanOrEqual(100);
      });
    });
  });

  it('should return independent dummy data on each call', () => {
    const planets = service.getPlanets();
    planets[0].resourses.water = 100;
    expect(service.getPlanets()[0].resourses.water).toBe(8);
  });
});
