// ランク特典の正は app/rank-perks.ts。Metroはmobile/の外を読めないので、
// ここから mobile/src/constants/rank-perks.ts を書き出して同じ内容を保つ。
//   node --experimental-strip-types scripts/sync-mobile-perks.mjs          # 書き出す
//   node --experimental-strip-types scripts/sync-mobile-perks.mjs --check  # ずれていたら失敗する（CI用）
//
// 金額に触れる特典（webOnly）はアプリに書き出さない。アプリ内に価格・割引・
// 購入への誘導を置けないため（App Store 3.1.1）。
import { readFileSync, writeFileSync } from 'node:fs';
import { appRankPerks, rankNames, rankThresholds } from '../app/rank-perks.ts';
import { budgetBands } from '../app/budget-options.ts';

const TARGET = 'mobile/src/constants/rank-perks.ts';
const BUDGET_TARGET = 'mobile/src/constants/budget-options.ts';

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

export function levelFor(inviteCount: number) {
  let level = 1;
  rankThresholds.forEach((threshold, index) => { if (inviteCount >= threshold) level = index + 1; });
  return level;
}
`;

// 予算の帯も同じ理由でアプリ側に写す。金額そのものではなく帯なので
// （買うものではない）、アプリに出して差し支えない。
const generatedBudget = `// このファイルは自動生成です。直接編集しないこと。
// 正は app/budget-options.ts。更新は node --experimental-strip-types scripts/sync-mobile-perks.mjs
//
// 金額そのものではなく帯なので（買うものではない）、アプリに出して差し支えない。
export const budgetBands: Record<string, string> = {
${Object.entries(budgetBands).map(([key, label]) => `  ${key}: '${label}',`).join('\n')}
};
`;

if (process.argv.includes('--check')) {
  for (const [target, want, source] of [[TARGET, generated, 'app/rank-perks.ts'], [BUDGET_TARGET, generatedBudget, 'app/budget-options.ts']]) {
    if (readFileSync(target, 'utf8') !== want) {
      console.error(`${target} が ${source} とずれています。scripts/sync-mobile-perks.mjs を実行してください。`);
      process.exit(1);
    }
    console.log(`${target} は最新です。`);
  }
} else {
  writeFileSync(TARGET, generated);
  writeFileSync(BUDGET_TARGET, generatedBudget);
  console.log(`${TARGET} に ${appRankPerks.length} 件の特典、${BUDGET_TARGET} に ${Object.keys(budgetBands).length} 件の予算帯を書き出しました。`);
}
