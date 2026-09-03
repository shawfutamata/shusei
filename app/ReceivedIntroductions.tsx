'use client';
/* eslint-disable @next/next/no-img-element -- 顔写真はアプリ自身が配信している */

import { useEffect, useMemo, useState } from 'react';
import type { ReceivedIntroduction, SentIntroduction } from '@/db/data';
import FacebookLink from './FacebookLink';
import IntroductionChat from './IntroductionChat';

const categoryLabels = { project: '発注先', collaboration: '協業先', consultation: '相談・情報', ad: '広告' };
/** 紹介なのか、自分の会社で請け負うのか。受け取る側にはここが真っ先に要る。 */
const kindLabels = { referral: 'リファラル（知り合いの紹介）', self: 'オファー（自社で請け負う）' };

/**
 * オファーの受け箱。**届いた／出した**の両方を出す。
 *
 * やり取りは2人でするものなので、オファーした側にも入口が要る。届いたぶんだけ
 * だと、送った人は自分が出したオファーを見返すことも、返事を読むこともできない。
 */
export default function ReceivedIntroductions({ onUpgrade }: { onUpgrade?: () => void } = {}) {
  const [received, setReceived] = useState<ReceivedIntroduction[]>([]);
  const [sent, setSent] = useState<SentIntroduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState<'received' | 'sent'>('received');
  const [expanded, setExpanded] = useState<string>('');

  useEffect(() => {
    let active = true;
    fetch('/api/introductions').then((response) => response.ok ? response.json() : null).then((data) => {
      if (!active || !data) return setLoading(false);
      const payload = data as { introductions: ReceivedIntroduction[]; sent: SentIntroduction[] };
      setReceived(payload.introductions ?? []);
      setSent(payload.sent ?? []);
      // 届いた紹介が無い人には、出した紹介から見せる。空の画面を出さないため。
      if (!payload.introductions?.length && payload.sent?.length) setSide('sent');
      setExpanded(payload.introductions?.[0]?.id ?? payload.sent?.[0]?.id ?? '');
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => Object.values(received.reduce<Record<string, { requestId: string; title: string; category: ReceivedIntroduction['requestCategory']; source: ReceivedIntroduction['source']; items: ReceivedIntroduction[] }>>((result, item) => {
    const group = result[item.requestId] ?? { requestId: item.requestId, title: item.requestTitle, category: item.requestCategory, source: item.source, items: [] };
    group.items.push(item); result[item.requestId] = group; return result;
  }, {})), [received]);

  const lockedCount = received.filter((item) => item.locked).length;

  if (loading) return <div className="received-loading">オファーを読み込んでいます…</div>;
  if (!received.length && !sent.length) {
    return <div className="received-empty"><span>✉</span><b>オファーはまだありません</b>
      <p>あなたの案件にオファーが届くと、ここで内容を確認して、送ってくれた方とやり取りできます。</p></div>;
  }

  return <div className="received-inbox">
    {/* 受け取る側は青、自分から出す側は橙。アプリの中で「自分が出す」は
        ずっと橙（下の＋ボタン）なので、それに合わせている。
        色だけに頼らないよう、矢印（↓届く／↑出す）も添える。 */}
    <div className="received-tabs" role="group" aria-label="オファーの向き">
      <button className={`is-in${side === 'received' ? ' selected' : ''}`} onClick={() => setSide('received')}
        aria-pressed={side === 'received'}><i aria-hidden="true">↓</i>届いたオファー <span>{received.length}</span></button>
      <button className={`is-out${side === 'sent' ? ' selected' : ''}`} onClick={() => setSide('sent')}
        aria-pressed={side === 'sent'}><i aria-hidden="true">↑</i>出したオファー <span>{sent.length}</span></button>
    </div>

    {side === 'received' ? (!received.length
      ? <div className="received-empty"><span>✉</span><b>届いたオファーはまだありません</b>
        <p>あなたの案件にオファーが届くと、ここに並びます。</p></div>
      : <>
        <div className={`received-summary${lockedCount ? ' is-locked' : ''}`}>
          <span><b>{received.length}</b><small>届いたオファー</small></span>
          {lockedCount
            ? <p>スタンダードプランにすると、<b>オファーを受け取ることができます</b>。</p>
            : <p>オファーされた人と、送ってくれた方からのメッセージを確認できます。そのままやり取りもできます。</p>}
          {lockedCount ? <button className="received-upgrade" onClick={onUpgrade}>プランを見る</button> : null}
        </div>
        {groups.map((group) => <section className="received-group" key={group.requestId}>
          <header><span>{categoryLabels[group.category]}</span>
            <div><small>{group.source === 'ad' ? 'あなたの広告' : 'あなたの案件'}</small><h3>{group.title}</h3></div>
            <b>{group.items.length}件</b></header>
          <div className="received-list">{group.items.map((item) => <article className={`received-card${item.locked ? ' is-locked' : ''}`} key={item.id}>
            {/* 中身を渡していないぶんは、名前の代わりに種類と日付だけ出す。
                「何件、いつ、どんな種類で届いたか」までは見せて、そこから先を
                プランの値打ちにしている。名前と理由はサーバーが空にして送る。 */}
            <button className="received-card-head" onClick={() => setExpanded((current) => current === item.id ? '' : item.id)}>
              <div className="received-person-mark">{item.locked ? <LockMark /> : item.kind === 'self' ? '社' : '人'}</div>
              <div><small>{formatDate(item.createdAt)}に届きました{item.locked && <em className="locked-tag">ロック中</em>}</small>
                <h4>{item.locked ? 'オファーが届いています' : item.personName}</h4>
                <p>{item.locked ? kindLabels[item.kind] : item.personCompany}</p></div>
              <i>{expanded === item.id ? '−' : '＋'}</i>
            </button>
            {expanded === item.id && (item.locked ? <div className="received-detail received-locked">
              {/* ぼかしているのは**中身ではなく形だけ**。サーバーは名前も理由も
                  送っていないので、ここには本物の文字は無い。オファー1件ごとに
                  同じ形になるよう、IDから行の長さを決めている。 */}
              <div className="locked-peek" aria-hidden="true">
                <span className="locked-peek-avatar" />
                <div>{peekRows(item.id).map((row, index) => <i key={index} style={{ width: `${row}%` }} />)}</div>
              </div>
              <p className="locked-lead"><LockMark /><b>いまのプランでは、この中身を開けません。</b></p>
              <p>どなたが、どんな理由でオファーしてくださったのか。スタンダードプランにすると読めて、そのまま返事もできます。</p>
              <button className="received-upgrade" onClick={onUpgrade}>プランを見る</button>
            </div> : <div className="received-detail">
              <dl>
                <div><dt>オファーの種類</dt><dd>{kindLabels[item.kind]}</dd></div>
                <div><dt>オファーした方との関係</dt><dd>{item.relationship}</dd></div>
                <div><dt>オファーしたい理由</dt><dd>{item.fitReason}</dd></div>
              </dl>
              <div className="received-from">
                {item.introducerAvatarUrl
                  ? <img src={item.introducerAvatarUrl} alt={`${item.introducerName}さんの顔写真`} />
                  : <span>{item.introducerName.slice(0, 1)}</span>}
                <p><small>オファーをくれた会員</small><b>{item.introducerName}</b>
                  <em>{item.introducerCompany || '会社名未設定'} · {item.introducerVenue}</em>
                  <FacebookLink url={item.introducerFacebookUrl} name={item.introducerName} /></p>
              </div>
              <IntroductionChat introductionId={item.id} partnerName={item.introducerName} />
            </div>)}
          </article>)}</div>
        </section>)}
      </>
    ) : (!sent.length
      ? <div className="received-empty"><span>✉</span><b>出したオファーはまだありません</b>
        <p>掲示板で案件を見つけてオファーすると、ここに残ります。</p></div>
      : <>
        <div className="received-summary is-out">
          <span><b>{sent.length}</b><small>出したオファー</small></span>
          <p>あなたがオファーした内容と、相手からの返事です。</p>
        </div>
        <div className="received-list">{sent.map((item) => <article className="received-card" key={item.id}>
          <button className="received-card-head" onClick={() => setExpanded((current) => current === item.id ? '' : item.id)}>
            <div className="received-person-mark">{item.kind === 'self' ? '社' : '人'}</div>
            <div><small>{formatDate(item.createdAt)}にオファーしました</small><h4>{item.personName}</h4>
              <p>{item.requestTitle}</p></div>
            <i>{expanded === item.id ? '−' : `＋${item.messageCount ? ` ${item.messageCount}` : ''}`}</i>
          </button>
          {expanded === item.id && <div className="received-detail">
            <dl>
              <div><dt>オファーの種類</dt><dd>{kindLabels[item.kind]}</dd></div>
              <div><dt>あなたとの関係</dt><dd>{item.relationship}</dd></div>
              <div><dt>オファーした理由</dt><dd>{item.fitReason}</dd></div>
            </dl>
            <div className="received-from">
              {item.authorAvatarUrl
                ? <img src={item.authorAvatarUrl} alt={`${item.authorName}さんの顔写真`} />
                : <span>{item.authorName.slice(0, 1)}</span>}
              <p><small>探していた会員</small><b>{item.authorName}</b>
                <em>{item.authorCompany || '会社名未設定'}</em>
                <FacebookLink url={item.authorFacebookUrl} name={item.authorName} /></p>
            </div>
            <IntroductionChat introductionId={item.id} partnerName={item.authorName} />
          </div>}
        </article>)}</div>
      </>
    )}
  </div>;
}

/**
 * ぼかして見せる行の長さ（%）。
 *
 * **本物の文字はここに無い。** サーバーは中身を送っていないので、
 * ぼかす対象そのものが存在しない。それらしく見せるためだけの棒を、
 * オファーのIDから決めている。同じオファーなら毎回同じ形になるので、
 * 開くたびに形が変わって「作り物」だと分かってしまうことがない。
 */
function peekRows(id: string) {
  let seed = 0;
  for (const char of id) seed = (seed * 31 + char.charCodeAt(0)) % 100000;
  return [0, 1, 2, 3, 4].map((index) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    // 1行目（名前）は短く、あとは本文らしい長さに。最後の行は短く切る。
    if (index === 0) return 38 + (seed % 22);
    if (index === 4) return 30 + (seed % 30);
    return 74 + (seed % 26);
  });
}

function LockMark() {
  return <svg className="lock-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 10V7.5a5 5 0 0 1 10 0V10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <rect x="4.5" y="10" width="15" height="10.5" rx="2.6" fill="currentColor" />
  </svg>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}
