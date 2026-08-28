// 会場一覧の正は app/venue-options.ts。Metroはmobile/の外を読めないので、
// ここから mobile/src/constants/venues.ts を書き出して同じ内容を保つ。
//   node --experimental-strip-types scripts/sync-mobile-venues.mjs          # 書き出す
//   node --experimental-strip-types scripts/sync-mobile-venues.mjs --check  # ずれていたら失敗する（CI用）
import { readFileSync, writeFileSync } from 'node:fs';
import { venuesByPrefecture } from '../app/venue-options.ts';

const TARGET = 'mobile/src/constants/venues.ts';

const body = Object.entries(venuesByPrefecture)
  .map(([prefecture, venues]) => `  ${prefecture}: [${venues.map((venue) => `'${venue}'`).join(', ')}],`)
  .join('\n');

const generated = `// このファイルは自動生成です。直接編集しないこと。
// 正は app/venue-options.ts。更新は node --experimental-strip-types scripts/sync-mobile-venues.mjs
export const venuesByPrefecture: Record<string, string[]> = {
${body}
};

export const venuePrefectures = Object.keys(venuesByPrefecture);
export const OTHER_VENUE = '__other__';

export function findVenuePrefecture(venue: string) {
  const trimmed = venue.trim();
  if (!trimmed) return '';
  return venuePrefectures.find((prefecture) => venuesByPrefecture[prefecture].includes(trimmed)) ?? '';
}

export function isListedVenue(venue: string) {
  return Boolean(findVenuePrefecture(venue));
}
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(TARGET, 'utf8');
  if (current !== generated) {
    console.error(`${TARGET} が app/venue-options.ts とずれています。scripts/sync-mobile-venues.mjs を実行してください。`);
    process.exit(1);
  }
  console.log(`${TARGET} は最新です。`);
} else {
  writeFileSync(TARGET, generated);
  console.log(`${TARGET} を更新しました（${venuePrefectures().length}都道府県）。`);
}

function venuePrefectures() {
  return Object.keys(venuesByPrefecture);
}
