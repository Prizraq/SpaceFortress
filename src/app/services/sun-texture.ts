export function createSunPixels(size: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const bodyRadius = 0.3;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5 - size / 2) / (size / 2);
      const y = (row + 0.5 - size / 2) / (size / 2);
      const radius = Math.hypot(x, y);
      if (radius >= 1) continue;
      const offset = (row * size + column) * 4;
      pixels[offset] = 255;
      if (radius <= bodyRadius) {
        const depth = Math.sqrt(1 - (radius / bodyRadius) ** 2);
        const u = x / bodyRadius;
        const v = y / bodyRadius;
        const plasma =
          Math.sin(u * 37 + Math.sin(v * 19) * 1.7) * Math.sin(v * 31 - u * 9) +
          Math.sin(u * 81 + v * 63) * 0.5;
        pixels[offset + 1] = 181 + depth * 66 + plasma * 5;
        pixels[offset + 2] = 64 + depth * 147 + plasma * 8;
        pixels[offset + 3] = 255;
      } else {
        const distance = radius / bodyRadius - 1;
        const angle = Math.atan2(y, x);
        const streamers = (0.5 + 0.5 * Math.sin(angle * 13 + Math.sin(angle * 5))) ** 12;
        const glow =
          Math.exp(-distance * 4.2) * 0.6 +
          Math.exp(-distance * 1.4) * 0.12 +
          streamers * Math.exp(-distance * 2.7) * Math.min(distance * 6, 1) * 0.2;
        pixels[offset + 1] = 155 + Math.exp(-distance * 4) * 70;
        pixels[offset + 2] = 50 + Math.exp(-distance * 3) * 100;
        pixels[offset + 3] = glow * Math.min(1, (1 - radius) * 8) * 255;
      }
    }
  }
  return pixels;
}
