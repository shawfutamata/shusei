// ランク特典の正は app/rank-perks.ts。Metroはmobile/の外を読めないので、
// ここから mobile/src/constants/rank-perks.ts を書き出して同じ内容を保つ。
//   node --experimental-strip-types scripts/sync-mobile-perks.mjs          # 書き出す
//   node --experimental-strip-types scripts/sync-mobile-perks.mjs --check  # ずれていたら失敗する（CI用）
//
// 金額に触れる特典（webOnly）はアプリに書き出さない。アプリ内に価格・割引・
// 購入への誘導を置けないため（App Store 3.1.1）。
import { readFileSync, writeFileSync } from 'node:fs';
import { appRankPerks, rankNames, rankThresholds } from '../app/rank-perks.ts';

const TARGET = 'mobile/src/constants/rank-perks.ts';

const perks = appRankPerks
  .map((perk) => `  { key: '${perk.key}', label: '${perk.label}', minLevel: ${perk.minLevel}${perk.soon ? ', soon: true' : ''}, detail: '${perk.detail}' },`)
  .join('\n');

const generated = `// このファイルは自動生成です。直接編集しないこと。
// 正は app/rank-perks.ts。更新は node --experimental-strip-types scripts/sync-mobile-perks.mjs
//
// 金額に触れる特典はここに含めない（App Store 3.1.1）。Webだけに出す。
export type RankPerk = { key: string; label: string; detail: string; minLevel: number; soon?: boolean };

export const rankNames = [${rankNames.map((name) => `'${name}'`).join(', ')}];
export const rankThresholds = [${rankThresholds.join(', ')}];

export const rankPerks: RankPerk[] = [
${perks}
];

export function levelFor(introCount: number) {
  let level = 1;
  rankThresholds.forEach((threshold, index) => { if (introCount >= threshold) level = index + 1; });
  return level;
}
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(TARGET, 'utf8');
  if (current !== generated) {
    console.error(`${TARGET} が app/rank-perks.ts とずれています。scripts/sync-mobile-perks.mjs を実行してください。`);
    process.exit(1);
  }
  console.log(`${TARGET} は最新です。`);
} else {
  writeFileSync(TARGET, generated);
  console.log(`${TARGET} に ${appRankPerks.length} 件の特典を書き出しました。`);
}
