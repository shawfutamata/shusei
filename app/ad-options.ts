// トップバナーへの出稿枠。金額は app/plan-catalog.ts（Web専用）にある。
// この2つを分けているのは、画面（クライアント）から金額のファイルを
// 読まずに枠数やランク条件だけ使えるようにするため。

/**
 * 広告を出せる場所は2つ。どちらに出すかを最初に選んでもらう。
 *
 * 枠数を絞ってあるのは、増やすほど1枠の価値が下がるため。
 * バナーは5枠を3秒ずつ回すので、1周15秒。ホームを開いている間に
 * 5枠ぜんぶが目に入る。10枠だと1周が長すぎて、後ろの枠が見られない。
 */
export const adPlacements = [
  {
    key: 'banner',
    name: '画面上部のバナー',
    where: 'ホームを開いて最初に目に入るところ',
    detail: '5枠が3秒ずつ入れ替わります。1周15秒なので、ホームを開いている間にひととおり目に入ります。',
    slots: 5,
  },
  {
    key: 'list',
    name: '仕事の掲示板の上位',
    where: '仕事の掲示板のいちばん上',
    detail: '一覧の先頭3件として出ます。探している人がいちばん熱心に見ている場所です。',
    slots: 3,
  },
] as const;

export type AdPlacement = (typeof adPlacements)[number]['key'];

export const DEFAULT_PLACEMENT: AdPlacement = 'banner';

/** その場所に同じ日へ出せる本数。これを超えるとその日は満枠。早い者勝ち。 */
export function placementSlots(placement: string) {
  return adPlacements.find((item) => item.key === placement)?.slots ?? adPlacements[0].slots;
}

export function placementName(placement: string) {
  return adPlacements.find((item) => item.key === placement)?.name ?? adPlacements[0].name;
}

export function isAdPlacement(value: string): value is AdPlacement {
  return adPlacements.some((item) => item.key === value);
}

/** バナーが次へ送るまでの時間。5枠×3秒で1周15秒。 */
export const AD_ROTATE_MS = 3000;

/**
 * 1回の申し込みで買える最短の日数。
 * 1日だけの予約が乱立すると、カレンダーが虫食いになって空きが読めなくなる。
 */
export const AD_MIN_DAYS = 7;

/** 1回の申し込みで選べる掲載日数の上限。ランクの特典で延びる。 */
export const AD_MAX_DAYS = 30;

/** 何日先まで申し込めるか。ランクの特典で先まで見えるようになる。 */
export const AD_DAYS_AHEAD = 60;

/** タイトルの上限。バナーの見出しになるので短く。 */
export const AD_TITLE_MAX = 30;

/** 説明文の上限。バナーの2行目に入るので、こちらも短く。 */
export const AD_DESCRIPTION_MAX = 60;

/** 決済されないまま押さえている枠を解放するまでの時間（分）。 */
export const AD_RESERVATION_MINUTES = 60;
