'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 初めて来た人への案内。**実際の画面の、押す場所そのものを指す。**
 *
 * 文章だけの案内にすると、読み終わってから「で、どこ？」になる。
 * まわりを暗くして、押してほしいところだけを明るく残し、矢印で指す。
 *
 * 押す場所は「見つかったものを使う」。画面の作りが変わって目印が
 * 消えても、案内が壊れて出せなくなるより、真ん中に出すほうがよい。
 *
 * 出したかどうかは端末側（localStorage）に持つ。会員の情報ではないし、
 * 保存できない設定の端末でも、毎回出るだけで壊れないため。
 */
export const TUTORIAL_KEY = 'tasuki:tutorial:v1';

export function tutorialSeen() {
  try { return window.localStorage.getItem(TUTORIAL_KEY) === 'done'; } catch { return false; }
}

export function markTutorialSeen() {
  try { window.localStorage.setItem(TUTORIAL_KEY, 'done'); } catch { /* 保存できなくても案内は出せる */ }
}

type Step = {
  eyebrow: string;
  title: string;
  body: string;
  /** 指したい場所。**先に見つかったものを使う。** 上から順に試す。 */
  targets: string[];
  /** 明るく残した場所に添える一言。 */
  click: string;
};

const steps: Step[] = [
  {
    eyebrow: 'STEP 1', title: 'プロフィールを登録する',
    body: '顔写真とお仕事の内容を登録します。誰からのオファーか分かることが前提なので、顔写真は必須です。',
    targets: ['.header-profile'], click: 'ここをタップ',
  },
  {
    eyebrow: 'STEP 2', title: '仕事の掲示板を見る',
    body: '仲間の「こんな人を探しています」が並びます。業種・エリア・予算で絞り込めます。',
    targets: ['.bottom-nav .nav-search'], click: 'ここをタップ',
  },
  {
    eyebrow: 'STEP 3', title: 'オファーを送る',
    body: '自社で請け負うなら「オファー」、知り合いをつなぐなら「リファラル」。リファラルは無料です。',
    targets: ['.home-shelf .home-request-card', '.home-shelf', '.bottom-nav .nav-search'],
    click: 'カードを開くと選べます',
  },
  {
    eyebrow: 'STEP 4', title: '自分の案件を投稿する',
    body: '抱えている案件や困りごとを投稿すると、関連する業種の仲間に届きます。',
    targets: ['.bottom-nav .nav-post'], click: 'ここをタップ',
  },
  {
    eyebrow: 'STEP 5', title: '広告で見てもらう数を増やす',
    body: '画面上部のバナーや掲示板の上位に出せます。掲載日数分の1回払いで、自動更新はありません。',
    targets: ['.bottom-nav .nav-ads'], click: 'ここをタップ',
  },
];

type Spot = { top: number; left: number; width: number; height: number };

const PAD = 8;
/** 目印と案内のあいだ。ここに矢印を置くので、指1本ぶんは空ける。 */
const GAP = 26;
/**
 * 案内の高さの下限の見込み。**実際の高さは描いてから測る。**
 * 決め打ちにすると、文章の長さや端末の文字サイズで「次へ」がはみ出す。
 */
const MIN_CARD = 210;

/**
 * **いま実際に見えている範囲。**
 *
 * iOS Safari の `window.innerHeight` は、上下のバーを隠したときの高さを返す。
 * 実際に見えているのはそれより低いので、この値で置き場所を決めると、
 * 案内が下のメニューに覆いかぶさる（画面の外に押し出す）。
 * `visualViewport` は、いまバーが出ている状態の高さを返す。
 *
 * 位置は `position:fixed` と同じ座標で扱う。`top` は、その中で
 * 「見えている範囲の上端が、どこから始まるか」。
 */
function visibleBand() {
  if (typeof window === 'undefined') return { top: 0, bottom: 0, height: 0 };
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const height = vv ? vv.height : window.innerHeight;
  return { top, bottom: top + height, height };
}

export default function Tutorial({ onClose, onFinish }: { onClose: () => void; onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [band, setBand] = useState(() => visibleBand());
  /** 案内の中身が必要とする高さ。描いてから測って、次の計算に使う。 */
  const [needed, setNeeded] = useState(MIN_CARD);
  const cardRef = useRef<HTMLElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const locate = useCallback(() => {
    for (const selector of steps[index].targets) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      setSpot({ top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 });
      return;
    }
    // 見つからなければ指さない。案内そのものは出す。
    setSpot(null);
  }, [index]);

  const measure = useCallback(() => { setBand(visibleBand()); locate(); }, [locate]);

  // 「次へ」まで入る高さを、描かれたものから測る。文章の長さも文字サイズも
  // 端末で変わるので、決め打ちの数字では足りたり足りなかったりする。
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    // 本文だけは縮む（中でスクロールする）。それ以外は縮まない。
    // 「本文をゼロにしたときの高さ」＝ 中身の高さ − いまの本文の高さ。
    const body = card.querySelector('.tut-body');
    const want = Math.ceil(card.scrollHeight - (body ? body.clientHeight : 0)) + 4;
    if (Math.abs(want - needed) > 2) setNeeded(want);
  });

  useEffect(() => {
    // 目印を画面の上のほうへ寄せる。**下に案内の場所を作るため。**
    // 画面に貼りついているもの（下のメニューなど）は動かないので、そのまま。
    for (const selector of steps[index].targets) {
      const el = document.querySelector(selector);
      if (!el) continue;
      if (getComputedStyle(el).position !== 'fixed') {
        const wanted = visibleBand().top + 16;
        const shift = el.getBoundingClientRect().top - wanted;
        if (Math.abs(shift) > 8) window.scrollBy({ top: shift, behavior: 'auto' });
      }
      break;
    }
    const timer = window.setTimeout(measure, 260);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // バーの出入りで見える高さが変わる。そのたびに置き直す。
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [index, measure]);

  function close() { markTutorialSeen(); onClose(); }

  // 案内は、目印の**空いているほう**に置く。空きは「見えている範囲」で測る。
  // 置ける高さも渡して、あふれる分は案内の中でスクロールさせる。
  const view = typeof window === 'undefined' ? 0 : window.innerHeight;
  const spaceBelow = spot ? band.bottom - (spot.top + spot.height) - GAP : 0;
  const spaceAbove = spot ? spot.top - band.top - GAP : 0;
  const below = Boolean(spot) && spaceBelow >= spaceAbove;
  const room = Math.max(spaceBelow, spaceAbove) - 14;
  // 矢印は目印の真ん中を指す。案内は画面の中央に出るので、そのままだと
  // 端にある目印（右上のプロフィールなど）に対して見当違いの所を指す。
  const wide = typeof window === 'undefined' ? 0 : window.innerWidth;
  const cardWidth = Math.min(wide - 32, 420);
  const cardLeft = (wide - cardWidth) / 2;
  const arrowX = spot ? Math.min(Math.max(spot.left + spot.width / 2 - cardLeft, 22), cardWidth - 22) : cardWidth / 2;
  // 空きが「次へ」の入る高さに足りないときは、画面の端に寄せて高さを確保する。
  // 目印に少しかかっても、ボタンが見えないよりはよい。
  const tight = room < needed;
  const height = Math.min(Math.max(room, needed), band.height - 24);
  const arrowVar = { ['--arrow-x' as string]: `${arrowX}px` };
  const cardStyle: React.CSSProperties = !spot
    ? { top: band.top + 16, maxHeight: band.height - 32 }
    : tight
      ? { top: below ? band.bottom - 12 - height : band.top + 12, maxHeight: height, ...arrowVar }
      : below
        ? { top: spot.top + spot.height + GAP, maxHeight: room, ...arrowVar }
        // fixed の bottom は「画面の下端から」。見えている範囲の下端ではないので、
        // 隠れている帯（Safariの下のバー）のぶんは足さない。目印の上に置くだけ。
        : { bottom: view - spot.top + GAP, maxHeight: room, ...arrowVar };

  return <div className="tut-layer" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    {spot
      ? <>
          <div className="tut-hole" style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }} />
          {/* 目印と案内のあいだに矢印。目印そのものを指す。 */}
          <span className="tut-arrow" aria-hidden="true"
            style={below
              ? { top: spot.top + spot.height + 2, left: spot.left + spot.width / 2 }
              : { top: spot.top - 24, left: spot.left + spot.width / 2 }}>
            {below ? '↑' : '↓'}
          </span>
        </>
      : <div className="tut-dim" />}

    <section ref={cardRef} className={`tut-card${spot ? (below ? ' points-up' : ' points-down') : ' is-center'}`} style={cardStyle}>
      <div className="tut-top">
        <span className="tut-count">{index + 1} / {steps.length}</span>
        {/* いつでも閉じられるようにする。読ませきる作りにはしない。 */}
        <button className="tut-skip" onClick={close}>閉じる</button>
      </div>
      <p className="tut-eyebrow">{step.eyebrow}</p>
      <h2 id="tutorial-title">{step.title}</h2>
      <p className="tut-body">{step.body}</p>
      {/* 明るく残したところを指す。矢印は、案内から目印へ向く向きに合わせる。 */}
      {spot && <p className="tut-hint"><i aria-hidden="true">{below ? '↑' : '↓'}</i>{step.click}</p>}
      <div className="tut-dots" aria-hidden="true">
        {steps.map((entry, position) => <i key={entry.title} className={position === index ? 'on' : ''} />)}
      </div>
      <div className="tut-actions">
        {index > 0 && <button className="tut-back" onClick={() => setIndex(index - 1)}>戻る</button>}
        <button className="tut-next" onClick={() => last ? (markTutorialSeen(), onFinish()) : setIndex(index + 1)}>
          {last ? 'プロフィールを登録する' : '次へ'}
        </button>
      </div>
    </section>
  </div>;
}
