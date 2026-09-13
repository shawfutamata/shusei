'use client';
/* eslint-disable @next/next/no-img-element -- 画像はアプリ自身が配信している */

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { IntroductionMessage } from '@/db/data';
import { messageImage } from './resize-image';
import { MESSAGE_IMAGE_DAYS } from './message-options';

/**
 * オファー1件ごとのやり取り。**投稿者とオファーした人の2人だけ**が読み書きできる。
 *
 * 見た目は**よくあるメッセージアプリと同じ形**にしてある。自分は右、相手は左、
 * 入力は下。ふだん使っているものと同じ並びなら、説明しなくても使える。
 *
 * **押せるものしか置かない。** カメラ・マイク・絵文字・いいねは付けていない。
 * 並んでいるのに押しても何も起きないボタンは、できないことを探させるだけ。
 *
 * 守っているのはサーバー側（`introductionPartner()`）で、この画面は
 * その結果を映しているだけ。
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
  /** 送る前の画像。選んだ時点で小さいJPEGに焼き直してある。 */
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [picking, setPicking] = useState(false);
  /** 消そうとしているメッセージ。取り消せないので、必ず一度確かめる。 */
  const [deleting, setDeleting] = useState<IntroductionMessage | null>(null);
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
    el.style.height = `${Math.min(el.scrollHeight + frame, 140)}px`;
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

  /**
   * 写真を選ぶ。**種類と大きさでは弾かない。**
   * 端末で長辺1400pxのJPEGへ焼き直してから送るので、選ぶ時点では
   * 「この端末で読めるか」だけを見る（顔写真の登録と同じ考え）。
   */
  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setError(''); setPicking(true);
    try {
      const ready = await messageImage(file);
      if (photo) URL.revokeObjectURL(photo.preview);
      setPhoto({ file: ready, preview: URL.createObjectURL(ready) });
    } catch {
      setError('この写真は読み込めませんでした。別の写真をお試しください。');
    } finally {
      setPicking(false);
    }
  }

  function dropPhoto() {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    // 写真だけ送れる。写真を1枚渡したいだけの場面で、文章を強いない。
    if ((!body && !photo) || busy) return;
    setBusy(true); setError('');
    const url = `/api/introductions/${encodeURIComponent(introductionId)}/messages`;
    let response: Response;
    if (photo) {
      const form = new FormData();
      form.set('body', body);
      form.set('image', photo.file);
      response = await fetch(url, { method: 'POST', body: form });
    } else {
      response = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }),
      });
    }
    const result = await response.json() as { messages?: IntroductionMessage[]; error?: string };
    setBusy(false);
    if (!response.ok) return setError(result.error ?? '送れませんでした。');
    setMessages(result.messages ?? []);
    setText(''); dropPhoto();
    if (boxRef.current) { boxRef.current.style.height = 'auto'; grow(boxRef.current); }
  }

  /** 確かめたうえで消す。**取り消せない。** */
  async function confirmDelete() {
    const target = deleting;
    if (!target || busy) return;
    setBusy(true); setError('');
    const response = await fetch(`/api/messages/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
    setBusy(false); setDeleting(null);
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null;
      return setError(result?.error ?? '削除できませんでした。');
    }
    setMessages((current) => (current ?? []).filter((message) => message.id !== target.id));
  }

  return <section className="chat" aria-label={`${partnerName}さんとのやり取り`}>
    {heading && <p className="chat-head">
      <b>{partnerName}さんとやり取りする</b>
      <small>このやり取りは、おふたりだけが読めます。</small>
    </p>}

    {messages === null ? <p className="chat-loading">読み込んでいます…</p>
      : <ol className="chat-list">
        {!messages.length && <li className="chat-empty">
          まだメッセージはありません。お礼やご連絡の段取りを、ここから送れます。
        </li>}
        {messages.map((message, index) => {
          // 同じ人が続けて送ったときは、顔写真と名前を出さない。
          // 1通ごとに顔が並ぶと、話の固まりが見えなくなる。
          const previous = messages[index - 1];
          const first = !previous || previous.mine !== message.mine;
          return <li key={message.id} className={`${message.mine ? 'is-mine' : ''}${first ? ' is-first' : ''}`}>
            {!message.mine && <span className="chat-face">
              {first && (message.senderAvatarUrl
                ? <img src={message.senderAvatarUrl} alt={`${message.senderName}さんの顔写真`} />
                : <i>{message.senderName.slice(0, 1)}</i>)}
            </span>}
            <div className="chat-body">
              {first && !message.mine && <small className="chat-name">{message.senderName}</small>}
              {/* 文章が先、写真があと。「これを送ります」と言ってから見せる順。 */}
              {!!message.body && <p className="chat-bubble">{message.body}</p>}
              {!!message.imageUrl && <a className="chat-photo" href={message.imageUrl} target="_blank" rel="noreferrer noopener">
                <img src={message.imageUrl} alt="送られた画像" loading="lazy" />
              </a>}
              {message.imageExpired && <p className="chat-gone">画像の保存期間（{MESSAGE_IMAGE_DAYS}日）が過ぎました</p>}
              <small className="chat-when">
                {formatWhen(message.createdAt)}
                {/* 消せるのは自分が送ったものだけ。相手の発言は消せない。 */}
                {message.mine && <button type="button" className="chat-delete"
                  onClick={() => setDeleting(message)}>削除</button>}
              </small>
            </div>
          </li>;
        })}
        <div ref={endRef} />
      </ol>}

    {/* 入力は下に固定の一本。**押せるものしか置かない**（写真と送信だけ）。 */}
    <form className="chat-form" onSubmit={send}>
      {!!photo && <div className="chat-draft">
        <img src={photo.preview} alt="送る画像" />
        <button type="button" onClick={dropPhoto} aria-label="画像を外す">×</button>
      </div>}
      <div className="chat-bar">
        <label className="chat-pick" aria-label="画像を選ぶ">
          <input type="file" accept="image/*" disabled={busy || picking}
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void choosePhoto(file); }} />
          <PhotoIcon />
        </label>
        <textarea ref={(el) => { boxRef.current = el; grow(el); }} value={text}
          onChange={(event) => { setText(event.target.value); grow(event.target); }} rows={1} maxLength={1000}
          placeholder={picking ? '画像を読み込んでいます…' : `${partnerName}さんへのメッセージ`} aria-label="メッセージ" />
        <button className="chat-send" disabled={busy || picking || (!text.trim() && !photo)} aria-label="送る">
          <SendIcon />
        </button>
      </div>
      <small className="chat-count">{text.length}/1000　画像は{MESSAGE_IMAGE_DAYS}日で消えます</small>
    </form>
    {!!error && <p className="chat-error" role="alert">{error}</p>}

    {/* 消す前に必ず一度確かめる。**取り消せない**ので、そう書く。 */}
    {!!deleting && <div className="chat-confirm" role="dialog" aria-modal="true" aria-label="メッセージの削除">
      <div className="chat-confirm-box">
        <b>このメッセージを削除しますか？</b>
        <p>削除すると<b>相手の画面からも消えます</b>。元に戻すことはできません。
          {deleting.imageUrl && '付いている画像も一緒に消えます。'}</p>
        {!!deleting.body && <q className="chat-confirm-quote">{deleting.body}</q>}
        <div className="chat-confirm-actions">
          <button type="button" onClick={() => setDeleting(null)} disabled={busy}>やめる</button>
          <button type="button" className="is-danger" onClick={confirmDelete} disabled={busy}>
            {busy ? '削除しています…' : '削除する'}
          </button>
        </div>
      </div>
    </div>}
  </section>;
}

function PhotoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.8" />
    <path d="M21 16l-5-5-6 6-2-2-5 5" />
  </svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />
  </svg>;
}

function formatWhen(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
