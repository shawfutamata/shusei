// ランクごとの特典。**ここが唯一の定義**で、Webとアプリの両方がこれを読む。
// 増やすとき・入れ替えるときは、このファイルだけを直す。
//
// ランクは紹介した数で上がり、**下がらない**。紹介という善意の行為を
// 「維持しないと失う」にすると義務感が出て、場が痩せるため。
//
// 金額に触れる特典（出稿枠まわり）は webOnly を立てる。アプリ内に価格・割引・
// 購入への誘導を置けないため（App Store 3.1.1 / docs/billing-architecture.md）。

/** 1=PEARL 2=EMERALD 3=SAPPHIRE 4=RUBY 5=DIAMOND */
export const rankNames = ['PEARL', 'EMERALD', 'SAPPHIRE', 'RUBY', 'DIAMOND'] as const;

/** そのランクになるのに必要な、紹介した数。 */
export const rankThresholds = [0, 3, 6, 10, 20];

export type RankPerk = {
  key: string;
  label: string;
  /** 何ができるようになるか。ひと言で。 */
  detail: string;
  /** 解放されるランク（1〜5）。 */
  minLevel: number;
  /** 金額に触れるので、アプリでは出さない。 */
  webOnly?: boolean;
  /** まだ作っていない。画面には「近日公開」と出す。 */
  soon?: boolean;
};

export const rankPerks: RankPerk[] = [
  {
    key: 'extend', label: '募集の延長', minLevel: 2,
    detail: '期限が来た探しごとを、1件につき1回だけ2週間延ばせます。もう少し待てば見つかりそうなときに。',
  },
  {
    key: 'longtext', label: '掲載文章の上限なし', minLevel: 2,
    detail: '探しごとの本文が600字までの制限から外れ、いくらでも書けるようになります。背景や条件を省かずに伝えられます。',
  },
  {
    key: 'industries', label: 'おすすめ業種の枠', minLevel: 3,
    detail: '通知を受け取る業種が6個から8個に増えます。RUBY以上では10個まで選べます。',
  },
  {
    key: 'photos', label: '写真の複数枚投稿', minLevel: 3,
    detail: '探しごとに付けられる写真が1枚から3枚に増えます。RUBY以上では5枚まで。現場や商品を何枚も見せられます。',
  },
  {
    key: 'ad-ahead', label: '広告の事前予約', minLevel: 4, webOnly: true,
    detail: '広告のカレンダーが先まで開きます。RUBYは120日先、DIAMONDは180日先まで。催しや繁忙期に合わせて確保できます。',
  },
  {
    key: 'video', label: '動画を投稿できる', minLevel: 4, soon: true,
    detail: '探しごとに短い動画を付けられるようになります。現場や商品は、写真より動画のほうが伝わります。',
  },
];

/** アプリに出してよい特典だけ。金額に触れるものは外す。 */
export const appRankPerks = rankPerks.filter((perk) => !perk.webOnly);

export function rankName(level: number) {
  return rankNames[Math.min(Math.max(level, 1), rankNames.length) - 1];
}

/** その紹介数でのランク（1〜5）。しきい値を超えた分だけ上がり、下がらない。 */
export function levelFor(introCount: number) {
  let level = 1;
  rankThresholds.forEach((threshold, index) => { if (introCount >= threshold) level = index + 1; });
  return level;
}

// --- 特典の中身。画面もAPIも、必ずここを通して判断する ---------------------

/** 探しごとの本文を何字まで書けるか。EMERALD以上は事実上の上限なし。 */
export function descriptionLimit(level: number) {
  // 「上限なし」と言っても、壊れた入力から守る天井は要る。ここに当たる人はまずいない。
  return level >= 2 ? 20000 : 600;
}

/** 探しごとに付けられる写真の枚数。 */
export function photoLimit(level: number) {
  if (level >= 4) return 5;
  if (level >= 3) return 3;
  return 1;
}

/** おすすめに出したい業種を、いくつまで選べるか。 */
export function notifyIndustryLimit(level: number) {
  if (level >= 4) return 10;
  if (level >= 3) return 8;
  return 6;
}

/** 募集を延長できるか。 */
export function canExtendRequest(level: number) {
  return level >= 2;
}

/** 延長したときに増える日数。 */
export const EXTEND_DAYS = 14;

/** 注目ピンを使えるか。 */
export function canPinRequest(level: number) {
  return level >= 3;
}

/** ピンで上に出しておく日数。 */
export const PIN_DAYS = 3;

/** 何日先まで申し込めるか。上位ランクは先まで押さえられる（事前予約）。 */
export function adDaysAhead(level: number) {
  if (level >= 5) return 180;
  if (level >= 4) return 120;
  return 60;
}

/** 1回の申し込みで選べる掲載日数の上限。上位ランクは長く出せる。 */
export function adMaxDays(level: number) {
  return level >= 5 ? 60 : 30;
}
