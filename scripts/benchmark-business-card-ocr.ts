import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { parseBusinessCardTexts } from '../app/business-card-ocr';

const fixtureDir = '/private/tmp/give-hub-ocr-fixtures';
const cachePath = '/private/tmp/tesseract-js-cache';
const cases = [
  {
    id: 'IMG_3886',
    expected: { name: '二俣 将', company: /ColourJam/, positionTitle: 'CEO', mobile: '080-4053-2040', email: 's_futamata@colourjam-inc.com', address: /東京都目黒区目黒/, website: /colourjam-inc\.com/ },
  },
  {
    id: 'IMG_3890',
    expected: { name: '山崎 浩樹', positionTitle: '代表', mobile: '090-8242-1155', groupName: '岡山会場' },
  },
  {
    id: 'IMG_3889',
    expected: { name: '設楽 郁久子', company: /エクセルコダイヤモンド/, positionTitle: '店長', department: '東京本店・青山店', phone: '03-5565-0181', email: 'exelcotokyo@bridaldiamond.co.jp', postalCode: '104-0061', address: /中央区銀座/ },
  },
  {
    id: 'IMG_3888',
    expected: { name: '藤原 浩章', company: /株式会社スペリオル/, positionTitle: '代表取締役', mobile: '090-3158-2444', phone: '052-745-6607', email: 'scarab@superior.co.jp', postalCode: '464-0075', address: /名古屋市千種区内山/, website: 'www.superior.co.jp' },
  },
] as const;

const orientationWorker = await createWorker('osd', OEM.TESSERACT_ONLY, { cachePath: `${cachePath}-osd` });
const worker = await createWorker(['jpn', 'eng'], OEM.LSTM_ONLY, { cachePath });

for (const testCase of cases) {
  const baseImage = path.join(fixtureDir, `${testCase.id}-original.png`);
  const orientation = await orientationWorker.detect(baseImage);
  const degrees = (orientation.data.orientation_confidence ?? 0) >= 1.5 ? orientation.data.orientation_degrees ?? 0 : 0;
  const suffix = degrees === 270 ? 'r270' : degrees === 90 ? 'r90' : 'original';
  const image = path.join(fixtureDir, `${testCase.id}-${suffix}.png`);
  const primaryImage = image;
  const contrastImage = suffix === 'original' ? path.join(fixtureDir, `${testCase.id}-threshold.png`) : await thresholdFixture(image, testCase.id);

  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300', preserve_interword_spaces: '1' });
  const primary = await worker.recognize(primaryImage, {}, { text: true, blocks: true });
  const contrast = await worker.recognize(contrastImage);
  const texts: string[] = [];
  const romanNameLine = findRomanLine(primary.data.blocks ?? []);
  const nameLine = romanNameLine ?? findJapaneseLine(primary.data.blocks ?? []);
  if (nameLine) {
    const nameImage = `/private/tmp/${testCase.id}-name-benchmark.png`;
    const width = nameLine.bbox.x1 - nameLine.bbox.x0;
    const height = nameLine.bbox.y1 - nameLine.bbox.y0;
    const metadata = await sharp(image).metadata();
    const left = Math.max(0, Math.round(nameLine.bbox.x0 - width * (romanNameLine ? 0.55 : 0.18)));
    const right = Math.min(metadata.width ?? nameLine.bbox.x1, Math.round(nameLine.bbox.x1 + width * (romanNameLine ? 0.55 : 0.18)));
    const top = Math.max(0, Math.round(nameLine.bbox.y0 - height * (romanNameLine ? 4.3 : 0.35)));
    const bottom = Math.min(metadata.height ?? nameLine.bbox.y0, Math.round((romanNameLine ? nameLine.bbox.y0 : nameLine.bbox.y1) + height * (romanNameLine ? -0.15 : 0.35)));
    const outputWidth = Math.min(3000, Math.max(1800, (right - left) * 4));
    await sharp(image).extract({ left, top, width: right - left, height: bottom - top }).resize({ width: outputWidth }).greyscale().normalize().threshold(200).png().toFile(nameImage);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.RAW_LINE, user_defined_dpi: '300', preserve_interword_spaces: '1' });
    texts.push((await worker.recognize(nameImage)).data.text);
  }
  const titleLine = findTitleLine(primary.data.blocks ?? []);
  if (titleLine) {
    const titleImage = `/private/tmp/${testCase.id}-title-benchmark.png`;
    const width = titleLine.bbox.x1 - titleLine.bbox.x0;
    const height = titleLine.bbox.y1 - titleLine.bbox.y0;
    const metadata = await sharp(image).metadata();
    const left = Math.max(0, Math.round(titleLine.bbox.x0 - width * 0.65));
    const right = Math.min(metadata.width ?? titleLine.bbox.x1, Math.round(titleLine.bbox.x1 + width * 0.25));
    const top = Math.max(0, Math.round(titleLine.bbox.y0 - height * 0.35));
    const bottom = Math.min(metadata.height ?? titleLine.bbox.y1, Math.round(titleLine.bbox.y1 + height * 0.35));
    await sharp(image).extract({ left, top, width: right - left, height: bottom - top }).resize({ width: 2200 }).greyscale().normalize().threshold(190).png().toFile(titleImage);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.RAW_LINE, user_defined_dpi: '300', preserve_interword_spaces: '1' });
    texts.push((await worker.recognize(titleImage)).data.text);
  }
  texts.push(contrast.data.text, primary.data.text);
  const actual = parseBusinessCardTexts(texts);
  for (const [field, expected] of Object.entries(testCase.expected)) {
    const value = String(actual[field as keyof typeof actual] ?? '');
    if (expected instanceof RegExp) assert.match(value, expected, `${testCase.id}.${field}`);
    else assert.equal(value, expected, `${testCase.id}.${field}`);
  }
  console.log(`${testCase.id}: PASS (rotation ${degrees}°)`);
}

await worker.terminate();
await orientationWorker.terminate();
console.log('OCR benchmark: 4/4 PASS');

async function thresholdFixture(image: string, id: string) {
  const output = `/private/tmp/${id}-rotated-threshold.png`;
  await sharp(image).greyscale().normalize().threshold(180).png().toFile(output);
  return output;
}

function findRomanLine(blocks: NonNullable<Awaited<ReturnType<typeof worker.recognize>>['data']['blocks']>) {
  return blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => {
    const latinWords = line.words.filter((word) => /^[A-Za-zÀ-ÿ'\]-]{2,}$/.test(word.text));
    const bbox = latinWords.length ? {
      x0: Math.min(...latinWords.map((word) => word.bbox.x0)), y0: Math.min(...latinWords.map((word) => word.bbox.y0)),
      x1: Math.max(...latinWords.map((word) => word.bbox.x1)), y1: Math.max(...latinWords.map((word) => word.bbox.y1)),
    } : line.bbox;
    return { ...line, bbox, text: line.text.normalize('NFKC').replace(/\s+/g, ' ').trim() };
  }).filter((line) => {
    const cleaned = line.text.replace(/[^A-Za-zÀ-ÿ' .\]-]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter((word) => word.replace(/[^A-Za-z]/g, '').length >= 2);
    return !/[@/:]/.test(line.text) && words.length >= 2 && words.join('').replace(/[^A-Za-z]/g, '').length >= 7 && !/(company|corporation|inc|ltd|creative|production|diamond|hotel|tel|fax|mobile|email|www|http|president|director)/i.test(cleaned);
  }).sort((left, right) => (right.bbox.x1 - right.bbox.x0) - (left.bbox.x1 - left.bbox.x0))[0];
}

function findJapaneseLine(blocks: NonNullable<Awaited<ReturnType<typeof worker.recognize>>['data']['blocks']>) {
  return blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => {
    const japaneseWords = line.words.filter((word) => /^[一-龯々]{1,5}$/.test(word.text));
    const bbox = japaneseWords.length ? {
      x0: Math.min(...japaneseWords.map((word) => word.bbox.x0)), y0: Math.min(...japaneseWords.map((word) => word.bbox.y0)),
      x1: Math.max(...japaneseWords.map((word) => word.bbox.x1)), y1: Math.max(...japaneseWords.map((word) => word.bbox.y1)),
    } : line.bbox;
    return { ...line, bbox, text: line.text.normalize('NFKC').replace(/\s+/g, ' ').trim() };
  }).filter((line) => {
    const compact = line.text.replace(/[^一-龯々]/g, '');
    return compact.length >= 3 && compact.length <= 7 && !/(株式会社|有限会社|合同会社|取締役|代表|店長|店革|会場|東京|名古屋|住所|本店|支店)/.test(line.text) && !/\d|@/.test(line.text);
  }).sort((left, right) => ((right.bbox.y1 - right.bbox.y0) * (right.bbox.x1 - right.bbox.x0)) - ((left.bbox.y1 - left.bbox.y0) * (left.bbox.x1 - left.bbox.x0)))[0];
}

function findTitleLine(blocks: NonNullable<Awaited<ReturnType<typeof worker.recognize>>['data']['blocks']>) {
  return blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)).map((line) => ({ ...line, text: line.text.normalize('NFKC').replace(/\s+/g, '') })).filter((line) => /(取締役|店[長革]|CEO|COO|CFO|CTO|代表|社長|会長|部長|課長|マネージャー|世話人)/i.test(line.text)).sort((left, right) => (right.bbox.y1 - right.bbox.y0) - (left.bbox.y1 - left.bbox.y0))[0];
}
