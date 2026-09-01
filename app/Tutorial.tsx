'use client';

import { useState } from 'react';

/**
 * 初めて来た人への案内。**5画面で、押す場所まで見せる。**
 *
 * 掲示板は「見に来ただけ」だと何も起きない。誰かが探しごとを出し、
 * 誰かがオファーを返して、はじめて回る。順番に触ってもらうために、
 * 何をすればよいかを最初に一度だけ出す。
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

type Step = { eyebrow: string; title: string; body: string; note?: string };

const steps: Step[] = [
  {
    eyebrow: 'STEP 1', title: 'プロフィールを登録する',
    body: '顔写真とお仕事の内容を登録します。誰からのオファーなのかが分かることが、安心してやり取りできる前提なので、顔写真は必須にしています。',
    note: '登録しないと、投稿とオファーができません。',
  },
  {
    eyebrow: 'STEP 2', title: '仕事の掲示板を見る',
    body: '仲間が出している「こんな人を探しています」が並びます。業種・エリア・予算・会場で絞り込めるので、自分に関係のあるものだけを見られます。',
  },
  {
    eyebrow: 'STEP 3', title: 'オファーを送る',
    body: '気になる探しごとには2通りの返し方があります。自社で請け負うなら「オファー」、知り合いをつなぐなら「リファラル」。どちらでも構いません。',
    note: 'リファラル（人をつなぐだけ）は、どのプランでも無料です。',
  },
  {
    eyebrow: 'STEP 4', title: '自分の探しごとを投稿する',
    body: '抱えている案件や、困っていることを投稿します。画面の下、まん中の「＋」から。仲間から直接オファーが届きます。',
  },
  {
    eyebrow: 'STEP 5', title: '広告で見てもらう数を増やす',
    body: '画面上部のバナーや、掲示板の上位に広告を出せます。日数分のお支払いが1回だけで、自動更新はありません。もっと多くの仲間に届けたいときに。',
  },
];

export default function Tutorial({ onClose, onFinish }: { onClose: () => void; onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;

  function close() { markTutorialSeen(); onClose(); }

  return <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    <section className="tutorial">
      <div className="tutorial-top">
        <span className="tutorial-count">{index + 1} / {steps.length}</span>
        {/* いつでも閉じられるようにする。読ませきる作りにはしない。 */}
        <button className="tutorial-skip" onClick={close}>閉じる</button>
      </div>

      <p className="tutorial-eyebrow">{step.eyebrow}</p>
      <h2 id="tutorial-title">{step.title}</h2>
      <p className="tutorial-body">{step.body}</p>
      {step.note && <p className="tutorial-note">{step.note}</p>}

      <div className="tutorial-dots" aria-hidden="true">
        {steps.map((entry, position) => <i key={entry.title} className={position === index ? 'on' : ''} />)}
      </div>

      <div className="tutorial-actions">
        {index > 0 && <button className="tutorial-back" onClick={() => setIndex(index - 1)}>戻る</button>}
        <button className="tutorial-next" onClick={() => last ? (markTutorialSeen(), onFinish()) : setIndex(index + 1)}>
          {last ? 'プロフィールを登録する' : '次へ'}
        </button>
      </div>
    </section>
  </div>;
}
