'use client';

import { useState } from 'react';

/**
 * Stripeの管理画面（支払い方法の変更・領収書・解約）を開くボタン。
 *
 * サポートページはログインしていなくても読めるので、**押した人が会員とは
 * 限らない。** 断られたときは、その理由をそのまま出す。黙って何も起きない
 * のがいちばん困る（解約したい人を宙ぶらりんにしない）。
 */
export default function BillingPortalButton({ label = 'お支払い・解約の手続きへ' }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function open() {
    if (busy) return;
    setBusy(true); setNote('');
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json() as { url?: string; error?: string };
      if (data.url) { window.location.assign(data.url); return; }
      setNote(response.status === 401
        ? 'お手続きの前に、TASUKIにログインしてください。'
        : data.error || 'お支払いの管理画面を開けませんでした。運営窓口へご連絡ください。');
    } catch {
      setNote('通信に失敗しました。時間をおいてお試しください。');
    }
    setBusy(false);
  }

  return <>
    <button type="button" onClick={open} disabled={busy} style={style}>{busy ? '開いています…' : label}</button>
    {!!note && <p style={noteStyle} role="status">{note}</p>}
  </>;
}

const style: React.CSSProperties = {
  minHeight: 50, marginTop: 6, padding: '0 20px', border: 0, borderRadius: 12,
  background: '#2563eb', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
};
const noteStyle: React.CSSProperties = {
  margin: '10px 0 0', color: '#b4380f', fontSize: 14, fontWeight: 700, lineHeight: 1.8,
};
