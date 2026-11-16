import { Grid, defineHex, rectangle } from 'honeycomb-grid';

const Hex = defineHex({ dimensions: 30, origin: 'topLeft' });
export const MAP_VERTICAL_SCALE = 0.75;

export function createHexMap(side: number) {
  const grid = new Grid(Hex, rectangle({ width: side, height: side }));
  const tiles = Array.from(grid, (hex, id) => ({
    id,
    x: hex.x + 16,
    y: (hex.y + 16) * MAP_VERTICAL_SCALE,
    points: hex.corners
      .map((point) => `${point.x + 16},${(point.y + 16) * MAP_VERTICAL_SCALE}`)
      .join(' '),
  })).sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    tiles,
    width: Math.max(...tiles.map((tile) => tile.x)) + 48,
    height: Math.max(...tiles.map((tile) => tile.y)) + 48 * MAP_VERTICAL_SCALE,
  };
}
