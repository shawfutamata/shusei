'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { serviceName } from '@/app/brand';
import { LINE_LINK_DISCLOSURE } from '@/app/line-data-consent';
import '@/app/line.css';
type Status = { withdrawalReady: boolean; enabled: boolean; notificationsReady: boolean; linked: boolean; displayName: string; notifyMessage: boolean; notifyOffer: boolean; canUnlink: boolean; canEnable: boolean; friendUrl: string };
export default function LineSettings({ initialMessage }: { initialMessage: string }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(initialMessage), [busy, setBusy] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState(false), [notifyOffer, setNotifyOffer] = useState(false), [consent, setConsent] = useState(false);
  const [purpose, setPurpose] = useState<'unlink' | 'withdraw' | null>(null), [sent, setSent] = useState(false), [code, setCode] = useState('');
  const [privacyPending, setPrivacyPending] = useState(false), [needsLineConfirmation, setNeedsLineConfirmation] = useState(false);
  const [privacyError, setPrivacyError] = useState(''), [privacyMessage, setPrivacyMessage] = useState('');
  const feedbackRef = useRef<HTMLParagraphElement>(null), privacyFeedbackRef = useRef<HTMLParagraphElement>(null), privacyHeadingRef = useRef<HTMLHeadingElement>(null), privacyTriggerRef = useRef<HTMLElement | null>(null), submitting = useRef(false), operation = useRef(0);
  // 描画前の連打も一度に絞り、画面を離れた後の応答は反映しない。
  useEffect(() => () => { operation.current++; submitting.current = false; }, []);
  useEffect(() => { if (error || message) feedbackRef.current?.focus(); }, [error, message]);
  useEffect(() => { if (purpose) privacyHeadingRef.current?.focus(); }, [purpose]);
  useEffect(() => { if (privacyError || privacyMessage) privacyFeedbackRef.current?.focus(); }, [privacyError, privacyMessage]);
  function apply(data: Status) { setStatus(data); setNotifyMessage(data.notifyMessage); setNotifyOffer(data.notifyOffer); }
  useEffect(() => { const controller = new AbortController();
    void fetch('/api/line/settings', { cache: 'no-store', signal: controller.signal }).then(async r => { const d = await r.json() as Status & { error?: string }; if (!r.ok) throw new Error(d.error || '設定を読み込めませんでした。'); if (!controller.signal.aborted) apply(d); }).catch(e => { if (!controller.signal.aborted && e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);
  async function stop(email = false) {
    if (submitting.current) return; submitting.current = true; const current = ++operation.current; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/line/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(email ? { action: 'stop_email' } : { action: 'preferences', message: false, offer: false }) });
      const data = await response.json() as Status & { error?: string }; if (current !== operation.current) return; if (!response.ok) throw new Error(data.error || '保存できませんでした。');
      apply(data); setMessage(email ? 'メールのお知らせを停止しました。ご自身で依頼する本人確認メールは届きます。' : 'LINE通知を停止しました。');
    } catch (e) { if (current === operation.current) setError(e instanceof Error ? e.message : '通信できませんでした。'); } finally { if (current === operation.current) { submitting.current = false; setBusy(false); } }
  }
  async function privacy(confirm = false, retry = false) {
    if (submitting.current || !purpose) return; submitting.current = true; const current = ++operation.current; setBusy(true); setError(''); setMessage(''); setPrivacyError(''); setPrivacyMessage('');
    try {
      const response = await fetch('/api/account/privacy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose, action: retry ? 'retry' : confirm ? 'confirm' : 'request', consent: true, confirm: confirm || retry, code }) });
      const data = await response.json() as { error?: string; sent?: boolean; signedOut?: boolean; done?: boolean; pending?: boolean; needsLineConfirmation?: boolean; message?: string }; if (current !== operation.current) return; if (!response.ok) throw new Error(data.error || '操作を完了できませんでした。');
      if (!confirm && !retry) { if (data.sent !== true) throw new Error('確認コードの送信依頼を確認できませんでした。もう一度お試しください。'); setSent(true); setPrivacyPending(false); setNeedsLineConfirmation(false); setPrivacyMessage(data.message || '確認コードを送信しました。有効期限は10分です。'); }
      else if (data.pending === true) { setPrivacyPending(true); setNeedsLineConfirmation(data.needsLineConfirmation === true); setPrivacyMessage(data.message || 'LINE側の解除はまだ完了していません。'); }
      else if (data.done !== true) throw new Error('手続きの完了を確認できませんでした。もう一度お試しください。');
      else if (data.signedOut === true || purpose === 'withdraw') window.location.assign(`/login/member?login=${purpose === 'withdraw' ? 'account_removed' : 'line_removed'}`);
      else { setPurpose(null); setSent(false); setCode(''); apply({ ...status!, linked: false, notifyMessage: false, notifyOffer: false }); setMessage('LINE連携を解除しました。'); }
    } catch (e) { if (current === operation.current) setPrivacyError(e instanceof Error ? e.message : '通信できませんでした。'); } finally { if (current === operation.current) { submitting.current = false; setBusy(false); } }
  }
  function choose(value: 'unlink' | 'withdraw') { if (submitting.current) return; privacyTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPurpose(value); setSent(false); setCode(''); setError(''); setMessage(''); setPrivacyError(''); setPrivacyMessage(''); setPrivacyPending(false); setNeedsLineConfirmation(false); }
  async function cancelPrivacy() {
    if (submitting.current || !purpose) return; submitting.current = true; const current = ++operation.current; setBusy(true); setPrivacyError('');
    try {
      const response = await fetch('/api/account/privacy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', purpose }) });
      const data = await response.json() as { canceled?: boolean }; if (current !== operation.current) return;
      if (!response.ok || data.canceled !== true) throw new Error('キャンセルを確認できませんでした。もう一度お試しください。');
      setPrivacyPending(false); setNeedsLineConfirmation(false); setPurpose(null); setSent(false); setCode(''); setPrivacyError(''); setPrivacyMessage('');
      if (privacyPending) setMessage('本人確認の手続きを終了しました。通知停止や、既にLINEへ送信した解除処理は取り消されません。');
      privacyTriggerRef.current?.focus();
    } catch (e) { if (current === operation.current) setPrivacyError(e instanceof Error ? e.message : '通信できませんでした。'); } finally { if (current === operation.current) { submitting.current = false; setBusy(false); } }
  }
  return <main className="line-settings-page"><Link href="/">← {serviceName}に戻る</Link><h1>LINE連携・通知</h1><p>LINEログインとお知らせを、ご自身で管理できます。</p>
    {(error || message) && <p ref={feedbackRef} tabIndex={-1} role={error ? 'alert' : 'status'} className={`line-feedback ${error ? 'line-error' : 'line-status'}`}>{error || message}</p>}
    {!status ? <p>{error ? 'ページを読み直してお試しください。' : '設定を読み込み中…'}</p> : <>
      {!status.enabled && <section><h2>LINE連携は準備中です</h2><p>新しい連携はまだ行えません。既存の連携解除・通知停止は下から行えます。</p></section>}
      <section><h2>{status.linked ? 'LINE連携済み' : 'LINEを連携する'}</h2>
        {status.linked ? <><p>{status.displayName || 'あなたのLINE'}と連携しています。</p><p>会員情報や投稿は、今の{serviceName}アカウントにそのまま残ります。</p></> : status.enabled && status.canEnable ? <form action="/api/auth/line/start" method="post"><label><input type="checkbox" name="consent" value="yes" required checked={consent} onChange={e => setConsent(e.target.checked)} />{LINE_LINK_DISCLOSURE}</label><p><Link href="/privacy">プライバシーポリシー</Link>をご確認ください。通知は別に選べます。</p><button className="line-button" disabled={!consent}>LINEを連携する</button></form> : <p>現在の会員状態では新しいLINE連携を行えません。</p>}
      </section>
      {status.linked && <><section><h2>LINEで受け取るお知らせ</h2><p>通知は最初はオフです。相手の名前や本文はLINEに載せず、届いたことだけお知らせします。</p>
        {status.notificationsReady && status.canEnable ? <>
          <div className="line-status"><p>公式LINEを友だち追加して、受け取る通知を選んでください。保存時にLINEで本人確認しますが、友だち・ブロック状態は照会しません。未追加・ブロック中などは、設定を保存しても届かない場合があります。</p>{status.friendUrl && <a className="line-button" href={status.friendUrl} target="_blank" rel="noreferrer">公式LINEを友だち追加</a>}</div>
          <form action="/api/auth/line/start" method="post" onSubmit={e => { if (!notifyMessage && !notifyOffer) { e.preventDefault(); void stop(); } }}>
            <input type="hidden" name="action" value="preferences" /><input type="hidden" name="consent" value="yes" />
            <fieldset disabled={busy}><legend>受け取る通知を選んでください</legend><label><input type="checkbox" name="message" value="yes" checked={notifyMessage} onChange={e => setNotifyMessage(e.target.checked)} />新しいメッセージ</label><label><input type="checkbox" name="offer" value="yes" checked={notifyOffer} onChange={e => setNotifyOffer(e.target.checked)} />新しいオファー・リファラル</label><p>選んだお知らせをLINEへ送ることに同意して保存します。両方外すと通知を停止します。</p><button className="line-button">{notifyMessage || notifyOffer ? 'LINEで確認して設定を保存' : 'LINE通知を停止'}</button></fieldset>
          </form>
        </> : <p>現在は通知を新しく有効にできません。</p>}
        <button className="line-unlink" disabled={busy} onClick={() => void stop()}>LINE通知をすべて停止</button><p>LINEでブロックすると通知が停止します。ブロック解除後もご自身で設定するまで再開しません。既に送信中のお知らせは取り消せない場合があります。</p>
      </section><section><h2>LINEとの連携を解除する</h2><p>LINE通知が止まり、LINE側のTASUKIとの連動も解除します。LINEでログインした端末はログアウトします。会員情報・投稿・登録メールは残ります。再ログインには、登録メールと同じGoogleアカウントが必要です。ご用意できない場合は、先に運営窓口へご相談ください。</p><button className="line-unlink" disabled={busy} onClick={() => choose('unlink')}>メールで本人確認して連携解除</button></section></>}
      <section><h2>メールのお知らせ</h2><p>LINE登録時のメールのお知らせは、別の同意で選びます。通知を止めても、ご自身で依頼する本人確認コードは送信されます。</p><button className="line-unlink" disabled={busy} onClick={() => void stop(true)}>メールのお知らせを停止</button></section>
      <section><h2>退会</h2><p>会員登録とLINE連携を削除します。元に戻せません。取引・請求・共有記録がある場合は、この画面では削除せず運営窓口での確認が必要です。バックアップ等の取扱いは運営への確認が必要です。</p>{status.withdrawalReady ? <button className="line-unlink" disabled={busy} onClick={() => choose('withdraw')}>退会の本人確認へ</button> : <p>オンライン退会は準備中です。運営窓口に退会・削除をご依頼ください。</p>}</section>
      {purpose && <section aria-label="操作の確認"><h2 ref={privacyHeadingRef} tabIndex={-1}>{purpose === 'unlink' ? 'LINE連携解除の確認' : '退会の確認'}</h2><p>この操作のため、登録メールアドレスへの確認コード送信を依頼します。</p>
        {!privacyPending && <button className="line-unlink" disabled={busy} onClick={() => void privacy()}>{sent ? '確認コードを再送' : '確認コードをメールで送る'}</button>}
        {(privacyError || privacyMessage) && <p ref={privacyFeedbackRef} tabIndex={-1} role={privacyError ? 'alert' : 'status'} className={`line-feedback ${privacyError ? 'line-error' : 'line-status'}`}>{privacyError || privacyMessage}</p>}
        {sent && !privacyPending && <form onSubmit={e => { e.preventDefault(); void privacy(true); }}><label className="line-privacy-code">6桁の確認コード<input aria-label="6桁の確認コード" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} disabled={busy} /></label><button className="line-unlink" disabled={busy || !/^\d{6}$/.test(code)}>{purpose === 'unlink' ? 'LINE連携を解除する' : '退会して会員情報を削除する'}</button></form>}
        {privacyPending && <><button className="line-unlink" disabled={busy} onClick={() => void privacy(false, true)}>解除の処理を再試行</button>{needsLineConfirmation && <form action="/api/auth/line/start" method="post"><input type="hidden" name="action" value="unlink_recovery" /><input type="hidden" name="consent" value="yes" /><p>同じLINEで本人確認し、TASUKIとの連動解除を完了します。</p><button className="line-button" disabled={busy}>LINEで本人確認して解除を完了</button></form>}<p>LINEで本人確認できない場合は、運営窓口での確認が必要です。</p></>}
        <button className="line-unlink" disabled={busy} onClick={() => void cancelPrivacy()}>キャンセル</button></section>}
      <p><Link href="/account/privacy">ログインできない場合のLINE連携解除・退会確認</Link></p>
    </>}
  </main>;
}
