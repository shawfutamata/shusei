// 広告枠のガチャ。**1日1回のログインボーナス**として置いてある。
//
// ねらいは2つ。**毎日ここを開く理由を作ること**と、**掲示板の上を埋めること**。
// 開いたばかりの掲示板は広告の枠が空いていて、空いた枠は売っても埋まらない。
// 誰も出していないところに最初に出すのは決心が要るので、配って埋めてしまえば、
// 次に買う人は「こう出るのか」を見てから決められる。
//
// **抽選は必ずサーバーで引く**（db/data.ts の drawGacha）。画面で引くと、
// 当たるまで押し直せてしまう。1人1日1回で、引いた記録は gacha_days に残る。
//
// 当たりは**小さい券を積み上げる**形にしてある。広告は7日からしか申し込めない
// （AD_MIN_DAYS）ので、1日券だけでも7日ためれば1週間まるごと無料で出せる。
// 毎日ちょっとずつ増えるほうが、毎日開く理由になる。

/** 当たりの中身。日数は広告の無料券としてそのまま積み上がる。 */
export type GachaPrize = {
  key: string;
  /** 結果の名前。おみくじなら「大吉」など。 */
  label: string;
  /** もらえる広告の無料日数。0 は「はずれ」。 */
  days: number;
  /** 当たりやすさ。同じ回の合計に対する割合で決まる。 */
  weight: number;
  /** 結果と一緒に出す一言。 */
  note: string;
};

/** 見た目の切り替え。中身（確率と日数）は同じで、包み紙だけ変える。 */
export type GachaTheme = 'xmas' | 'newyear';

export type GachaSeason = {
  key: string;
  name: string;
  /** 日本時間の日付。両端を含む。 */
  from: string;
  until: string;
  theme: GachaTheme;
  /** 引くボタンの文言。 */
  action: string;
  /** 箱に出す絵。 */
  emoji: string;
  lead: string;
  prizes: GachaPrize[];
};

export const adGacha = {
  /** 記録を分けるための名前。**やり直すときは必ず新しい名前にする。** */
  key: 'winter-2026',
  name: '毎日ガチャ',
  /** 当たった無料券が使える期限。これを過ぎると使えない。 */
  giftExpiresOn: '2027-03-31',
  /**
   * **1人がもらえる日数の上限。** 7日ためれば広告を1週間まるごと出せる。
   *
   * 毎日引ける以上、上限が無いと1人で何十日ぶんも持っていってしまう。
   * 上限に届いたあとも引けるが、券は増えない（結果だけ出る）。
   */
  memberCapDays: 7,
  /**
   * 全員ぶんを合わせた上限。ここに届いたら、以降は誰が引いても券は出ない。
   *
   * バナーは1日10枠。400日は延べ40日分の全枠にあたる。券の期限（3月末）まで
   * 90日あって900枠日ぶんあるので、売る枠が無くなるほどではない。
   */
  capDays: 400,
  seasons: [
    {
      key: 'xmas',
      name: 'クリスマスガチャ',
      from: '2026-12-20',
      until: '2026-12-25',
      theme: 'xmas' as GachaTheme,
      action: 'プレゼントを開ける',
      emoji: '🎁',
      lead: '毎日1回、広告の無料券が当たります。',
      prizes: [
        { key: 'x3', label: '大きなプレゼント', days: 3, weight: 8,
          note: '広告の無料券が3日分。' },
        { key: 'x1', label: 'プレゼント', days: 1, weight: 37,
          note: '広告の無料券が1日分。7日ためると1週間まるごと出せます。' },
        { key: 'x0', label: 'くつ下は空っぽ', days: 0, weight: 55,
          note: '今日は何も入っていませんでした。また明日どうぞ。' },
      ],
    },
    {
      key: 'newyear',
      name: 'お正月おみくじ',
      from: '2026-12-26',
      until: '2027-01-07',
      theme: 'newyear' as GachaTheme,
      action: 'おみくじを引く',
      emoji: '🎍',
      lead: '毎日1回、運だめし。大吉なら広告の無料券が3日分。',
      prizes: [
        { key: 'n-daikichi', label: '大吉', days: 3, weight: 8,
          note: '広告の無料券が3日分。よい年になりますように。' },
        { key: 'n-chukichi', label: '中吉', days: 1, weight: 20,
          note: '広告の無料券が1日分。7日ためると1週間まるごと出せます。' },
        { key: 'n-shokichi', label: '小吉', days: 1, weight: 17,
          note: '広告の無料券が1日分。こつこついきましょう。' },
        { key: 'n-kichi', label: '吉', days: 0, weight: 30,
          note: '悪くない一日になりそうです。また明日どうぞ。' },
        { key: 'n-suekichi', label: '末吉', days: 0, weight: 25,
          note: 'あとになるほど良くなります。また明日どうぞ。' },
      ],
    },
  ] as GachaSeason[],
};

/** その日に開いている回。期間の外なら null。 */
export function gachaSeason(now = new Date()): GachaSeason | null {
  const today = jstDate(now);
  return adGacha.seasons.find((season) => today >= season.from && today <= season.until) ?? null;
}

export function gachaOpen(now = new Date()) {
  return gachaSeason(now) !== null;
}

/** すべての回を通した期間。案内文に使う。 */
export function gachaWholePeriod() {
  const from = adGacha.seasons.map((season) => season.from).sort()[0] ?? '';
  const until = adGacha.seasons.map((season) => season.until).sort().pop() ?? '';
  return { from, until, label: `${monthDay(from)}〜${monthDay(until)}` };
}

export function findPrize(prizeKey: string) {
  for (const season of adGacha.seasons) {
    const prize = season.prizes.find((item) => item.key === prizeKey);
    if (prize) return prize;
  }
  return null;
}

/** 日本時間の「今日」。UTCで比べると、日本の0時〜8時59分が前日扱いになる。 */
export function jstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** その日の前日。連続日数を数えるのに使う。 */
export function previousDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
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
export function drawPrize(prizes: GachaPrize[]): GachaPrize {
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

/**
 * 券が出せないときに返す「はずれ」。上限に届いたときに使う。
 * **その回の見た目に合わせた名前を返す**（おみくじの日に「くつ下」と出さない）。
 */
export function consolationPrize(season: GachaSeason) {
  const zero = season.prizes.filter((prize) => prize.days === 0);
  return zero[zero.length - 1] ?? season.prizes[season.prizes.length - 1];
}
