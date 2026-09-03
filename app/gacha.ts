// 広告枠の無料ガチャ。クリスマスからお正月にかけての催し。
//
// ねらいは2つ。**掲示板の上に出ているものを増やすこと**と、広告を出したことが
// 無い会員に一度出してもらうこと。開いたばかりの掲示板は広告の枠が空いていて、
// 空いた枠は売っても埋まらない。配って埋めたほうが、次に買う人の判断材料になる。
//
// **抽選は必ずサーバーで引く。** 画面で引くと、当たるまで押し直せてしまう。
// 1人1回で、引いた結果は gacha_draws に残る（同じ人が2回引けない）。

/** 当たりの中身。日数は広告の無料券としてそのまま使える。 */
export type GachaPrize = {
  key: string;
  label: string;
  /** もらえる広告の無料日数。0 は「はずれ」。 */
  days: number;
  /** 当たりやすさ。全部の合計に対する割合で決まる。 */
  weight: number;
  /** 当たったときに出す一言。 */
  note: string;
};

export const adGacha = {
  /** 引いた記録を分けるための名前。**やり直すときは必ず新しい名前にする。** */
  key: 'xmas-2026',
  name: 'クリスマス＆お正月 広告ガチャ',
  /** この期間だけ引ける（日本時間の日付、両端を含む）。空にすると止まる。 */
  from: '2026-12-20',
  until: '2027-01-07',
  /** 当たった無料券が使える期限。これを過ぎると使えない。 */
  giftExpiresOn: '2027-03-31',
  /**
   * 配る日数の上限（全員ぶんの合計）。ここに届いたら、以降は全員はずれになる。
   *
   * **上限を置かないと、会員が増えたぶんだけ際限なく枠が消える。** バナーは
   * 1日10枠なので、210日ぶんは延べ21日分の全枠にあたる。売る枠が無くなる
   * ほどではなく、空いている枠を埋めるには十分な量。
   */
  capDays: 210,
  /**
   * 当たりの中身。**7日未満は作らない。** 広告は1回7日からしか申し込めないので
   * （AD_MIN_DAYS）、それより短い券は使えないまま終わる。
   */
  prizes: [
    { key: 'banner30', label: 'バナー30日間 無料', days: 30, weight: 1,
      note: '大当たりです。1ヶ月まるごと、ホームのいちばん上に出せます。' },
    { key: 'banner14', label: 'バナー14日間 無料', days: 14, weight: 6,
      note: '当たりです。2週間、ホームのいちばん上に出せます。' },
    { key: 'banner7', label: 'バナー7日間 無料', days: 7, weight: 28,
      note: '当たりです。1週間、ホームのいちばん上に出せます。' },
    { key: 'miss', label: 'はずれ', days: 0, weight: 65,
      note: '今回はご縁がありませんでした。広告は7日2,450円から出せます。' },
  ] as GachaPrize[],
};

export function gachaPrize(key: string) {
  return adGacha.prizes.find((prize) => prize.key === key) ?? adGacha.prizes[adGacha.prizes.length - 1];
}

/**
 * いま引ける期間か。**日本時間で判定する。**
 * UTCで比べると、日本の0時〜8時59分がまだ前日として扱われ、
 * 開始日の朝に引けない・最終日の朝まで引ける、という食い違いが出る。
 */
export function gachaOpen(now = new Date()) {
  if (!adGacha.from || !adGacha.until) return false;
  const today = jstDate(now);
  return today >= adGacha.from && today <= adGacha.until;
}

export function jstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 「12月20日〜1月7日」の形。画面に出す用。 */
export function gachaPeriodLabel() {
  return `${monthDay(adGacha.from)}〜${monthDay(adGacha.until)}`;
}

export function gachaDateLabel(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日` : '';
}

function monthDay(value: string) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${Number(match[1])}月${Number(match[2])}日` : '';
}

/**
 * 重みつきの抽選。**乱数は crypto から取る。** Math.random は種を推測できる
 * 実装があり、当たりを狙って引く余地を残したくない。
 */
export function drawPrize(prizes: GachaPrize[] = adGacha.prizes): GachaPrize {
  const total = prizes.reduce((sum, prize) => sum + Math.max(0, prize.weight), 0);
  if (total <= 0) return prizes[prizes.length - 1];
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  let point = (bytes[0] / 2 ** 32) * total;
  for (const prize of prizes) {
    point -= Math.max(0, prize.weight);
    if (point < 0) return prize;
  }
  return prizes[prizes.length - 1];
}
