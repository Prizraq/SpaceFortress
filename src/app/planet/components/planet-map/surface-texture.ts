import { Planet } from '../../../shared/models/interface/planet';

type Color = readonly [number, number, number];

const palettes = {
  dry: {
    low: [112, 65, 43],
    high: [183, 123, 80],
    rock: [99, 82, 70],
    shore: [168, 130, 88],
    deep: [31, 48, 54],
    shallow: [61, 93, 92],
    snow: [202, 186, 157],
  },
  temperate: {
    low: [48, 76, 43],
    high: [113, 120, 74],
    rock: [121, 115, 98],
    shore: [158, 146, 104],
    deep: [18, 46, 61],
    shallow: [44, 91, 94],
    snow: [194, 205, 194],
  },
  cold: {
    low: [75, 94, 103],
    high: [112, 134, 144],
    rock: [78, 91, 103],
    shore: [133, 158, 166],
    deep: [26, 51, 70],
    shallow: [62, 101, 118],
    snow: [169, 190, 202],
  },
} satisfies Record<string, Record<string, Color>>;

export function createSurfaceTexture(planet: Planet, width: number, height: number): string {
  const scale = Math.min(1.5, 1200 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(1200, Math.ceil(width * scale));
  canvas.height = Math.min(1200, Math.ceil(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for the planet surface');
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.set(createSurfacePixels(planet, canvas.width, canvas.height));
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createSurfacePixels(
  planet: Planet,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new RangeError('Planet surface dimensions must be positive integers');
  let seed = 2166136261;
  for (const character of planet.id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  const dry = !planet.athmosphere || planet.resourses.water < 20;
  const cold = !dry && planet.distanceFromSun > 1.3;
  const palette = dry ? palettes.dry : cold ? palettes.cold : palettes.temperate;
  const waterline = dry ? 0 : cold ? 0.4 : 0.43 + planet.resourses.water * 0.0004;
  const stride = width + 2;
  const elevations = new Float32Array(stride * (height + 2));
  for (let row = 0; row < height + 2; row++) {
    for (let column = 0; column < stride; column++) {
      const x = ((column - 1) / width) * 5;
      const y = ((row - 1) / width) * 5;
      const warpedX = x + noise(x * 0.6, y * 0.6, seed + 17) * 1.5;
      const warpedY = y + noise(x * 0.6, y * 0.6, seed + 31) * 1.5;
      const ridge = 1 - Math.abs(noise(warpedX * 3, warpedY * 3, seed + 47) * 2 - 1);
      elevations[row * stride + column] = fractal(warpedX, warpedY, seed) * 0.82 + ridge * 0.18;
    }
  }
  if (dry || cold) {
    const count = dry ? 14 : 6;
    for (let crater = 0; crater < count; crater++) {
      const cx = noise(crater + 0.5, 13, seed) * width;
      const cy = noise(crater + 0.5, 29, seed) * height;
      const radius = width * (0.025 + noise(crater + 0.5, 43, seed) * 0.065);
      for (
        let row = Math.max(0, Math.floor(cy - radius * 1.2));
        row <= Math.min(height + 1, cy + radius * 1.2);
        row++
      ) {
        for (
          let column = Math.max(0, Math.floor(cx - radius * 1.2));
          column <= Math.min(width + 1, cx + radius * 1.2);
          column++
        ) {
          const distance = Math.hypot(column - cx, row - cy) / radius;
          if (distance > 1.2) continue;
          const bowl = distance < 1 ? -0.15 * (1 - distance * distance) : 0;
          const rimDistance = (distance - 0.98) / 0.09;
          const rim = 0.065 * Math.exp(-rimDistance * rimDistance);
          elevations[row * stride + column] += bowl + rim;
        }
      }
    }
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = (row + 1) * stride + column + 1;
      const elevation = elevations[index];
      const dx = ((elevations[index + 1] - elevations[index - 1]) * width) / 18;
      const dy = ((elevations[index + stride] - elevations[index - stride]) * width) / 18;
      const slope = Math.hypot(dx, dy);
      const light =
        0.56 + 0.7 * Math.max(0, (dx * 0.5 + dy * 0.6 + 0.62) / Math.sqrt(1 + slope * slope));
      const grain = (hash(column, row, seed + 71) - 0.5) * 9;
      let color: Color;
      if (elevation < waterline) {
        color = mix(palette.deep, palette.shallow, smooth(waterline - 0.12, waterline, elevation));
      } else {
        color = mix(palette.low, palette.high, smooth(0.35, 0.72, elevation));
        color = mix(color, palette.rock, smooth(0.35, 1.2, slope) * 0.8);
        if (!dry) {
          color = mix(palette.shore, color, smooth(waterline, waterline + 0.025, elevation));
          color = mix(
            color,
            palette.snow,
            smooth(cold ? 0.48 : 0.72, cold ? 0.65 : 0.83, elevation),
          );
        }
      }
      const illumination = elevation < waterline ? 0.94 : Math.min(1.12, light);
      const offset = (row * width + column) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[offset + channel] = color[channel] * illumination + grain;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy, seed) * (1 - sx) + hash(ix + 1, iy, seed) * sx;
  const bottom = hash(ix, iy + 1, seed) * (1 - sx) + hash(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
}

function fractal(x: number, y: number, seed: number): number {
  let value = 0;
  let amplitude = 0.52;
  for (let octave = 0; octave < 5; octave++) {
    value += noise(x, y, seed + octave * 101) * amplitude;
    x *= 2.07;
    y *= 2.07;
    amplitude *= 0.5;
  }
  return value / 1.0075;
}

function smooth(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function mix(first: Color, second: Color, amount: number): Color {
  return [
    first[0] + (second[0] - first[0]) * amount,
    first[1] + (second[1] - first[1]) * amount,
    first[2] + (second[2] - first[2]) * amount,
  ];
}
