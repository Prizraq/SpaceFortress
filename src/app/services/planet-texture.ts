import { Planet } from '../models/interface/planet';

export function createPlanetPixels(planet: Planet, index: number, size: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const horizontal = (column + 0.5 - size / 2) / (size / 2);
      const vertical = (row + 0.5 - size / 2) / (size / 2);
      const distance = horizontal * horizontal + vertical * vertical;
      if (distance > 1) continue;
      const depth = Math.sqrt(1 - distance);
      const longitude = Math.atan2(horizontal, depth) + 0.7 + index * 1.3;
      const latitude = Math.asin(vertical);
      const terrain =
        Math.sin(longitude * 3 + Math.sin(latitude * 4)) +
        Math.cos(latitude * 7 - longitude * 2) * 0.6 +
        Math.sin(longitude * 13 + latitude * 11) * 0.18 +
        Math.cos(longitude * 29 - latitude * 23) * 0.08;
      const cloud = cloudCover(planet, longitude, latitude);
      const light = 0.16 + 0.84 * Math.max(0, horizontal * -0.6 + vertical * -0.35 + depth * 0.72);
      const rim = Math.pow(1 - depth, 3) * (planet.athmosphere ? 0.5 : 0.1);
      const base = surfaceColor(planet.resourses.water, terrain, latitude);
      const offset = (row * size + column) * 4;
      pixels[offset] = Math.min(255, (base[0] + cloud * 150) * light + rim * 55);
      pixels[offset + 1] = Math.min(255, (base[1] + cloud * 150) * light + rim * 150);
      pixels[offset + 2] = Math.min(255, (base[2] + cloud * 150) * light + rim * 170);
      pixels[offset + 3] = Math.min(255, (1 - distance) * size * 255);
    }
  }
  return pixels;
}

function cloudCover(planet: Planet, longitude: number, latitude: number): number {
  if (!planet.athmosphere) return 0;
  const pattern =
    Math.sin(longitude * 8 + latitude * 15 + Math.sin(longitude * 4)) *
    Math.cos(latitude * 13 - longitude * 6);
  return Math.pow(Math.max(0, pattern), 8) * 0.5;
}

function surfaceColor(water: number, terrain: number, latitude: number): readonly number[] {
  if (Math.abs(latitude) > 1.15 && water > 30) return [172, 214, 209];
  if (terrain <= water / 100 - 0.67) return [15, 62, 85];
  if (water < 20) return [145 + terrain * 16, 93 + terrain * 14, 65];
  return [58 + terrain * 16, 126 + terrain * 14, 111];
}
