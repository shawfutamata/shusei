// 広告枠のガチャ。**1日1回のログインボーナス**として、いつでも引ける。
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
  /**
   * 賞の等級。「A賞」「B賞」など。**はずれは空にする。**
   * 何が当たったかは `label` と `days` で言うので、ここは順位だけを表す。
   */
  tier: string;
  /** 結果の名前。おみくじなら「大吉」など。 */
  label: string;
  /**
   * ルーレットの盤に書く**短い名前**。コマは12分の1しか幅がないので、
   * **4文字まで**にすること。長い名前を入れると盤の外にはみ出す。
   *
   * `label` と別に持っているのは、盤とお知らせで書き分けたいから。
   * おみくじの日は盤に「大吉」と出したいが、クリスマスの
   * 「くつ下は空っぽ」はそのままでは入らない。
   */
  short: string;
  /** もらえる広告の無料日数。0 は「はずれ」。 */
  days: number;
  /**
   * ルーレット盤の**コマ数**。そのまま当たりやすさになる。
   *
   * **見えている通りの確率にする**ためにコマ数と重みを1つにまとめてある。
   * 別々に持つと、盤面は「12分の1」なのに実際は8%、のように食い違う。
   */
  slots: number;
  /**
   * 結果と一緒に出す一言。
   *
   * **賞の名前をもう一度書かない。** 結果の見出しに「A賞 広告の無料券 3日分」と
   * 出ていて、その下の券にも日数が出ている。同じことを3回書くと、どれが結果で
   * どれがお知らせなのか分からなくなる。名前だけでは中身が分からない回
   * （おみくじの「大吉」など）だけ、ここで日数を言う。
   */
  note: string;
};

/** 見た目の切り替え。中身（確率と日数）は同じで、包み紙だけ変える。 */
export type GachaTheme = 'plain' | 'xmas' | 'newyear';

export type GachaSeason = {
  key: string;
  name: string;
  /**
   * 日本時間の日付。両端を含む。**空にすると「いつでも」。**
   * ふだんの回を空にして、季節の回だけ日付を入れる。
   */
  from: string;
  until: string;
  theme: GachaTheme;
  /** 引くボタンの文言。 */
  action: string;
  /**
   * 回すときの演出。
   * - `wheel` … ルーレット盤。押すと回り出し、STOPで止まる
   * - `video` … 動画を流す（`video` に入れたもの）
   */
  motion: 'wheel' | 'video';
  /**
   * ホームに置く**横長のバナー画像**（1200×400／3:1）。
   * 置いていなければ、色と文字だけの帯になる（そのままでも成り立つ）。
   */
  image: string;
  /**
   * 引くところに出す**ガチャ本体の絵**（縦長）。動画の1枚目にもなる。
   * 置いていなければ、絵は出ない（賞の一覧と引くボタンだけ）。
   */
  machine: string;
  /**
   * 回すときに流す**動画**（縦長・音なし）。押してから流し、終わったところで
   * 結果を出す。空にすると、絵のまま左右に揺れる。**どちらでも成り立つ。**
   *
   * **必ず H.264（avc1）の mp4 にすること。** webm や、H.264以外を包んだ
   * mp4 は iPhone の Safari で再生できず、絵に落ちる。会員のほとんどが
   * iPhone なので、そこで動かないものを既定にしない。
   */
  video: string;
  /**
   * **はずれのときに動画を止める秒数。**
   *
   * 動画は最後に「当たり」の札が出るところまで入っている。はずれた人に
   * それを見せてから「はずれ」と言うのは裏切りなので、**まだ何も出ていない
   * ところ（ハンドルを回し終わったあたり）で止める。**
   *
   * 実測では、止めたい秒数より0.2〜0.3秒ほど過ぎてから止まる（`timeupdate`
   * が0.25秒おきにしか来ないため）。**その分を引いた値を入れること。**
   * いまの動画では金のカプセルが2.5秒で出るので、2.1秒にしてある。
   *
   * 0 にすると、はずれでも最後まで流す。
   */
  videoStopAt: number;
  lead: string;
  prizes: GachaPrize[];
};

export const adGacha = {
  /** 記録に残す名前。集計を分けるためのもので、引ける条件には関わらない。 */
  key: 'daily',
  name: '毎日ガチャ',
  /**
   * 当たった券が使える日数。**当たった日から数える。**
   * 終わりの決まっていない催しなので、決め打ちの日付は置かない。
   */
  giftValidDays: 90,
  /**
   * **上限は「月ごと」に置く。** 終わりの無い催しなので、通算で上限を置くと、
   * 一度届いた人はそのあとずっと何ももらえなくなり、毎日引く意味が消える。
   * 毎月1日（日本時間）に戻る。
   *
   * - 1人 … 月7日分まで。7日ためれば広告を1週間まるごと出せる
   * - 全員 … 月100日分まで。バナーは1日10枠なので、月300枠日のうち3分の1
   */
  memberCapDaysPerMonth: 7,
  capDaysPerMonth: 100,
  /**
   * 引ける回。**上から順に見て、最初に当てはまったものを使う。**
   * 日付を入れていない回（ふだんの回）は必ずいちばん下に置くこと。
   */
  seasons: [
    {
      key: 'xmas',
      name: 'クリスマスガチャ',
      from: '2026-12-20',
      until: '2026-12-25',
      theme: 'xmas' as GachaTheme,
      action: 'プレゼントを開ける',
      motion: 'wheel' as const,
      image: '/gacha/xmas.webp',
      machine: '/gacha/machine.webp',
      video: '/gacha/win.mp4',
      videoStopAt: 2.1,
      lead: '毎日1回、広告の無料券が当たります。',
      prizes: [
        { key: 'x3', tier: 'A賞', label: '大きなプレゼント', short: 'A賞', days: 3, slots: 1,
          note: '大きな箱が当たりました。' },
        { key: 'x1', tier: 'B賞', label: 'プレゼント', short: 'B賞', days: 1, slots: 4,
          note: '箱の中に無料券が入っていました。' },
        { key: 'x0', tier: '', label: 'くつ下は空っぽ', short: '空っぽ', days: 0, slots: 7,
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
      motion: 'wheel' as const,
      image: '/gacha/newyear.webp',
      machine: '/gacha/machine.webp',
      video: '/gacha/win.mp4',
      videoStopAt: 2.1,
      lead: '毎日1回、運だめし。大吉なら広告の無料券が3日分。',
      prizes: [
        { key: 'n-daikichi', tier: 'A賞', label: '大吉', short: '大吉', days: 3, slots: 1,
          note: '広告の無料券が3日分。よい年になりますように。' },
        { key: 'n-chukichi', tier: 'B賞', label: '中吉', short: '中吉', days: 1, slots: 2,
          note: '広告の無料券が1日分。7日ためると1週間まるごと出せます。' },
        { key: 'n-shokichi', tier: 'B賞', label: '小吉', short: '小吉', days: 1, slots: 2,
          note: '広告の無料券が1日分。こつこついきましょう。' },
        { key: 'n-kichi', tier: '', label: '吉', short: '吉', days: 0, slots: 4,
          note: '悪くない一日になりそうです。また明日どうぞ。' },
        { key: 'n-suekichi', tier: '', label: '末吉', short: '末吉', days: 0, slots: 3,
          note: 'あとになるほど良くなります。また明日どうぞ。' },
      ],
    },
    {
      key: 'daily',
      name: '毎日ガチャ',
      // 日付なし＝いつでも。**必ずいちばん下に置く。**
      from: '',
      until: '',
      theme: 'plain' as GachaTheme,
      action: '今日のガチャを引く',
      motion: 'wheel' as const,
      image: '/gacha/daily.webp',
      machine: '/gacha/machine.webp',
      video: '/gacha/win.mp4',
      videoStopAt: 2.1,
      lead: '毎日1回、広告の無料券が当たります。',
      prizes: [
        { key: 'd3', tier: 'A賞', label: '広告の無料券 3日分', short: 'A賞', days: 3, slots: 1,
          note: 'いちばん大きい当たりです。' },
        { key: 'd1', tier: 'B賞', label: '広告の無料券 1日分', short: 'B賞', days: 1, slots: 4,
          note: 'こつこつためていきましょう。' },
        { key: 'd0', tier: '', label: 'はずれ', short: 'はずれ', days: 0, slots: 7,
          note: '今日はご縁がありませんでした。また明日どうぞ。' },
      ],
    },
  ] as GachaSeason[],
};

/**
 * その日の回。**上から順に見て、最初に当てはまったものを使う。**
 * 日付の入っていない回（ふだんの回）が最後にあるので、ふつうは null にならない。
 */
export function gachaSeason(now = new Date()): GachaSeason | null {
  const today = jstDate(now);
  return adGacha.seasons.find((season) =>
    (!season.from || today >= season.from) && (!season.until || today <= season.until)) ?? null;
}

export function gachaOpen(now = new Date()) {
  return gachaSeason(now) !== null;
}

/** 次の季節の回。「12月20日からクリスマス」と先に知らせるのに使う。 */
export function nextSeason(now = new Date()) {
  const today = jstDate(now);
  return adGacha.seasons
    .filter((season) => season.from && season.from > today)
    .sort((a, b) => a.from.localeCompare(b.from))[0] ?? null;
}

/** 「12月20日」の形。画面に出す用。 */
export function gachaMonthDay(value: string) {
  return monthDay(value);
}

/** 当たった日から数えた券の期限。 */
export function giftExpiryFrom(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + adGacha.giftValidDays);
  return date.toISOString().slice(0, 10);
}

/** その月の始まり（日本時間の YYYY-MM）。上限を数える単位。 */
export function jstMonth(now = new Date()) {
  return jstDate(now).slice(0, 7);
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
 * ルーレット盤のコマの並び。**上（12時）から時計回りに1周ぶん。**
 *
 * コマ数はそのまま `slots` を使う。**盤に見えている数がそのまま確率**に
 * なるようにしてあり、「12分の1に見えるのに実際は8%」という食い違いが
 * 起きない。
 *
 * 並べ方は**同じ賞が隣り合わないように散らす**。当たりのコマを固めて置くと、
 * 止まる場所が偏って見えて、回す前から結果が読めてしまう。
 *
 * **毎回同じ並びを返す**（乱数を使わない）。サーバーが作ったHTMLと画面側で
 * 並びが変わると、Reactが画面を丸ごと作り直す。
 */
export function wheelSegments(season: GachaSeason): string[] {
  const prizes = season.prizes.filter((prize) => prize.slots > 0);
  const total = prizes.reduce((sum, prize) => sum + prize.slots, 0);
  if (total <= 0) return [];
  // 置いたコマ数が「持ちぶん」からいちばん遅れている賞を、1つずつ置いていく。
  // 選挙の議席配分と同じやり方で、多い賞ほど間隔が空いて散らばる。
  const placed = prizes.map(() => 0);
  const out: string[] = [];
  for (let index = 0; index < total; index += 1) {
    let best = 0;
    let behind = -Infinity;
    prizes.forEach((prize, at) => {
      const owed = ((index + 1) * prize.slots) / total - placed[at];
      if (owed > behind + 1e-9) { behind = owed; best = at; }
    });
    out.push(prizes[best].key);
    placed[best] += 1;
  }
  return out;
}

/**
 * 重みつきの抽選。**乱数は crypto から取る。** Math.random は種を推測できる
 * 実装があり、当たりを狙って引く余地を残したくない。
 */
export function drawPrize(prizes: GachaPrize[]): GachaPrize {
  const total = prizes.reduce((sum, prize) => sum + Math.max(0, prize.slots), 0);
  if (total <= 0) return prizes[prizes.length - 1];
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  let point = (bytes[0] / 2 ** 32) * total;
  for (const prize of prizes) {
    point -= Math.max(0, prize.slots);
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
