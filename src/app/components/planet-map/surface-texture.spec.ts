import { describe, expect, it } from 'vitest';
import { PlanetService } from '../../services/planet.service';
import { createSurfacePixels } from './surface-texture';

describe('Planet surface terrain', () => {
  const planets = new PlanetService().getPlanets();

  it('keeps terrain stable across repeated visits and renaming, but distinct for different ids', () => {
    const planet = planets[1];
    const pixels = createSurfacePixels(planet, 96, 80);
    expect(createSurfacePixels({ ...planet, name: 'Renamed' }, 96, 80)).toEqual(pixels);
    expect(createSurfacePixels({ ...planet, id: 'another-world' }, 96, 80)).not.toEqual(pixels);
  });

  it('produces opaque, spatially coherent terrain rather than independent tile colours', () => {
    const width = 128;
    const height = 96;
    const pixels = createSurfacePixels(planets[1], width, height);
    expect(pixels).toHaveLength(width * height * 4);
    let adjacent = 0;
    let distant = 0;
    let pairs = 0;
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        expect(pixels[(row * width + column) * 4 + 3]).toBe(255);
        if (column >= width - 32) continue;
        const index = (row * width + column) * 4;
        for (let channel = 0; channel < 3; channel++) {
          adjacent += Math.abs(pixels[index + channel] - pixels[index + 4 + channel]);
          distant += Math.abs(pixels[index + channel] - pixels[index + 128 + channel]);
          pairs++;
        }
      }
    }
    expect(distant / pairs).toBeGreaterThan(10);
    expect(adjacent).toBeLessThan(distant * 0.65);
  });

  it('gives dry, temperate, and cold worlds distinct natural palettes', () => {
    const means = planets.map((planet) => {
      const pixels = createSurfacePixels(planet, 128, 96);
      const channels = [0, 0, 0];
      for (let index = 0; index < pixels.length; index += 4)
        for (let channel = 0; channel < 3; channel++) channels[channel] += pixels[index + channel];
      return channels.map((sum) => sum / (128 * 96));
    });
    expect(means[0][0]).toBeGreaterThan(means[0][2] * 1.3);
    expect(means[1][1]).toBeGreaterThan(means[1][0]);
    expect(means[2][2]).toBeGreaterThan(means[2][0]);
  });
});
