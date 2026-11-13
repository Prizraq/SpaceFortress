import { Grid, defineHex, rectangle } from 'honeycomb-grid';
import { Planet } from '../../models/interface/planet';

const Hex = defineHex({ dimensions: 30, origin: 'topLeft' });

export function createHexMap(side: number) {
  const grid = new Grid(Hex, rectangle({ width: side, height: side }));
  const tiles = Array.from(grid, (hex, id) => ({
    id,
    x: hex.x + 16,
    y: hex.y + 16,
    points: hex.corners.map((point) => `${point.x + 16},${point.y + 16}`).join(' '),
  }));
  return {
    tiles,
    width: Math.max(...tiles.map((tile) => tile.x)) + 48,
    height: Math.max(...tiles.map((tile) => tile.y)) + 48,
  };
}

export function terrainColor(planet: Planet, tile: number): string {
  const value = (Math.sin(tile * 12.9898 + planet.radius) * 43758.5453) % 1;
  if (Math.abs(value) * 100 < planet.resourses.water * 0.45) return '#16424a';
  return ['#233c38', '#2d4740', '#344742', '#243e41'][tile % 4];
}
