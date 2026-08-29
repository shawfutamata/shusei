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
    key: 'crest', label: 'ランクの紋章', minLevel: 1,
    detail: 'プロフィールと投稿にランクの紋章が付きます。どれだけ紹介してきた人かが、ひと目で伝わります。',
  },
  {
    key: 'record', label: '紹介の実績が出る', minLevel: 1,
    detail: '紹介した数とポイントが他の会員に見えます。紹介を頼むときの後押しになります。',
  },
  {
    key: 'extend', label: '募集の延長', minLevel: 2,
    detail: '期限が来た探しごとを、1件につき1回だけ2週間延ばせます。もう少し待てば見つかりそうなときに。',
  },
  {
    key: 'industries', label: 'おすすめ業種の枠', minLevel: 3,
    detail: '通知を受け取る業種が6個から8個に増えます。RUBY以上では10個まで選べます。',
  },
  {
    key: 'pin', label: '注目ピン', minLevel: 3,
    detail: '自分の探しごとを1件、一覧のいちばん上に3日間だけ固定できます。ひと月に1回まで。',
  },
  {
    key: 'ad', label: 'トップバナーへの出稿', minLevel: 4, webOnly: true,
    detail: 'ホームのいちばん先に目に入る場所へ、1ヶ月あいだ自分の告知を出せるようになります。',
  },
  {
    key: 'photos', label: '探しごとの写真が3枚', minLevel: 4, soon: true,
    detail: 'いまは1枚までの写真を、3枚まで付けられるようになります。',
  },
  {
    key: 'ad-ahead', label: '出稿枠の先取り', minLevel: 5, webOnly: true,
    detail: '出稿枠を、他の方より先の月まで押さえられます。催しや繁忙期に合わせて確保できます。',
  },
  {
    key: 'hall', label: '殿堂入り', minLevel: 5, soon: true,
    detail: 'ホームに「今月いちばん紹介した人」として名前が出ます。',
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
