'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- 認証確認後の状態を通常遷移で読み直す。 */
import { useEffect, useRef, useState } from 'react';
import { LINE_LINK_DISCLOSURE } from '@/app/line-data-consent';
import { requestLineAuthorization } from '@/app/line-authorization-client';
import styles from '@/app/admin/line-test/line-test.module.css';

export default function LinkCheck({ email, linked, initialMessage }: { email: string; linked: boolean; initialMessage: string }) {
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(initialMessage);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const stop = () => { active.current?.abort(); active.current = null; setBusy(false); };
    // LINEから履歴キャッシュへ戻った場合は、古い未連携表示ではなくサーバーの現在状態を読む。
    const restore = (event: PageTransitionEvent) => { if (event.persisted) { stop(); window.location.reload(); } };
    window.addEventListener('pagehide', stop); window.addEventListener('pageshow', restore);
    return () => { stop(); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', restore); };
  }, []);
  async function begin() {
    if (!consent || linked || active.current) return;
    const controller = new AbortController(); active.current = controller; setBusy(true);
    try {
      const url = await requestLineAuthorization({ action: 'owner_link_check' }, controller);
      if (active.current === controller && !controller.signal.aborted) window.location.assign(url);
    } catch { if (active.current === controller) setMessage('本人確認を開始できませんでした。通知は送っていません。設定や有効期限を確認してください。'); }
    finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  return <main className={styles.page}>
    <h1>本人限定LINE接続確認</h1>
    <p>対象会員: <strong className={styles.email}>{email}</strong></p>
    <p>今回は本人のLINE連携だけを確認します。一般向けログイン・登録・自動通知はOFFのままです。本人にも他の会員にも通知は送りません。</p>
    <p role="status" className={styles.notice}>{message || (linked ? 'LINEは連携済みです。追加の認証や通知は行いません。' : '現在、LINEは未連携です。')}</p>
    {!linked && <section><h2>本人のLINEと連携する</h2>
      <label className={styles.check}><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>{LINE_LINK_DISCLOSURE} 今回は本人の接続確認だけに使います。</span></label>
      <button type="button" className={styles.lineButton} disabled={!consent || busy} onClick={() => void begin()}>{busy ? '本人確認を開いています…' : '本人のLINEで連携する'}</button>
    </section>}
    <p>確認画面は設定した短期間だけ利用できます。期限後も連携データは残ります。連携解除は通常の本人確認手順が必要です。以前の通知テストの終了状態や送信枠は変更しません。</p>
    <a href="/settings/line">LINE連携状況へ</a><br /><a href="/">TASUKIへ戻る</a>
  </main>;
}
