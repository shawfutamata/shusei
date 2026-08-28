'use client';
/* eslint-disable @next/next/no-img-element -- authenticated avatar URLs are served by the app */

import { FormEvent, useEffect, useState } from 'react';
import type { RequestComment } from '@/db/data';
import FacebookLink from './FacebookLink';

const MAX_LENGTH = 600;

/** 探しごとのやり取り。投稿した人と答える人が、その場で行き来できるようにする。 */
export default function RequestComments({ requestId, onCountChange }: { requestId: string; onCountChange?: (count: number) => void }) {
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // requestId ごとにこの部品ごと作り直されるので、ここでloadingを立て直す必要はない。
    let active = true;
    fetch(`/api/comments?requestId=${encodeURIComponent(requestId)}`)
      .then((response) => response.ok ? response.json() as Promise<{ comments: RequestComment[] }> : null)
      .then((data) => { if (active && data) { setComments(data.comments); onCountChange?.(data.comments.length); } })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // onCountChange は毎回変わりうるので依存に入れない。requestId が変わったときだけ読み直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/comments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, body }),
      });
      const data = await response.json() as { comments?: RequestComment[]; error?: string };
      if (!response.ok || !data.comments) throw new Error(data.error ?? 'コメントを送れませんでした。');
      setComments(data.comments);
      onCountChange?.(data.comments.length);
      setBody('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'コメントを送れませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return <section className="comments" aria-label="この探しごとへのコメント">
    <div className="comments-heading"><b>やり取り</b><span>{loading ? '読み込み中…' : `${comments.length}件`}</span></div>

    {!loading && comments.length === 0 && <p className="comments-empty">まだコメントはありません。心当たりがあれば、ひと言残してみてください。</p>}

    <ol className="comment-list">
      {comments.map((comment) => <li key={comment.id} className={comment.isAuthorOfRequest ? 'comment owner' : 'comment'}>
        <span className="member-avatar">{comment.authorAvatarUrl ? <img src={comment.authorAvatarUrl} alt={`${comment.authorName}さんの顔写真`} /> : <span>{comment.authorName.slice(0, 1)}</span>}</span>
        <div>
          <p className="comment-who"><b>{comment.authorName}</b>{comment.isAuthorOfRequest && <em>投稿者</em>}<small>{[comment.authorCompany, comment.authorVenue].filter(Boolean).join('・')}</small></p>
          <p className="comment-body">{comment.body}</p>
          <div className="comment-foot"><time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time><FacebookLink url={comment.authorFacebookUrl} name={comment.authorName} /></div>
        </div>
      </li>)}
    </ol>

    <form className="comment-form" onSubmit={submit}>
      <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={MAX_LENGTH} rows={3}
        placeholder="例：その業種でしたら心当たりがあります。詳しく伺えますか？" aria-label="コメントを書く" />
      {!!error && <p className="comment-error">{error}</p>}
      <div className="comment-actions"><small>{body.length}/{MAX_LENGTH}</small><button className="submit-button" disabled={busy || !body.trim()}>{busy ? '送信中…' : 'コメントする'}</button></div>
    </form>
  </section>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
