import { describe, expect, it } from 'vitest';
import { PlanetService } from '../../../shared/services/planet.service';
import { createSurfacePixels } from './surface-texture';
import { MAP_VERTICAL_SCALE, createHexMap } from './hex-map';

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

  it.each([
    { planetIndex: 1, side: 9, maximumScale: 1.5, id: 'terra-3' },
    { planetIndex: 1, side: 15, maximumScale: 1.5, id: 'another-wet-world' },
    { planetIndex: 2, side: 12, maximumScale: 0.8, id: 'boreya-4' },
  ])('keeps every connected water body smaller than one hex on $id at grid size $side', ({ planetIndex, side, maximumScale, id }) => {
    const geometry = createHexMap(side);
    const worldWidth = geometry.width + 192;
    const worldHeight = geometry.height / MAP_VERTICAL_SCALE + 192;
    const scale = Math.min(maximumScale, 1200 / Math.max(worldWidth, worldHeight));
    const width = Math.ceil(worldWidth * scale);
    const height = Math.ceil(worldHeight * scale);
    const pixels = createSurfacePixels({ ...planets[planetIndex], id }, width, height, scale);
    const mask = new Uint8Array(width * height);
    for (let index = 0; index < mask.length; index++) {
      const offset = index * 4;
      mask[index] = pixels[offset + 2] - pixels[offset] >= 39 ? 1 : 0;
    }
    const corners = geometry.tiles[0].points.split(' ').map((point) => {
      const [x, y] = point.split(',').map(Number);
      return [x, y / MAP_VERTICAL_SCALE];
    });
    const hexWidth = Math.max(...corners.map(([x]) => x)) - Math.min(...corners.map(([x]) => x));
    const hexHeight = Math.max(...corners.map(([, y]) => y)) - Math.min(...corners.map(([, y]) => y));
    const hexArea = Math.abs(corners.reduce((area, [x, y], index) => {
      const [nextX, nextY] = corners[(index + 1) % corners.length];
      return area + x * nextY - nextX * y;
    }, 0)) / 2;
    let bodies = 0;
    for (let index = 0; index < mask.length; index++) {
      if (!mask[index]) continue;
      const pending = [index];
      mask[index] = 0;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let area = 0;
      while (pending.length) {
        const pixel = pending.pop()!;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        area++;
        for (let nextY = Math.max(0, y - 1); nextY <= Math.min(height - 1, y + 1); nextY++) {
          for (let nextX = Math.max(0, x - 1); nextX <= Math.min(width - 1, x + 1); nextX++) {
            const neighbour = nextY * width + nextX;
            if (!mask[neighbour]) continue;
            mask[neighbour] = 0;
            pending.push(neighbour);
          }
        }
      }
      bodies++;
      expect(maxX - minX + 1).toBeLessThanOrEqual(Math.ceil(hexWidth * scale));
      expect(maxY - minY + 1).toBeLessThanOrEqual(Math.ceil(hexHeight * scale));
      expect(Math.hypot(maxX - minX + 1, maxY - minY + 1)).toBeLessThanOrEqual(Math.ceil(hexHeight * scale));
      expect(area).toBeLessThanOrEqual(Math.ceil(hexArea * scale * scale));
    }
    expect(bodies).toBeGreaterThan(0);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid surface scale %s', (scale) => {
    expect(() => createSurfacePixels(planets[1], 96, 80, scale)).toThrow(RangeError);
  });
});
