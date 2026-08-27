import type { BusinessCardInput } from '@/db/data';

type OCRWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;
type OCRLine = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> };

export type OCRStage = 'orientation' | 'primary' | 'contrast' | 'name';

export async function scanBusinessCardImage(
  file: File,
  worker: OCRWorker,
  orientationWorker: OCRWorker,
  onStage?: (stage: OCRStage) => void,
): Promise<BusinessCardInput> {
  const source = await loadFileCanvas(file);
  const card = cropAndUpscaleCard(source);
  onStage?.('orientation');

  let rotation = 0;
  try {
    const detected = await orientationWorker.detect(card);
    if ((detected.data.orientation_confidence ?? 0) >= 1.5) rotation = detected.data.orientation_degrees ?? 0;
  } catch {
    rotation = 0;
  }

  const oriented = rotateCanvas(card, rotation);
  const enhanced = enhanceCanvas(oriented, 'grayscale');
  const highContrast = enhanceCanvas(oriented, 'threshold', 180);

  await worker.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300', preserve_interword_spaces: '1' });
  onStage?.('primary');
  const primary = await worker.recognize(enhanced, {}, { text: true, blocks: true });
  onStage?.('contrast');
  const contrast = await worker.recognize(highContrast);

  const texts: string[] = [];
  const ocrLines = primary.data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? [];
  const romanNameLine = findRomanNameLine(ocrLines);
  const directNameLine = romanNameLine ? undefined : findJapaneseNameLine(ocrLines);
  if (romanNameLine) {
    const nameImage = createNameCrop(oriented, romanNameLine);
    if (nameImage) {
      await worker.setParameters({ tessedit_pageseg_mode: '13', user_defined_dpi: '300', preserve_interword_spaces: '1' });
      onStage?.('name');
      const nameResult = await worker.recognize(nameImage);
      texts.push(nameResult.data.text);
    }
  } else if (directNameLine) {
    const nameImage = createDirectNameCrop(oriented, directNameLine);
    if (nameImage) {
      await worker.setParameters({ tessedit_pageseg_mode: '13', user_defined_dpi: '300', preserve_interword_spaces: '1' });
      onStage?.('name');
      texts.push((await worker.recognize(nameImage)).data.text);
    }
  }
  const titleLine = findTitleLine(ocrLines);
  if (titleLine) {
    const titleImage = createDirectLineCrop(oriented, titleLine, 0.65, 0.25, 190);
    if (titleImage) {
      await worker.setParameters({ tessedit_pageseg_mode: '13', user_defined_dpi: '300', preserve_interword_spaces: '1' });
      onStage?.('name');
      texts.push((await worker.recognize(titleImage)).data.text);
    }
  }
  texts.push(contrast.data.text, primary.data.text);
  return parseBusinessCardTexts(texts);
}

export function parseBusinessCardTexts(texts: string[]): BusinessCardInput {
  const records = texts.flatMap((text, source) => text.replace(/\r/g, '').split('\n').map((value, order) => ({
    source,
    order,
    raw: normalizeBase(value),
    compact: compactJapanese(normalizeBase(value)),
  }))).filter((record) => record.raw);

  const phones: Array<{ value: string; mobile: boolean }> = [];
  const emails: string[] = [];
  const websites: string[] = [];
  for (const record of records) {
    const contact = normalizeContact(record.raw);
    const email = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    if (email) emails.push(fixEmail(email));
    const website = contact.match(/(?:https?:\/\/|www\.)[^\s|]+/i)?.[0];
    if (website) websites.push(fixWebsite(website));

    const matches = [...contact.matchAll(/(?:\+81-?)?0\d{1,4}-\d{1,4}-\d{3,4}/g)].map((match) => normalizePhone(match[0]));
    const usable = /FAX/i.test(record.raw) && /TEL|Phone|Mobile/i.test(record.raw) ? matches.slice(0, 1) : /FAX/i.test(record.raw) ? [] : matches;
    for (const value of usable) if (!phones.some((phone) => phone.value === value)) phones.push({ value, mobile: /^(?:\+81-?)?0(?:70|80|90)-/.test(value) });
  }

  const positionRecord = records.find((record) => extractPositionTitle(record.compact));
  const positionTitle = extractPositionTitle(positionRecord?.compact ?? '');
  const groupName = records.map((record) => record.compact.match(/([一-龯々ぁ-んァ-ヶA-Za-z0-9・]+会場)/)?.[1] ?? '').find(Boolean) ?? '';

  const departmentRecord = records.find((record) => isDepartmentLine(record.compact));
  const department = cleanDepartment(departmentRecord?.compact ?? '');

  const companyRecord = records.find((record) => isCompanyLine(record.compact)) ?? findCompanyBeforeDepartment(records, departmentRecord);
  const company = cleanCompany(companyRecord?.compact ?? '');

  const name = chooseName(records, new Set([
    positionRecord?.compact ?? '', departmentRecord?.compact ?? '', companyRecord?.compact ?? '', groupName,
  ]));

  let postalCode = '';
  let address = '';
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const postal = !isContactLine(record.raw) ? record.compact.match(/〒\s*(\d{3})[-ー－](\d{4})/) : null;
    if (postal && !postalCode) postalCode = `${postal[1]}-${postal[2]}`;
    if (!address && looksLikeAddress(record.compact)) {
      address = cleanAddress(record.compact);
      const next = records[index + 1];
      if (next && next.source === record.source && looksLikeBuildingContinuation(next.compact)) address += ` ${next.compact}`;
    }
  }

  return {
    ...emptyBusinessCard(),
    name,
    company,
    positionTitle,
    department,
    phone: phones.find((phone) => !phone.mobile)?.value ?? '',
    mobile: phones.find((phone) => phone.mobile)?.value ?? '',
    email: unique(emails)[0] ?? '',
    postalCode,
    address,
    website: unique(websites)[0] ?? '',
    groupName,
  };
}

export function emptyBusinessCard(): BusinessCardInput {
  return { name: '', company: '', positionTitle: '', department: '', phone: '', mobile: '', email: '', postalCode: '', address: '', website: '', memo: '', groupName: '', exchangeDate: todayInJapan(), isFavorite: false };
}

async function loadFileCanvas(file: File) {
  let source: CanvasImageSource;
  let width = 0;
  let height = 0;
  let bitmap: ImageBitmap | null = null;
  let objectUrl = '';
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    objectUrl = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('画像を開けませんでした。'));
      element.src = objectUrl;
    });
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像を開けませんでした。');
  context.drawImage(source, 0, 0);
  bitmap?.close();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  return canvas;
}

function cropAndUpscaleCard(source: HTMLCanvasElement) {
  const bounds = detectCardBounds(source);
  const targetWidth = Math.min(2800, Math.max(2200, bounds.width * 2));
  const targetHeight = Math.round(bounds.height * (targetWidth / bounds.width));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像を補正できませんでした。');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, targetWidth, targetHeight);
  return canvas;
}

function detectCardBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { left: 0, top: 0, width: canvas.width, height: canvas.height };
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const xStep = Math.max(2, Math.floor(canvas.width / 320));
  const yStep = Math.max(2, Math.floor(canvas.height / 640));
  const rows = Array.from({ length: canvas.height }, (_, y) => {
    let active = 0;
    let samples = 0;
    for (let x = 0; x < canvas.width; x += xStep) {
      const offset = (y * canvas.width + x) * 4;
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) > 22) active += 1;
      samples += 1;
    }
    return active / samples;
  });
  const rowRange = longestActiveRange(rows, 0.28);
  if (rowRange[1] - rowRange[0] < canvas.height * 0.14) return { left: 0, top: 0, width: canvas.width, height: canvas.height };
  const columns = Array.from({ length: canvas.width }, (_, x) => {
    let active = 0;
    let samples = 0;
    for (let y = rowRange[0]; y <= rowRange[1]; y += yStep) {
      const offset = (y * canvas.width + x) * 4;
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) > 22) active += 1;
      samples += 1;
    }
    return active / samples;
  });
  const columnRange = longestActiveRange(columns, 0.28);
  const padding = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) * 0.004));
  const left = Math.max(0, columnRange[0] - padding);
  const top = Math.max(0, rowRange[0] - padding);
  const right = Math.min(canvas.width - 1, columnRange[1] + padding);
  const bottom = Math.min(canvas.height - 1, rowRange[1] + padding);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function longestActiveRange(values: number[], minimum: number): [number, number] {
  let best: [number, number] = [0, values.length - 1];
  let bestLength = 0;
  let start = -1;
  for (let index = 0; index <= values.length; index += 1) {
    const active = index < values.length && values[index] >= minimum;
    if (active && start < 0) start = index;
    if (!active && start >= 0) {
      if (index - start > bestLength) { best = [start, index - 1]; bestLength = index - start; }
      start = -1;
    }
  }
  return best;
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number) {
  const rotation = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  if (!rotation) return source;
  const canvas = document.createElement('canvas');
  const swapped = rotation === 90 || rotation === 270;
  canvas.width = swapped ? source.height : source.width;
  canvas.height = swapped ? source.width : source.height;
  const context = canvas.getContext('2d');
  if (!context) return source;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function enhanceCanvas(source: HTMLCanvasElement, mode: 'grayscale' | 'threshold', threshold = 180) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return source;
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const histogram = new Uint32Array(256);
  for (let offset = 0; offset < image.data.length; offset += 4) histogram[luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2])] += 1;
  const low = percentile(histogram, 0.01);
  const high = Math.max(low + 24, percentile(histogram, 0.99));
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const gray = luminance(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    const normalized = Math.max(0, Math.min(255, Math.round((gray - low) * 255 / (high - low))));
    const value = mode === 'threshold' ? (normalized >= threshold ? 255 : 0) : normalized;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function luminance(red: number, green: number, blue: number) { return Math.round(red * 0.299 + green * 0.587 + blue * 0.114); }

function percentile(histogram: Uint32Array, ratio: number) {
  const target = histogram.reduce((sum, value) => sum + value, 0) * ratio;
  let total = 0;
  for (let value = 0; value < histogram.length; value += 1) { total += histogram[value]; if (total >= target) return value; }
  return 255;
}

function findRomanNameLine(lines: OCRLine[]) {
  return lines.map((line) => {
    const latinWords = (line.words ?? []).filter((word) => /^[A-Za-zÀ-ÿ'\]-]{2,}$/.test(word.text));
    const bbox = latinWords.length ? {
      x0: Math.min(...latinWords.map((word) => word.bbox.x0)), y0: Math.min(...latinWords.map((word) => word.bbox.y0)),
      x1: Math.max(...latinWords.map((word) => word.bbox.x1)), y1: Math.max(...latinWords.map((word) => word.bbox.y1)),
    } : line.bbox;
    return { ...line, bbox, text: normalizeBase(line.text) };
  }).filter((line) => {
    const cleaned = line.text.replace(/[^A-Za-zÀ-ÿ' .\]-]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter((word) => word.replace(/[^A-Za-z]/g, '').length >= 2);
    return !/[@/:]/.test(line.text) && words.length >= 2 && words.join('').replace(/[^A-Za-z]/g, '').length >= 7 && !/(company|corporation|inc|ltd|creative|production|diamond|hotel|tel|fax|mobile|email|www|http|president|director)/i.test(cleaned);
  }).sort((left, right) => (right.bbox.x1 - right.bbox.x0) - (left.bbox.x1 - left.bbox.x0))[0];
}

function findJapaneseNameLine(lines: OCRLine[]) {
  return lines.map((line) => {
    const japaneseWords = (line.words ?? []).filter((word) => /^[一-龯々]{1,5}$/.test(word.text));
    const bbox = japaneseWords.length ? {
      x0: Math.min(...japaneseWords.map((word) => word.bbox.x0)), y0: Math.min(...japaneseWords.map((word) => word.bbox.y0)),
      x1: Math.max(...japaneseWords.map((word) => word.bbox.x1)), y1: Math.max(...japaneseWords.map((word) => word.bbox.y1)),
    } : line.bbox;
    return { ...line, bbox, text: normalizeBase(line.text) };
  }).filter((line) => {
    const compact = line.text.replace(/[^一-龯々]/g, '');
    return compact.length >= 3 && compact.length <= 7 && !/(株式会社|有限会社|合同会社|取締役|代表|店長|店革|会場|東京|名古屋|住所|本店|支店)/.test(line.text) && !/\d|@/.test(line.text);
  }).sort((left, right) => ((right.bbox.y1 - right.bbox.y0) * (right.bbox.x1 - right.bbox.x0)) - ((left.bbox.y1 - left.bbox.y0) * (left.bbox.x1 - left.bbox.x0)))[0];
}

function findTitleLine(lines: OCRLine[]) {
  return lines.map((line) => ({ ...line, text: compactJapanese(normalizeBase(line.text)) })).filter((line) => /(取締役|店[長革]|CEO|COO|CFO|CTO|代表|社長|会長|部長|課長|マネージャー|世話人)/i.test(line.text)).sort((left, right) => (right.bbox.y1 - right.bbox.y0) - (left.bbox.y1 - left.bbox.y0))[0];
}

function createNameCrop(source: HTMLCanvasElement, line: OCRLine) {
  const lineWidth = line.bbox.x1 - line.bbox.x0;
  const lineHeight = line.bbox.y1 - line.bbox.y0;
  const left = Math.max(0, Math.round(line.bbox.x0 - lineWidth * 0.55));
  const right = Math.min(source.width, Math.round(line.bbox.x1 + lineWidth * 0.55));
  const top = Math.max(0, Math.round(line.bbox.y0 - lineHeight * 4.3));
  const bottom = Math.min(source.height, Math.round(line.bbox.y0 - lineHeight * 0.15));
  if (right - left < 80 || bottom - top < 30) return null;
  const crop = document.createElement('canvas');
  const outputWidth = Math.min(3000, Math.max(1800, (right - left) * 4));
  crop.width = outputWidth;
  crop.height = Math.round((bottom - top) * outputWidth / (right - left));
  const context = crop.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, left, top, right - left, bottom - top, 0, 0, crop.width, crop.height);
  return enhanceCanvas(crop, 'threshold', 200);
}

function createDirectNameCrop(source: HTMLCanvasElement, line: OCRLine) {
  return createDirectLineCrop(source, line, 0.18, 0.18, 200);
}

function createDirectLineCrop(source: HTMLCanvasElement, line: OCRLine, leftPadding: number, rightPadding: number, threshold: number) {
  const width = line.bbox.x1 - line.bbox.x0;
  const height = line.bbox.y1 - line.bbox.y0;
  const left = Math.max(0, Math.round(line.bbox.x0 - width * leftPadding));
  const right = Math.min(source.width, Math.round(line.bbox.x1 + width * rightPadding));
  const top = Math.max(0, Math.round(line.bbox.y0 - height * 0.35));
  const bottom = Math.min(source.height, Math.round(line.bbox.y1 + height * 0.35));
  if (right - left < 60 || bottom - top < 24) return null;
  const crop = document.createElement('canvas');
  const outputWidth = Math.min(3000, Math.max(1800, (right - left) * 4));
  crop.width = outputWidth;
  crop.height = Math.round((bottom - top) * outputWidth / (right - left));
  const context = crop.getContext('2d');
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, left, top, right - left, bottom - top, 0, 0, crop.width, crop.height);
  return enhanceCanvas(crop, 'threshold', threshold);
}

function normalizeBase(value: string) {
  return value.replace(/[②⑳]/g, '@').normalize('NFKC').replace(/[‐‑‒–—―－]/g, '-').replace(/[|｜]/g, ' ').replace(/\s+/g, ' ').trim();
}

function compactJapanese(value: string) {
  let result = value;
  for (let pass = 0; pass < 3; pass += 1) result = result.replace(/([一-龯々ぁ-んァ-ヶ])\s+(?=[一-龯々ぁ-んァ-ヶ])/g, '$1');
  return result.replace(/株\s*式\s*会\s*社/g, '株式会社').replace(/有\s*限\s*会\s*社/g, '有限会社').replace(/合\s*同\s*会\s*社/g, '合同会社').trim();
}

function normalizeContact(value: string) {
  return value.replace(/(?:E-?mail|メール(?:アドレス)?|Mail)\s*[:：]?/ig, '')
    .replace(/([0-9])O(?=[0-9])/g, '$10').replace(/O(?=[0-9]{2,4}[-])/g, '0')
    .replace(/[ー－―‐‑–—]/g, '-').replace(/\s+/g, '')
    .replace(/^00(?=(?:70|80|90)-)/, '0').replace(/:com\b/ig, '.com').replace(/\.cojp\b/ig, '.co.jp');
}

function fixEmail(value: string) { return value.replace(/[),;:]+$/, '').replace(/\.cojp$/i, '.co.jp').toLowerCase(); }
function fixWebsite(value: string) {
  const cleaned = value.replace(/[),;:]+$/, '').replace(/\.cojp$/i, '.co.jp');
  if (/^www\./i.test(cleaned)) return cleaned.toLowerCase();
  const match = cleaned.match(/^(https?:\/\/)([^/]+)(.*)$/i);
  return match ? `${match[1].toLowerCase()}${match[2].toLowerCase()}${match[3]}` : cleaned;
}
function normalizePhone(value: string) { return value.replace(/^\+81-?0?/, '+81-'); }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }

function extractPositionTitle(line: string) {
  const titles: Array<[RegExp, string]> = [
    [/代表取締役/, '代表取締役'], [/専務取締役/, '専務取締役'], [/常務取締役/, '常務取締役'], [/副社長/, '副社長'],
    [/取締役/, '取締役'], [/社長/, '社長'], [/会長/, '会長'], [/\bCEO\b/i, 'CEO'], [/\bCOO\b/i, 'COO'],
    [/\bCFO\b/i, 'CFO'], [/\bCTO\b/i, 'CTO'], [/\bPresident\b/i, 'President'], [/\bDirector\b/i, 'Director'],
    [/部長/, '部長'], [/課長/, '課長'], [/マネージャー/, 'マネージャー'], [/店[長革]/, '店長'], [/世話人/, '世話人'], [/代表/, '代表'],
  ];
  const found = titles.filter(([pattern]) => pattern.test(line)).map(([, title]) => title);
  return [...new Set(found.filter((title) => !found.some((other) => other !== title && other.includes(title))))].join(' / ');
}

function isCompanyLine(line: string) {
  return !isContactLine(line) && /(株式会社|有限会社|合同会社|一般社団法人|一般財団法人|医療法人|税理士法人|弁護士法人|事務所|\bInc\.?\b|\bLLC\b|\bCo\.?[, ]*Ltd\.?\b|\bCorporation\b)/i.test(line);
}

function cleanCompany(line: string) { return line.replace(/^[\s/\-:：]+/, '').replace(/^(会社名|Company)\s*[:：]?\s*/i, '').trim(); }

function isDepartmentLine(line: string) {
  return !isContactLine(line) && !extractPositionTitle(line) && line.length <= 40 && /(?:本店|支店|営業所|事業部|営業部|管理部|総務部|企画部|開発部|部|課|室|店)(?:・[^0-9@]{1,12}(?:本店|支店|店))?$/.test(line) && !/〒|\d{3,}/.test(line);
}

function cleanDepartment(line: string) { return line.replace(/^[\s/\-:：]+/, '').trim(); }

function findCompanyBeforeDepartment<T extends { source: number; order: number; compact: string }>(records: T[], department?: T) {
  if (!department) return undefined;
  const departmentIndex = records.indexOf(department);
  for (let index = departmentIndex - 1; index >= 0 && index >= departmentIndex - 4; index -= 1) {
    const record = records[index];
    if (record.source !== department.source) break;
    if (isPossibleOrganization(record.compact)) return record;
  }
  return undefined;
}

function isPossibleOrganization(line: string) {
  return line.length >= 3 && line.length <= 36 && !isContactLine(line) && !extractPositionTitle(line) && !looksLikeAddress(line) && !/会場|申込|MEMBER|BELGIUM/i.test(line) && !isJapaneseNameCandidate(line);
}

function chooseName(records: Array<{ source: number; raw: string; compact: string }>, excluded: Set<string>) {
  const candidates = records.map((record) => ({ record, formatted: formatJapaneseName(record.raw) })).filter(({ record, formatted }) => formatted && !excluded.has(record.compact) && !isContactLine(record.raw) && !/(株式会社|有限会社|合同会社|会場|本店|支店|営業所|住所|申込|東京|名古屋|ホテル|ダイヤモンド)/.test(record.compact) && !extractPositionTitle(record.compact));
  candidates.sort((left, right) => nameScore(right.record, right.formatted) - nameScore(left.record, left.formatted));
  if (candidates[0]) return candidates[0].formatted;
  return records.map((record) => record.raw.replace(/[^A-Za-zÀ-ÿ' .-]/g, '').replace(/\s+/g, ' ').trim()).find((line) => line.split(' ').filter((word) => word.length >= 2).length === 2 && !/(company|inc|ltd|diamond|creative|production)/i.test(line)) ?? '';
}

function nameScore(record: { source: number; raw: string }, formatted: string) {
  const compactLength = formatted.replace(/\s/g, '').length;
  return (record.source === 0 ? 30 : 0) + (/\s/.test(record.raw) ? 8 : 0) + ([4, 5].includes(compactLength) ? 5 : 0) - Math.abs(compactLength - 4);
}

function formatJapaneseName(value: string) {
  const cleaned = value.replace(/[^一-龯々ぁ-んァ-ヶ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens[0] && tokens[0].length >= 3 && tokens[0].length <= 5 && tokens.slice(1).every((token) => token.length === 1)) {
    const split = tokens[0].length >= 4 ? 2 : 1;
    return `${tokens[0].slice(0, split)} ${tokens[0].slice(split)}`;
  }
  const compact = tokens.join('');
  if (compact.length < 3 || compact.length > 7 || !isJapaneseNameCandidate(compact)) return '';
  if (tokens.length >= 2) return `${tokens[0]} ${tokens.slice(1).join('')}`;
  const split = compact.length >= 4 ? 2 : 1;
  return `${compact.slice(0, split)} ${compact.slice(split)}`;
}

function isJapaneseNameCandidate(line: string) { return /^[一-龯々]{3,7}$/.test(line.replace(/\s/g, '')); }
function isContactLine(line: string) { return /@|(?:https?:\/\/|www\.)|\b(?:TEL|FAX|Mobile|Phone|E-?mail)\b/i.test(line) || /0\d{1,4}[-\s]\d{1,4}[-\s]\d{3,4}/.test(line); }

function looksLikeAddress(line: string) {
  return !isContactLine(line) && (/〒\s*\d{3}[-ー－]\d{4}/.test(line) || /(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県|名古屋市|中央区|港区|目黒区).{3,}/.test(line) && /\d/.test(line));
}

function cleanAddress(line: string) {
  const postalIndex = line.search(/〒?\s*\d{3}[-ー－]\d{4}/);
  const withoutPrefix = postalIndex >= 0 ? line.slice(postalIndex).replace(/^〒?\s*\d{3}[-ー－]\d{4}\s*/, '') : line;
  return withoutPrefix.replace(/^(?:東京本店|青山店|本店|支店)\s*/, '').replace(/(ホーム|ビル|マンション)\s*S(?=F\b)/i, '$18').trim();
}

function looksLikeBuildingContinuation(line: string) { return !isContactLine(line) && line.length <= 40 && /(?:ビル|マンション|ホーム|タワー|館|F|階)$/i.test(line) && !looksLikeAddress(line); }
function todayInJapan() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
