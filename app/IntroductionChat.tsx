'use client';
/* eslint-disable @next/next/no-img-element -- 顔写真はアプリ自身が配信している */

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { IntroductionMessage } from '@/db/data';

/**
 * オファー1件ごとのやり取り。**投稿者とオファーした人の2人だけ**が読み書きできる。
 *
 * こちらは2人しか読めない。オファーした相手の
 * 名前や連絡の段取りが出るところなので、外に見せない。守っているのはサーバー
 * 側（`introductionPartner()`）で、この画面はその結果を映しているだけ。
 */
export default function IntroductionChat({ introductionId, partnerName, heading = true }: {
  introductionId: string; partnerName: string;
  /**
   * 上の見出しを出すか。**外側がもう相手の名前を出しているときは消す。**
   * 受け箱の中では要るが、メッセージから開いたときはモーダルの見出しと重なる。
   */
  heading?: boolean;
}) {
  const [messages, setMessages] = useState<IntroductionMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * 書いた分だけ入力欄を伸ばす。
   *
   * 高さを固定にすると、少し長い文章を書いた時点で上が見えなくなる。
   * 送る前に読み返せないのは困るので、中身に合わせて伸ばす。
   * 伸ばしっぱなしだと画面を埋めてしまうので、上限を決めてそこからは中で送る。
   */
  function grow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    // box-sizing:border-box なので、枠線の分を足さないと2pxぶん足りずに縦スクロールが残る。
    const frame = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + frame, 260)}px`;
  }

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
    if (boxRef.current) { boxRef.current.style.height = 'auto'; grow(boxRef.current); }
  }

  return <section className="intro-chat" aria-label={`${partnerName}さんとのやり取り`}>
    {heading && <p className="intro-chat-head">
      <b>{partnerName}さんとやり取りする</b>
      <small>このやり取りは、おふたりだけが読めます。</small>
    </p>}

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
      {/* 入力欄は横いっぱいに取り、ボタンは下に置く。横に並べると入力欄が
          狭くなって、書いている途中の文章が見えなくなる。 */}
      <textarea ref={(el) => { boxRef.current = el; grow(el); }} value={text}
        onChange={(event) => { setText(event.target.value); grow(event.target); }} rows={4} maxLength={1000}
        placeholder={`${partnerName}さんへのメッセージ`} aria-label="メッセージ" />
      <div className="intro-chat-send">
        <small>{text.length}/1000</small>
        <button disabled={busy || !text.trim()}>{busy ? '送っています…' : '送る'}</button>
      </div>
    </form>
    {!!error && <p className="intro-chat-error" role="alert">{error}</p>}
  </section>;
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
