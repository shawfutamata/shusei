'use client';
/* eslint-disable @next/next/no-img-element -- 顔写真はアプリ自身が配信している */

import { useEffect, useMemo, useState } from 'react';
import type { ReceivedIntroduction, SentIntroduction } from '@/db/data';
import FacebookLink from './FacebookLink';
import IntroductionChat from './IntroductionChat';

const categoryLabels = { project: '案件', collaboration: '協業先', consultation: '相談・情報' };

/**
 * 紹介の受け箱。**届いた／出した**の両方を出す。
 *
 * やり取りは2人でするものなので、紹介した側にも入口が要る。届いたぶんだけ
 * だと、紹介者は自分が出した紹介を見返すことも、返事を読むこともできない。
 */
export default function ReceivedIntroductions() {
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

  const groups = useMemo(() => Object.values(received.reduce<Record<string, { requestId: string; title: string; category: ReceivedIntroduction['requestCategory']; items: ReceivedIntroduction[] }>>((result, item) => {
    const group = result[item.requestId] ?? { requestId: item.requestId, title: item.requestTitle, category: item.requestCategory, items: [] };
    group.items.push(item); result[item.requestId] = group; return result;
  }, {})), [received]);

  if (loading) return <div className="received-loading">紹介を読み込んでいます…</div>;
  if (!received.length && !sent.length) {
    return <div className="received-empty"><span>✉</span><b>紹介はまだありません</b>
      <p>あなたの探しごとに紹介が届くと、ここで内容を確認して、紹介してくれた方とやり取りできます。</p></div>;
  }

  return <div className="received-inbox">
    <div className="received-tabs" role="group" aria-label="紹介の向き">
      <button className={side === 'received' ? 'selected' : ''} onClick={() => setSide('received')}
        aria-pressed={side === 'received'}>届いた紹介 <span>{received.length}</span></button>
      <button className={side === 'sent' ? 'selected' : ''} onClick={() => setSide('sent')}
        aria-pressed={side === 'sent'}>出した紹介 <span>{sent.length}</span></button>
    </div>

    {side === 'received' ? (!received.length
      ? <div className="received-empty"><span>✉</span><b>届いた紹介はまだありません</b>
        <p>あなたの探しごとに紹介が届くと、ここに並びます。</p></div>
      : <>
        <div className="received-summary">
          <span><b>{received.length}</b><small>届いた紹介</small></span>
          <p>紹介された人と、紹介者からのメッセージを確認できます。そのままやり取りもできます。</p>
        </div>
        {groups.map((group) => <section className="received-group" key={group.requestId}>
          <header><span>{categoryLabels[group.category]}</span>
            <div><small>あなたの探しごと</small><h3>{group.title}</h3></div>
            <b>{group.items.length}件</b></header>
          <div className="received-list">{group.items.map((item) => <article className="received-card" key={item.id}>
            <button className="received-card-head" onClick={() => setExpanded((current) => current === item.id ? '' : item.id)}>
              <div className="received-person-mark">人</div>
              <div><small>{formatDate(item.createdAt)}に届きました</small><h4>{item.personName}</h4><p>{item.personCompany}</p></div>
              <i>{expanded === item.id ? '−' : '＋'}</i>
            </button>
            {expanded === item.id && <div className="received-detail">
              <dl>
                <div><dt>紹介者との関係</dt><dd>{item.relationship}</dd></div>
                <div><dt>紹介したい理由</dt><dd>{item.fitReason}</dd></div>
              </dl>
              <div className="received-from">
                {item.introducerAvatarUrl
                  ? <img src={item.introducerAvatarUrl} alt={`${item.introducerName}さんの顔写真`} />
                  : <span>{item.introducerName.slice(0, 1)}</span>}
                <p><small>紹介してくれた会員</small><b>{item.introducerName}</b>
                  <em>{item.introducerCompany || '会社名未設定'} · {item.introducerVenue}</em>
                  <FacebookLink url={item.introducerFacebookUrl} name={item.introducerName} /></p>
              </div>
              <IntroductionChat introductionId={item.id} partnerName={item.introducerName} />
            </div>}
          </article>)}</div>
        </section>)}
      </>
    ) : (!sent.length
      ? <div className="received-empty"><span>✉</span><b>出した紹介はまだありません</b>
        <p>掲示板で探しごとを見つけて紹介すると、ここに残ります。</p></div>
      : <>
        <div className="received-summary">
          <span><b>{sent.length}</b><small>出した紹介</small></span>
          <p>あなたが紹介した内容と、相手からの返事です。</p>
        </div>
        <div className="received-list">{sent.map((item) => <article className="received-card" key={item.id}>
          <button className="received-card-head" onClick={() => setExpanded((current) => current === item.id ? '' : item.id)}>
            <div className="received-person-mark">人</div>
            <div><small>{formatDate(item.createdAt)}に紹介しました</small><h4>{item.personName}</h4>
              <p>{item.requestTitle}</p></div>
            <i>{expanded === item.id ? '−' : `＋${item.messageCount ? ` ${item.messageCount}` : ''}`}</i>
          </button>
          {expanded === item.id && <div className="received-detail">
            <dl>
              <div><dt>あなたとの関係</dt><dd>{item.relationship}</dd></div>
              <div><dt>紹介した理由</dt><dd>{item.fitReason}</dd></div>
            </dl>
            <div className="received-from">
              {item.authorAvatarUrl
                ? <img src={item.authorAvatarUrl} alt={`${item.authorName}さんの顔写真`} />
                : <span>{item.authorName.slice(0, 1)}</span>}
              <p><small>探していた会員</small><b>{item.authorName}</b>
                <em>{item.authorCompany || '会社名未設定'} · {item.authorVenue}</em>
                <FacebookLink url={item.authorFacebookUrl} name={item.authorName} /></p>
            </div>
            <IntroductionChat introductionId={item.id} partnerName={item.authorName} />
          </div>}
        </article>)}</div>
      </>
    )}
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}
