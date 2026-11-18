'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- 認証確認後の状態を通常遷移で読み直す。 */
import { useEffect, useRef, useState } from 'react';
import { LINE_LINK_DISCLOSURE } from '@/app/line-data-consent';
import { requestLineAuthorization } from '@/app/line-authorization-client';
import styles from '@/app/admin/line-test/line-test.module.css';

const PENDING_KEY = 'tasuki:owner-line-check:pending';
const PENDING_TTL = 10 * 60 * 1000;
const RETURN_MESSAGE = '連携の完了をまだ確認できません。状態を再確認してください。';
function clearPending() { try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* 保存不可でも確認を続ける。 */ } }
function hasPending() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (raw === null) return false;
    const time = Number(raw), age = Date.now() - time;
    if (!raw.trim() || !Number.isFinite(time) || age < 0 || age >= PENDING_TTL) { clearPending(); return false; }
    return true;
  } catch { return false; }
}

export default function LinkCheck({ email, linked, initialMessage }: { email: string; linked: boolean; initialMessage: string }) {
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<{ source: string; message: string } | null>(null);
  const active = useRef<AbortController | null>(null);
  const started = useRef(false);
  // サーバーから届く結果はstateへ複製せず、新しいpropsをそのまま表示する。
  const localMessage = local?.source === initialMessage ? local.message : '';
  const message = linked ? (initialMessage || 'LINEは連携済みです。追加の認証や通知は行いません。') : initialMessage || localMessage || '現在、LINEは未連携です。';
  useEffect(() => {
    const stop = () => { active.current?.abort(); active.current = null; setBusy(false); };
    started.current = false;
    const checkReturn = () => {
      if (linked || (initialMessage && !started.current)) { clearPending(); return; }
      if (hasPending()) setLocal({ source: initialMessage, message: RETURN_MESSAGE });
    };
    // 履歴キャッシュでは従来通りサーバー状態を再取得する。アプリ復帰は案内のみ。
    const restore = (event: PageTransitionEvent) => { if (event.persisted) { stop(); window.location.reload(); } else checkReturn(); };
    const visible = () => { if (document.visibilityState === 'visible') checkReturn(); };
    checkReturn();
    window.addEventListener('pagehide', stop); window.addEventListener('pageshow', restore);
    document.addEventListener('visibilitychange', visible);
    return () => { stop(); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', restore); document.removeEventListener('visibilitychange', visible); };
  }, [initialMessage, linked]);
  async function begin() {
    if (!consent || linked || active.current) return;
    clearPending(); started.current = true;
    setLocal({ source: initialMessage, message: '本人確認を開いています…' });
    const controller = new AbortController(); active.current = controller; setBusy(true);
    try {
      const url = await requestLineAuthorization({ action: 'owner_link_check' }, controller);
      if (active.current === controller && !controller.signal.aborted) {
        // 保存するのは短期の開始時刻だけ。会員ID・URL・認証情報は保存しない。
        try { window.sessionStorage.setItem(PENDING_KEY, String(Date.now())); } catch { /* OAuth自体を妨げない。 */ }
        window.location.assign(url);
      }
    } catch { if (active.current === controller) { clearPending(); setLocal({ source: initialMessage, message: '本人確認を開始できませんでした。通知は送っていません。設定や有効期限を確認してください。' }); } }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <main className={styles.page}>
    <h1>本人限定LINE接続確認</h1>
    <p>対象会員: <strong className={styles.email}>{email}</strong></p>
    <p>今回は本人のLINE連携だけを確認します。一般向けログイン・登録・自動通知はOFFのままです。本人にも他の会員にも通知は送りません。</p>
    <p role="status" className={styles.notice}>{message}</p>
    {!linked && !initialMessage && localMessage === RETURN_MESSAGE && <button type="button" className={styles.stopButton} onClick={() => window.location.reload()}>連携状況を再確認する</button>}
    {!linked && <section><h2>本人のLINEと連携する</h2>
      <label className={styles.check}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>{LINE_LINK_DISCLOSURE} 今回は本人の接続確認だけに使います。</span></label>
      <button type="button" className={styles.lineButton} disabled={!consent || busy} onClick={() => void begin()}>{busy ? '本人確認を開いています…' : '本人のLINEで連携する'}</button>
    </section>}
    <p>確認画面は設定した短期間だけ利用できます。期限後も連携データは残ります。連携解除は通常の本人確認手順が必要です。以前の通知テストの終了状態や送信枠は変更しません。</p>
    <a href="/settings/line">LINE連携状況へ</a><br /><a href="/">TASUKIへ戻る</a>
  </main>;
}
