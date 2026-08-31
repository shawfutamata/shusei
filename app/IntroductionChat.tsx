'use client';
/* eslint-disable @next/next/no-img-element -- 顔写真はアプリ自身が配信している */

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { IntroductionMessage } from '@/db/data';

/**
 * 紹介1件ごとのやり取り。**投稿者と紹介者の2人だけ**が読み書きできる。
 *
 * 探しごとのコメント欄は会員みんなが読めるが、こちらは違う。紹介した相手の
 * 名前や連絡の段取りが出るところなので、外に見せない。守っているのはサーバー
 * 側（`introductionPartner()`）で、この画面はその結果を映しているだけ。
 */
export default function IntroductionChat({ introductionId, partnerName }: {
  introductionId: string; partnerName: string;
}) {
  const [messages, setMessages] = useState<IntroductionMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/introductions/${encodeURIComponent(introductionId)}/messages`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setMessages((data as { messages: IntroductionMessage[] }).messages); })
      .catch(() => { if (alive) setMessages([]); });
    return () => { alive = false; };
  }, [introductionId]);

  // 新しいものが下。開いたときと送ったあとは、いちばん下を見せる。
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError('');
    const response = await fetch(`/api/introductions/${encodeURIComponent(introductionId)}/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }),
    });
    const result = await response.json() as { messages?: IntroductionMessage[]; error?: string };
    setBusy(false);
    if (!response.ok) return setError(result.error ?? '送れませんでした。');
    setMessages(result.messages ?? []);
    setText('');
  }

  return <section className="intro-chat" aria-label={`${partnerName}さんとのやり取り`}>
    <p className="intro-chat-head">
      <b>{partnerName}さんとやり取りする</b>
      <small>このやり取りは、おふたりだけが読めます。</small>
    </p>

    {messages === null ? <p className="intro-chat-loading">読み込んでいます…</p>
      : <ol className="intro-chat-list">
        {!messages.length && <li className="intro-chat-empty">
          まだメッセージはありません。お礼やご連絡の段取りを、ここから送れます。
        </li>}
        {messages.map((message) => <li key={message.id} className={message.mine ? 'is-mine' : ''}>
          {!message.mine && (message.senderAvatarUrl
            ? <img className="intro-chat-face" src={message.senderAvatarUrl} alt={`${message.senderName}さんの顔写真`} />
            : <span className="intro-chat-face">{message.senderName.slice(0, 1)}</span>)}
          <div>
            <p className="intro-chat-bubble">{message.body}</p>
            <small>{message.mine ? 'あなた' : message.senderName}・{formatWhen(message.createdAt)}</small>
          </div>
        </li>)}
        <div ref={endRef} />
      </ol>}

    <form className="intro-chat-form" onSubmit={send}>
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={2} maxLength={1000}
        placeholder={`${partnerName}さんへのメッセージ`} aria-label="メッセージ" />
      <button disabled={busy || !text.trim()}>{busy ? '送っています…' : '送る'}</button>
    </form>
    {!!error && <p className="intro-chat-error" role="alert">{error}</p>}
  </section>;
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
