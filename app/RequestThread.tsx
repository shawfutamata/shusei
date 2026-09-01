'use client';
/* eslint-disable @next/next/no-img-element -- 顔写真はアプリ自身が配信している */

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { RequestComment } from '@/db/data';

const MAX_LENGTH = 600;

/**
 * 探しごとの上で始まった、おふたりだけのやり取り。
 *
 * **もともとは公開のコメント欄だった。コメントはやめたので、いまはここが
 * 「すでに始まっている会話の続き」だけを扱う。** 新しく1本を始める道は
 * サーバー側で閉じてあるので、この画面に入口は無い。読んで、返すだけ。
 *
 * 見せる相手を絞っているのはサーバー。ここで隠しているのではない
 * （非公開のぶんは、関係のない会員には最初から届かない）。
 */
export default function RequestThread({ requestId, viewerId, threadWith }:
  { requestId: string; viewerId: string;
    /** 相手の会員ID。投稿者から見れば相手、相手から見れば自分自身。 */
    threadWith: string }) {
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/comments?requestId=${encodeURIComponent(requestId)}`)
      .then((response) => response.ok ? response.json() as Promise<{ comments: RequestComment[] }> : null)
      .then((data) => { if (active && data) setComments(data.comments); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [requestId]);

  // 最初の公開のひとことも、この会話の一部として並べる。そこから続いた話なので、
  // 切り離すと「なんの話だったか」が分からなくなる。
  const thread = useMemo(() => comments.filter((item) => item.threadWith === threadWith),
    [comments, threadWith]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/comments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, body, threadWith }),
      });
      const data = await response.json() as { comments?: RequestComment[]; error?: string };
      if (!response.ok || !data.comments) throw new Error(data.error ?? '送れませんでした。');
      setComments(data.comments);
      setBody('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '送れませんでした。');
    } finally { setBusy(false); }
  }

  if (loading) return <p className="messages-loading">読み込んでいます…</p>;

  return <section className="request-thread" aria-label="おふたりだけのやり取り">
    <ol>{thread.map((item) => <li key={item.id} className={item.authorId === viewerId ? 'is-mine' : ''}>
      <span className="thread-who">
        {item.authorAvatarUrl
          ? <img src={item.authorAvatarUrl} alt={`${item.authorName}さんの顔写真`} />
          : <b>{item.authorName.slice(0, 1)}</b>}
        <em>{item.authorName}</em>
      </span>
      <p>{item.body}</p>
      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
    </li>)}</ol>

    <form className="comment-form" onSubmit={submit}>
      {!!error && <p className="comment-error">{error}</p>}
      <div className="comment-input">
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={MAX_LENGTH} rows={1}
          placeholder="返事を書く…" aria-label="返事を書く" onInput={grow} />
        <button className="comment-send" disabled={busy || !body.trim()} aria-label="送る">
          {busy ? <i className="comment-spinner" aria-hidden="true" /> : <SendMark />}
        </button>
      </div>
    </form>
  </section>;
}

/** 打った量に合わせて伸ばす。5行を超えたら中でスクロールさせる。 */
function grow(event: { currentTarget: HTMLTextAreaElement }) {
  const field = event.currentTarget;
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, 132)}px`;
}

function SendMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 11.3 19.6 4.7c.8-.3 1.6.5 1.3 1.3l-6.6 15.2c-.3.8-1.5.7-1.7-.1l-1.5-5.4c-.1-.3-.3-.5-.6-.6l-5.4-1.5c-.8-.2-.9-1.4-.1-1.7z" /></svg>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
