// このファイルは自動生成です。直接編集しないこと。
// 正は app/rank-perks.ts。更新は node --experimental-strip-types scripts/sync-mobile-perks.mjs
//
// 金額に触れる特典はここに含めない（App Store 3.1.1）。Webだけに出す。
export type RankPerk = { key: string; label: string; detail: string; minLevel: number; soon?: boolean };

export const rankNames = ['SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
export const rankThresholds = [0, 10, 30, 50];

export const rankPerks: RankPerk[] = [
  { key: 'extend', label: '募集の延長', minLevel: 2, detail: '期限が来た探しごとを、1件につき1回だけ2週間延ばせます。もう少し待てば見つかりそうなときに。' },
  { key: 'longtext', label: '掲載文章の上限なし', minLevel: 2, detail: '探しごとの本文が600字までの制限から外れ、いくらでも書けるようになります。背景や条件を省かずに伝えられます。' },
  { key: 'industries', label: 'おすすめ業種を10枠', minLevel: 2, detail: 'ホームの「あなたにおすすめ」に出す業種が、6個から10個に増えます。守備範囲の広い方ほど効きます。' },
  { key: 'photos', label: '写真の複数枚投稿', minLevel: 3, detail: '探しごとに付けられる写真が1枚から5枚に増えます。現場や商品を何枚も見せられます。' },
  { key: 'video', label: '動画を投稿できる', minLevel: 3, detail: '探しごとに短い動画を付けられるようになります。大きい動画は送る前に端末側で自動的に縮めるので、通信量を気にせず選べます。' },
  { key: 'revenue', label: '年商での絞り込み', minLevel: 3, detail: '仕事の掲示板を、投稿した会社の年商で絞り込めます。規模の合う相手だけを見たいときに。' },
];

export function levelFor(introCount: number) {
  let level = 1;
  rankThresholds.forEach((threshold, index) => { if (introCount >= threshold) level = index + 1; });
  return level;
}
