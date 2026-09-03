// ランクごとの特典。**ここが唯一の定義**で、Webとアプリの両方がこれを読む。
// 増やすとき・入れ替えるときは、このファイルだけを直す。
//
// ランクは**招待して参加した仲間の人数**で上がり、**下がらない**。
// 掲示板は人が増えるほど値打ちが出るので、いちばん報いたい行いは
// 「仲間を連れてくること」。一度上がったランクを下げないのは、
// 「維持しないと失う」にすると義務感が出て、場が痩せるため。
//
// 金額に触れる特典（広告の割引）は webOnly を立てる。アプリ内に価格・割引・
// 購入への誘導を置けないため（App Store 3.1.1 / docs/billing-architecture.md）。

/** 1=SILVER 2=GOLD 3=PLATINUM 4=DIAMOND */
export const rankNames = ['SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'] as const;

/**
 * そのランクになるのに必要な、招待して参加した仲間の人数。
 *
 * 上のランクほど、場そのものを大きくした人にしか届かないようにしてある。
 * 1人や2人で最上位まで行けると、ランクが「早く始めた人の印」になって、
 * あとから入った人の目標にならない。
 */
export const rankThresholds = [0, 10, 30, 50];

export type RankPerk = {
  key: string;
  label: string;
  /** 何ができるようになるか。ひと言で。 */
  detail: string;
  /** 解放されるランク（1〜4）。 */
  minLevel: number;
  /** 金額に触れるので、アプリでは出さない。 */
  webOnly?: boolean;
  /** まだ作っていない。画面には「近日公開」と出す。 */
  soon?: boolean;
};

export const rankPerks: RankPerk[] = [
  {
    key: 'extend', label: '募集の延長', minLevel: 2,
    detail: '期限が来た案件を、1件につき1回だけ2週間延ばせます。もう少し待てば見つかりそうなときに。',
  },
  {
    key: 'longtext', label: '掲載文章の上限なし', minLevel: 2,
    detail: '案件の本文が600字までの制限から外れ、いくらでも書けるようになります。背景や条件を省かずに伝えられます。',
  },
  {
    key: 'industries', label: 'おすすめ業種を10枠', minLevel: 2,
    detail: 'ホームの「あなたにおすすめ」に出す業種が、6個から10個に増えます。守備範囲の広い方ほど効きます。',
  },
  {
    key: 'photos', label: '写真の複数枚投稿', minLevel: 3,
    detail: '案件に付けられる写真が1枚から5枚に増えます。現場や商品を何枚も見せられます。',
  },
  {
    key: 'video', label: '動画を投稿できる', minLevel: 3,
    detail: '案件に短い動画を付けられるようになります。大きい動画は送る前に端末側で自動的に縮めるので、通信量を気にせず選べます。',
  },
  {
    key: 'budget', label: '予算での絞り込み', minLevel: 3,
    detail: '仕事の掲示板を、その案件の予算で絞り込めます。年商が大きくても案件の予算が小さければ意味がないので、物差しは会社の規模ではなく予算にしてあります。',
  },
  {
    key: 'ad-off-10', label: '広告が10%OFF', minLevel: 3, webOnly: true,
    detail: '広告の出稿料が1割引きになります。バナーも掲示板の上位も、期間にかかわらず引かれます。',
  },
  {
    key: 'ad-off-30', label: '広告が30%OFF', minLevel: 4, webOnly: true,
    detail: '広告の出稿料が3割引きになります。10%OFFとは重ねず、3割引きのほうが適用されます。',
  },
];

/** アプリに出してよい特典だけ。金額に触れるものは外す。 */
export const appRankPerks = rankPerks.filter((perk) => !perk.webOnly);

/** いちばん上のランクの level。マスターアカウントに与える値。 */
export const MAX_LEVEL = rankNames.length;

export function rankName(level: number) {
  return rankNames[Math.min(Math.max(level, 1), rankNames.length) - 1];
}

/** 招待して参加した人数でのランク。しきい値を超えた分だけ上がり、下がらない。 */
export function levelFor(inviteCount: number) {
  let level = 1;
  rankThresholds.forEach((threshold, index) => { if (inviteCount >= threshold) level = index + 1; });
  return level;
}

// --- 特典の中身。画面もAPIも、必ずここを通して判断する ---------------------

/** 案件の本文を何字まで書けるか。GOLD以上は事実上の上限なし。 */
export function descriptionLimit(level: number) {
  // 「上限なし」と言っても、壊れた入力から守る天井は要る。ここに当たる人はまずいない。
  return level >= 2 ? 20000 : 600;
}

/** 案件に付けられる写真の枚数。PLATINUM以上で複数枚。 */
/** いちばん上のランクで付けられる写真の枚数。鍵つきの空き枠を出すのに使う。 */
export const PHOTO_LIMIT_TOP = 5;

export function photoLimit(level: number) {
  return level >= 3 ? PHOTO_LIMIT_TOP : 1;
}

/** おすすめに出したい業種を、いくつまで選べるか。 */
export function notifyIndustryLimit(level: number) {
  return level >= 2 ? 10 : 6;
}

/** 募集を延長できるか。 */
export function canExtendRequest(level: number) {
  return level >= 2;
}

/** 延長したときに増える日数。 */
export const EXTEND_DAYS = 14;

/** 動画を付けられるか。PLATINUM以上。 */
export function canPostVideo(level: number) {
  return level >= 3;
}

/** 予算で絞り込めるか。PLATINUM以上。 */
export function canFilterByBudget(level: number) {
  return level >= 3;
}

/**
 * 広告の割引率。**重ねない。** 上のランクのほうだけが効く。
 * 金額の計算はサーバー（app/api/ads/checkout）でこの値を使う。
 */
export function adDiscountRate(level: number) {
  if (level >= 4) return 0.3;
  if (level >= 3) return 0.1;
  return 0;
}

/** 何日先まで広告を申し込めるか。ランクでは変えない。 */
export const AD_DAYS_AHEAD_ALL = 60;

/** 1回の申し込みで買える最長の日数。ランクでは変えない。 */
export const AD_MAX_DAYS_ALL = 30;
