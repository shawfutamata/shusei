'use client';
/* eslint-disable @next/next/no-img-element -- authenticated avatar URLs are served by the app */

import { useEffect, useMemo, useState } from 'react';
import type { ReceivedIntroduction } from '@/db/data';
import FacebookLink from './FacebookLink';

const categoryLabels = { project: '案件', collaboration: '協業先', consultation: '相談・情報' };

export default function ReceivedIntroductions() {
  const [introductions, setIntroductions] = useState<ReceivedIntroduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string>('');

  useEffect(() => {
    let active = true;
    async function loadIntroductions() {
      const response = await fetch('/api/introductions');
      if (!active) return;
      if (response.ok) {
        const data = await response.json() as { introductions: ReceivedIntroduction[] };
        setIntroductions(data.introductions);
        setExpanded(data.introductions[0]?.id ?? '');
      }
      setLoading(false);
    }
    void loadIntroductions();
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => Object.values(introductions.reduce<Record<string, { requestId: string; title: string; category: ReceivedIntroduction['requestCategory']; items: ReceivedIntroduction[] }>>((result, item) => {
    const group = result[item.requestId] ?? { requestId: item.requestId, title: item.requestTitle, category: item.requestCategory, items: [] };
    group.items.push(item); result[item.requestId] = group; return result;
  }, {})), [introductions]);

  if (loading) return <div className="received-loading">届いた紹介を読み込んでいます…</div>;
  if (!introductions.length) return <div className="received-empty"><span>✉</span><b>届いた紹介はまだありません</b><p>あなたの探しごとに紹介が届くと、ここで内容を確認できます。</p></div>;

  return <div className="received-inbox"><div className="received-summary"><span><b>{introductions.length}</b><small>届いた紹介</small></span><p>紹介された人と、紹介者からのメッセージを確認できます。</p></div>{groups.map((group) => <section className="received-group" key={group.requestId}><header><span>{categoryLabels[group.category]}</span><div><small>あなたの探しごと</small><h3>{group.title}</h3></div><b>{group.items.length}件</b></header><div className="received-list">{group.items.map((item) => <article className="received-card" key={item.id}><button className="received-card-head" onClick={() => setExpanded((current) => current === item.id ? '' : item.id)}><div className="received-person-mark">人</div><div><small>{formatDate(item.createdAt)}に届きました</small><h4>{item.personName}</h4><p>{item.personCompany}</p></div><i>{expanded === item.id ? '−' : '＋'}</i></button>{expanded === item.id && <div className="received-detail"><dl><div><dt>紹介者との関係</dt><dd>{item.relationship}</dd></div><div><dt>紹介したい理由</dt><dd>{item.fitReason}</dd></div></dl><div className="received-from">{item.introducerAvatarUrl ? <img src={item.introducerAvatarUrl} alt={`${item.introducerName}さんの顔写真`} /> : <span>{item.introducerName.slice(0, 1)}</span>}<p><small>紹介してくれた会員</small><b>{item.introducerName}</b><em>{item.introducerCompany || '会社名未設定'} · {item.introducerVenue}</em><FacebookLink url={item.introducerFacebookUrl} name={item.introducerName} /></p></div></div>}</article>)}</div></section>)}</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}
