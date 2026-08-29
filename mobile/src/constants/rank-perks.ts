// このファイルは自動生成です。直接編集しないこと。
// 正は app/rank-perks.ts。更新は node --experimental-strip-types scripts/sync-mobile-perks.mjs
//
// 金額に触れる特典はここに含めない（App Store 3.1.1）。Webだけに出す。
export type RankPerk = { key: string; label: string; detail: string; minLevel: number; soon?: boolean };

export const rankNames = ['PEARL', 'EMERALD', 'SAPPHIRE', 'RUBY', 'DIAMOND'];
export const rankThresholds = [0, 3, 6, 10, 20];

export const rankPerks: RankPerk[] = [
  { key: 'crest', label: 'ランクの紋章', minLevel: 1, detail: 'プロフィールと投稿にランクの紋章が付きます。どれだけ紹介してきた人かが、ひと目で伝わります。' },
  { key: 'extend', label: '募集の延長', minLevel: 2, detail: '期限が来た探しごとを、1件につき1回だけ2週間延ばせます。もう少し待てば見つかりそうなときに。' },
  { key: 'longtext', label: '掲載文章の上限なし', minLevel: 2, detail: '探しごとの本文が600字までの制限から外れ、いくらでも書けるようになります。背景や条件を省かずに伝えられます。' },
  { key: 'industries', label: 'おすすめ業種の枠', minLevel: 3, detail: '通知を受け取る業種が6個から8個に増えます。RUBY以上では10個まで選べます。' },
  { key: 'pin', label: '注目ピン', minLevel: 3, detail: '自分の探しごとを1件、一覧のいちばん上に3日間だけ固定できます。ひと月に1回まで。' },
  { key: 'photos', label: '写真を複数枚', minLevel: 3, detail: '探しごとに付けられる写真が1枚から3枚に増えます。RUBY以上では5枚まで。現場や商品を何枚も見せられます。' },
  { key: 'video', label: '動画を投稿できる', minLevel: 4, soon: true, detail: '探しごとに短い動画を付けられるようになります。現場や商品は、写真より動画のほうが伝わります。' },
  { key: 'promo', label: '業種別プロモーション', minLevel: 5, detail: '自分の探しごとを1件、選んだ業種の一覧でいちばん上に出せます。その業種の人にだけ、確実に届きます。' },
];

export function levelFor(introCount: number) {
  let level = 1;
  rankThresholds.forEach((threshold, index) => { if (introCount >= threshold) level = index + 1; });
  return level;
}
