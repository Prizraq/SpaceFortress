import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const sourceDirectory = new URL('../SpaceFortressAssets/SpaceFortressAssets/', import.meta.url);
const outputDirectory = new URL('../public/assets/buildings/', import.meta.url);
const filenames = [
  'MainBase.png',
  'SolarPower.png',
  'WaterPurification.png',
  'MineralExtractionFacility.png',
  'GasExtractor.png',
  'ResidentialHabitat.png',
  'Farm.png',
];

await mkdir(outputDirectory, { recursive: true });
for (const filename of filenames) {
  const { data, info } = await sharp(fileURLToPath(new URL(filename, sourceDirectory)))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const visited = new Uint8Array(width * height);
  const background = new Uint32Array(width * height);
  let backgroundSize = 0;
  const enqueue = (pixel) => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    const offset = pixel * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const nearWhite =
      Math.min(red, green, blue) >= 238 &&
      Math.max(red, green, blue) - Math.min(red, green, blue) <= 18;
    if (data[offset + 3] === 0 || nearWhite) background[backgroundSize++] = pixel;
  };
  for (let column = 0; column < width; column++) {
    enqueue(column);
    enqueue((height - 1) * width + column);
  }
  for (let row = 0; row < height; row++) {
    enqueue(row * width);
    enqueue(row * width + width - 1);
  }
  for (let cursor = 0; cursor < backgroundSize; cursor++) {
    const pixel = background[cursor];
    data[pixel * 4 + 3] = 0;
    if (pixel % width > 0) enqueue(pixel - 1);
    if (pixel % width < width - 1) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width);
    if (pixel < width * (height - 1)) enqueue(pixel + width);
  }
  if (backgroundSize === 0 || backgroundSize === width * height) {
    throw new Error(`Invalid building background: ${filename}`);
  }
  const output = await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ background: '#00000000', threshold: 1 })
    .resize({ width: 320, height: 240, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(output).toFile(fileURLToPath(new URL(filename, outputDirectory)));
  console.log(
    `${filename}: ${width}x${height}, ${backgroundSize} background pixels removed, ${output.length} bytes`,
  );
}
