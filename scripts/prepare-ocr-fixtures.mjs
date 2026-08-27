import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sources = process.argv.slice(2);
const outputDir = '/tmp/give-hub-ocr-fixtures';
await fs.mkdir(outputDir, { recursive: true });

function longestActiveRange(values, minimum) {
  let best = [0, values.length - 1];
  let bestLength = 0;
  let start = -1;
  for (let index = 0; index <= values.length; index += 1) {
    const active = index < values.length && values[index] >= minimum;
    if (active && start < 0) start = index;
    if (!active && start >= 0) {
      const length = index - start;
      if (length > bestLength) {
        best = [start, index - 1];
        bestLength = length;
      }
      start = -1;
    }
  }
  return best;
}

async function detectCard(source) {
  const image = sharp(source).removeAlpha();
  const { width = 0, height = 0 } = await image.metadata();
  const { data } = await image.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  const rowActivity = Array.from({ length: height }, (_, y) => {
    let active = 0;
    for (let x = 0; x < width; x += 4) if (data[y * width + x] > 22) active += 1;
    return active / Math.ceil(width / 4);
  });
  const [topRow, bottomRow] = longestActiveRange(rowActivity, 0.28);
  const columnActivity = Array.from({ length: width }, (_, x) => {
    let active = 0;
    let samples = 0;
    for (let y = topRow; y <= bottomRow; y += 4) {
      if (data[y * width + x] > 22) active += 1;
      samples += 1;
    }
    return active / samples;
  });
  const [leftColumn, rightColumn] = longestActiveRange(columnActivity, 0.28);
  const padding = 6;
  const left = Math.max(0, leftColumn - padding);
  const top = Math.max(0, topRow - padding);
  const right = Math.min(width - 1, rightColumn + padding);
  const bottom = Math.min(height - 1, bottomRow + padding);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

for (const source of sources) {
  const base = path.basename(source, path.extname(source));
  const crop = await detectCard(source);
  const card = sharp(source).extract(crop).resize({ width: 2400, withoutEnlargement: false });
  await card.clone().sharpen({ sigma: 1.1 }).png().toFile(path.join(outputDir, `${base}-original.png`));
  await card.clone().greyscale().normalize().sharpen({ sigma: 1.2 }).png().toFile(path.join(outputDir, `${base}-gray.png`));
  await card.clone().greyscale().normalize().threshold(178).png().toFile(path.join(outputDir, `${base}-threshold.png`));
  await card.clone().rotate(90).greyscale().normalize().sharpen({ sigma: 1.2 }).png().toFile(path.join(outputDir, `${base}-r90.png`));
  await card.clone().rotate(270).greyscale().normalize().sharpen({ sigma: 1.2 }).png().toFile(path.join(outputDir, `${base}-r270.png`));
  console.log(base, crop);
}

console.log(outputDir);
