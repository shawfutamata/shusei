'use client';
/* eslint-disable @next/next/no-img-element -- authenticated avatar URLs are served by the app */

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { RequestComment } from '@/db/data';
import FacebookLink from './FacebookLink';

const MAX_LENGTH = 600;

/**
 * 探しごとのやり取り。
 *
 * **最初のひとことだけ会員みんなに見える。2通目からは投稿者とその人だけ。**
 * 込み入った話や金額の話がそのまま公開の場に出てしまうのを避けつつ、
 * 掲示板がにぎわって見える入口は残すため。
 *
 * **おふたりだけのやり取りに入れるのは、オファーかリファラルを出した人だけ。**
 * ひとことは誰でも書けるが、その先は有料の「オファー」で買えるものと同じなので、
 * コメントを迂回路にしない。リファラル（無料）でも開くので、道は塞がらない。
 * 開いているかどうかはサーバーが `threadOpen` で教えてくれる（判定はあちら側）。
 *
 * 非公開のぶんはそもそもサーバーから届かない。ここで隠しているのではない。
 */
export default function RequestComments({ requestId, viewerId, isRequestAuthor, initialThread = '', onOffer, onCountChange }:
  { requestId: string; viewerId: string; isRequestAuthor: boolean;
    /** メッセージ一覧から開いたとき、その相手のやり取りを最初から開いておく。 */
    initialThread?: string; onOffer?: () => void;
    onCountChange?: (count: number) => void }) {
  const [comments, setComments] = useState<RequestComment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** 開いているやり取りの相手（会員ID）。空なら誰も開いていない。 */
  const [openThread, setOpenThread] = useState(initialThread);
  /** やり取りの中で書いている文。相手ごとに分けて持つ。 */
  const [replyBody, setReplyBody] = useState('');

  useEffect(() => {
    // requestId ごとにこの部品ごと作り直されるので、ここでloadingを立て直す必要はない。
    let active = true;
    fetch(`/api/comments?requestId=${encodeURIComponent(requestId)}`)
      .then((response) => response.ok ? response.json() as Promise<{ comments: RequestComment[] }> : null)
      .then((data) => { if (active && data) { setComments(data.comments); onCountChange?.(data.comments.filter((item) => item.isPublic).length); } })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // onCountChange は毎回変わりうるので依存に入れない。requestId が変わったときだけ読み直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  /** 会員みんなに見えるひとこと。掲示板のにぎわいはここに出る。 */
  const publicComments = useMemo(() => comments.filter((item) => item.isPublic), [comments]);
  /** 相手ごとの、非公開のやり取り。 */
  const threads = useMemo(() => {
    const map = new Map<string, RequestComment[]>();
    for (const item of comments) {
      if (item.isPublic || !item.threadWith) continue;
      map.set(item.threadWith, [...(map.get(item.threadWith) ?? []), item]);
    }
    return map;
  }, [comments]);

  /** 自分が既に書いているか。書いていれば、次からは非公開のやり取りに入る。 */
  const myThreadStarted = !isRequestAuthor && comments.some((item) => item.threadWith === viewerId);
  /** その非公開のやり取りに、自分が入れるか（＝オファーかリファラルを出したか）。 */
  const myThreadOpen = comments.some((item) => item.threadWith === viewerId && item.threadOpen);

  async function send(text: string, threadWith: string) {
    const response = await fetch('/api/comments', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, body: text, threadWith }),
    });
    const data = await response.json() as { comments?: RequestComment[]; error?: string };
    if (!response.ok || !data.comments) throw new Error(data.error ?? 'コメントを送れませんでした。');
    setComments(data.comments);
    onCountChange?.(data.comments.filter((item) => item.isPublic).length);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setError('');
    try { await send(body, ''); setBody(''); }
    catch (sendError) { setError(sendError instanceof Error ? sendError.message : 'コメントを送れませんでした。'); }
    finally { setBusy(false); }
  }

  async function submitReply(event: FormEvent, threadWith: string) {
    event.preventDefault();
    if (!replyBody.trim() || busy) return;
    setBusy(true); setError('');
    try { await send(replyBody, threadWith); setReplyBody(''); }
    catch (sendError) { setError(sendError instanceof Error ? sendError.message : '送れませんでした。'); }
    finally { setBusy(false); }
  }

  return <section className="comments" aria-label="この探しごとへのコメント">
    <div className="comments-heading"><b>やり取り</b><span>{loading ? '読み込み中…' : `${publicComments.length}件`}</span></div>

    {!loading && publicComments.length === 0 && <p className="comments-empty">
      まだコメントはありません。<br />心当たりがあれば、ひと言残してみてください。
    </p>}

    {/* 会話として読めるように、投稿者の発言だけ右に寄せて色を変える */}
    <ol className="comment-list">
      {publicComments.map((comment) => {
        // 続きを開けるのは、探しごとの投稿者と、その本人だけ。
        const thread = comment.threadWith ? threads.get(comment.threadWith) ?? [] : [];
        const mine = comment.threadWith === viewerId;
        // 相手として関係があるか。**開けるかどうかは別で、オファーが要る。**
        const canOpen = Boolean(comment.threadWith) && (isRequestAuthor || mine) && comment.threadOpen;
        // 塞がっていることを行内に出すのは投稿者だけ。書いた本人には、
        // 入力欄のところで一度だけ伝える（同じ案内を二度出さない）。
        const locked = Boolean(comment.threadWith) && isRequestAuthor && !comment.threadOpen;
        const open = openThread === comment.threadWith;
        return <li key={comment.id} className={comment.isAuthorOfRequest ? 'comment is-owner' : 'comment'}>
          <span className="comment-avatar">{comment.authorAvatarUrl
            ? <img src={comment.authorAvatarUrl} alt={`${comment.authorName}さんの顔写真`} />
            : <b>{comment.authorName.slice(0, 1)}</b>}</span>
          <div className="comment-main">
            <p className="comment-who">
              <b>{comment.authorName}</b>
              {comment.isAuthorOfRequest && <em>投稿者</em>}
              <small>{[comment.authorCompany, comment.authorVenue].filter(Boolean).join('・')}</small>
            </p>
            <div className="comment-bubble">
              <p>{comment.body}</p>
              <FacebookLink url={comment.authorFacebookUrl} name={comment.authorName} />
            </div>
            <time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time>

            {canOpen && <button type="button" className="comment-thread-open"
              onClick={() => { setOpenThread(open ? '' : comment.threadWith); setReplyBody(''); }}>
              {open ? 'とじる' : `${isRequestAuthor ? `${comment.authorName}さんと` : ''}個別にやり取りする${thread.length ? ` ${thread.length}件` : ''}`}
            </button>}

            {locked && <p className="comment-thread-locked">
              {comment.authorName}さんからの<b>オファーはまだ届いていません</b>。おふたりだけのやり取りは、届いてからになります。
            </p>}

            {canOpen && open && <div className="comment-thread">
              <p className="comment-thread-note">ここからは<b>おふたりだけ</b>のやり取りです。ほかの会員には見えません。</p>
              <ol>{thread.map((item) => <li key={item.id} className={item.authorId === viewerId ? 'is-mine' : ''}>
                <b>{item.authorName}</b><p>{item.body}</p><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
              </li>)}</ol>
              <form className="comment-form" onSubmit={(event) => submitReply(event, comment.threadWith)}>
                <div className="comment-input">
                  <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} maxLength={MAX_LENGTH} rows={1}
                    placeholder="返事を書く…" aria-label="個別のやり取りを書く" onInput={grow} />
                  <button className="comment-send" disabled={busy || !replyBody.trim()} aria-label="送る">
                    {busy ? <i className="comment-spinner" aria-hidden="true" /> : <SendMark />}
                  </button>
                </div>
              </form>
            </div>}
          </div>
        </li>;
      })}
    </ol>

    {/* 入力はチャットの入力欄と同じ形。文字数は右下に小さく重ねる（ボタンとぶつからない位置） */}
    <form className="comment-form" onSubmit={submit}>
      {!!error && <p className="comment-error">{error}</p>}
      {myThreadStarted
        ? (myThreadOpen
          ? <p className="comment-thread-note">この探しごとへのひとことは、もう出しています。続きは上の<b>「個別にやり取りする」</b>から、投稿者とおふたりだけで話せます。</p>
          : <p className="comment-thread-note">
              この探しごとへのひとことは、もう出しています。続きは<b>オファーかリファラル</b>を送ってから、投稿者とおふたりだけで話せます。
              <small>知り合いをつなぐリファラルは無料です。</small>
              {onOffer && <button type="button" className="comment-thread-cta" onClick={onOffer}>オファー・リファラルを送る</button>}
            </p>)
        : <>
          <p className="comment-public-note">ここに書いたひとことは<b>会員みんなに見えます</b>。おふたりだけのやり取りに進むには、オファーかリファラルが要ります（リファラルは無料）。</p>
          <div className="comment-input">
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={MAX_LENGTH} rows={1}
              placeholder="心当たりを書く…" aria-label="コメントを書く" onInput={grow} />
            <button className="comment-send" disabled={busy || !body.trim()} aria-label="コメントを送る">
              {busy ? <i className="comment-spinner" aria-hidden="true" /> : <SendMark />}
            </button>
          </div>
          {body.length > MAX_LENGTH - 100 && <small className="comment-count-left">あと{MAX_LENGTH - body.length}文字</small>}
        </>}
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
