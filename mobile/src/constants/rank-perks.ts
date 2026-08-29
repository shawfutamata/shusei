// このファイルは自動生成です。直接編集しないこと。
// 正は app/rank-perks.ts。更新は node --experimental-strip-types scripts/sync-mobile-perks.mjs
//
// 金額に触れる特典はここに含めない（App Store 3.1.1）。Webだけに出す。
export type RankPerk = { key: string; label: string; detail: string; minLevel: number; soon?: boolean };

export const rankNames = ['PEARL', 'EMERALD', 'SAPPHIRE', 'RUBY', 'DIAMOND'];
export const rankThresholds = [0, 3, 6, 10, 20];

export const rankPerks: RankPerk[] = [
  { key: 'crest', label: 'ランクの紋章', minLevel: 1, detail: 'プロフィールと投稿にランクの紋章が付きます。どれだけ紹介してきた人かが、ひと目で伝わります。' },
  { key: 'record', label: '紹介の実績が出る', minLevel: 1, detail: '紹介した数とポイントが他の会員に見えます。紹介を頼むときの後押しになります。' },
  { key: 'extend', label: '募集の延長', minLevel: 2, detail: '期限が来た探しごとを、1件につき1回だけ2週間延ばせます。もう少し待てば見つかりそうなときに。' },
  { key: 'industries', label: 'おすすめ業種の枠', minLevel: 3, detail: '通知を受け取る業種が6個から8個に増えます。RUBY以上では10個まで選べます。' },
  { key: 'pin', label: '注目ピン', minLevel: 3, detail: '自分の探しごとを1件、一覧のいちばん上に3日間だけ固定できます。ひと月に1回まで。' },
  { key: 'photos', label: '探しごとの写真が3枚', minLevel: 4, soon: true, detail: 'いまは1枚までの写真を、3枚まで付けられるようになります。' },
  { key: 'hall', label: '殿堂入り', minLevel: 5, soon: true, detail: 'ホームに「今月いちばん紹介した人」として名前が出ます。' },
];

export function levelFor(introCount: number) {
  let level = 1;
  rankThresholds.forEach((threshold, index) => { if (introCount >= threshold) level = index + 1; });
  return level;
}
