'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- 認証画面ではRSCの先読みを使わず通常遷移する。 */
import { requestLineAuthorization } from '@/app/line-authorization-client';
import { useEffect, useRef, useState } from 'react';
import { serviceName } from '@/app/brand';
import { LINE_LINK_CONSENT_LABEL } from '@/app/line-data-consent';
import '@/app/line.css';
import styles from './LineSettings.module.css';
type Status = { withdrawalReady: boolean; enabled: boolean; notificationsReady: boolean; linked: boolean; displayName: string; notifyMessage: boolean; notifyOffer: boolean; canUnlink: boolean; canEnable: boolean; friendUrl: string };
export default function LineSettings({ initialMessage }: { initialMessage: string }) {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(initialMessage), [busy, setBusy] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState(false), [notifyOffer, setNotifyOffer] = useState(false), [consent, setConsent] = useState(false);
  const [purpose, setPurpose] = useState<'unlink' | 'withdraw' | null>(null), [sent, setSent] = useState(false), [code, setCode] = useState('');
  const [privacyPending, setPrivacyPending] = useState(false), [needsLineConfirmation, setNeedsLineConfirmation] = useState(false);
  const [privacyError, setPrivacyError] = useState(''), [privacyMessage, setPrivacyMessage] = useState('');
  const feedbackRef = useRef<HTMLParagraphElement>(null), privacyFeedbackRef = useRef<HTMLParagraphElement>(null), privacyHeadingRef = useRef<HTMLHeadingElement>(null), privacyTriggerRef = useRef<HTMLElement | null>(null), submitting = useRef(false), operation = useRef(0);
  const privacyReturnFocus = useRef<{ target: HTMLElement; operation: number } | null>(null);
  const oauth = useRef<AbortController | null>(null);
  const [startingOAuth, setStartingOAuth] = useState(false);
  // 描画前の連打も一度に絞り、画面を離れた後の応答は反映しない。
  useEffect(() => {
    // BFCacheではReactがunmountしない。離脱時に旧応答を無効化し、復元時はサーバー状態を読み直す。
    const leave = () => { privacyReturnFocus.current = null; operation.current++; oauth.current?.abort(); oauth.current = null; submitting.current = true; };
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      leave(); setBusy(true); setStartingOAuth(false);
      window.location.reload();
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', restore);
    return () => { leave(); submitting.current = false; window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', restore); };
  }, []);
  useEffect(() => { if (error || message) feedbackRef.current?.focus(); }, [error, message]);
  useEffect(() => { if (purpose) privacyHeadingRef.current?.focus(); }, [purpose]);
  useEffect(() => { if (privacyError || privacyMessage) privacyFeedbackRef.current?.focus(); }, [privacyError, privacyMessage]);
  // 取消成功後、busy解除と確認パネル閉鎖がDOMへ反映されてから元の入口へ一度だけ戻す。
  useEffect(() => {
    if (busy || purpose || !privacyReturnFocus.current) return;
    const pendingFocus = privacyReturnFocus.current; privacyReturnFocus.current = null;
    if (pendingFocus.operation === operation.current && !submitting.current && pendingFocus.target.isConnected) pendingFocus.target.focus();
  }, [busy, purpose]);
  function apply(data: Status) { setStatus(data); setNotifyMessage(data.notifyMessage); setNotifyOffer(data.notifyOffer); }
  useEffect(() => { const controller = new AbortController();
    const leave = () => controller.abort(); window.addEventListener('pagehide', leave);
    void fetch('/api/line/settings', { cache: 'no-store', signal: controller.signal }).then(async r => { const d = await r.json() as Status & { error?: string }; if (!r.ok) throw new Error(d.error || '設定を読み込めませんでした。'); if (!controller.signal.aborted) apply(d); }).catch(e => { if (!controller.signal.aborted && e.name !== 'AbortError') setError(e.message); });
    return () => { controller.abort(); window.removeEventListener('pagehide', leave); };
  }, []);
  async function stop(email = false) {
    if (submitting.current) return; submitting.current = true; const current = ++operation.current; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/line/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(email ? { action: 'stop_email' } : { action: 'preferences', message: false, offer: false }) });
      const data = await response.json() as Status & { error?: string }; if (current !== operation.current) return; if (!response.ok) throw new Error(data.error || '保存できませんでした。');
      apply(data); setMessage(email ? 'メールのお知らせを停止しました。ご自身で依頼する本人確認メールは届きます。' : 'LINE通知を停止しました。');
    } catch (e) { if (current === operation.current) setError(e instanceof Error ? e.message : '通信できませんでした。'); } finally { if (current === operation.current) { submitting.current = false; setBusy(false); } }
  }
  async function authorize(action: 'link' | 'preferences' | 'unlink_recovery') {
    if (submitting.current || (action === 'link' && !consent)) return;
    if (action === 'preferences' && !notifyMessage && !notifyOffer) { await stop(); return; }
    submitting.current = true; const current = ++operation.current, controller = new AbortController(); oauth.current = controller;
    setStartingOAuth(true); setBusy(true); setError(''); setMessage(''); setPrivacyError(''); let navigating = false;
    try {
      const url = await requestLineAuthorization({ action, message: action === 'preferences' && notifyMessage, offer: action === 'preferences' && notifyOffer }, controller);
      if (current !== operation.current || controller.signal.aborted) return;
      window.location.assign(url); navigating = true; oauth.current = null; setStartingOAuth(false);
    } catch {
      if (current === operation.current) {
        const text = 'LINEの本人確認画面を開けませんでした。連携・設定変更・解除の完了は確認できていません。画面を再読み込みして状態をご確認ください。';
        if (action === 'unlink_recovery') setPrivacyError(text); else setError(text);
      }
    } finally { if (current === operation.current && !navigating) { oauth.current = null; setStartingOAuth(false); submitting.current = false; setBusy(false); } }
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
  function choose(value: 'unlink' | 'withdraw', trigger?: HTMLElement) { if (submitting.current) return; privacyReturnFocus.current = null; privacyTriggerRef.current = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null); setPurpose(value); setSent(false); setCode(''); setError(''); setMessage(''); setPrivacyError(''); setPrivacyMessage(''); setPrivacyPending(false); setNeedsLineConfirmation(false); }
  async function cancelPrivacy() {
    if (oauth.current) { operation.current++; oauth.current.abort(); oauth.current = null; setStartingOAuth(false); submitting.current = false; }
    if (submitting.current || !purpose) return; privacyReturnFocus.current = null; submitting.current = true; const current = ++operation.current; setBusy(true); setPrivacyError('');
    try {
      const response = await fetch('/api/account/privacy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', purpose }) });
      const data = await response.json() as { canceled?: boolean }; if (current !== operation.current) return;
      if (!response.ok || data.canceled !== true) throw new Error('キャンセルを確認できませんでした。もう一度お試しください。');
      setPrivacyPending(false); setNeedsLineConfirmation(false); setPurpose(null); setSent(false); setCode(''); setPrivacyError(''); setPrivacyMessage('');
      if (privacyPending) setMessage('本人確認の手続きを終了しました。通知停止や、既にLINEへ送信した解除処理は取り消されません。');
      // pending取消は取り消されない処理の結果メッセージを優先し、入口へfocusを奪わない。
      if (!privacyPending && privacyTriggerRef.current) privacyReturnFocus.current = { target: privacyTriggerRef.current, operation: current };
    } catch (e) { if (current === operation.current) setPrivacyError(e instanceof Error ? e.message : '通信できませんでした。'); } finally { if (current === operation.current) { submitting.current = false; setBusy(false); } }
  }
  const notificationState = !status?.notificationsReady ? '準備中' : !status.canEnable ? '利用状況の確認が必要' : status.notifyMessage || status.notifyOffer ? '選択した通知がオン' : 'オフ';
  return <main className={`line-settings-page ${styles.page}`}>
    <a className={styles.back} href="/">← {serviceName}に戻る</a>
    <header className={styles.header}><span className={styles.eyebrow}>LINE SETTINGS</span><h1>LINE連携・通知</h1><p>連携の確認と、お知らせの設定はこちら。</p></header>
    {(error || message) && <p ref={feedbackRef} tabIndex={-1} role={error ? 'alert' : 'status'} className={`line-feedback ${styles.feedback} ${error ? 'line-error' : 'line-status'}`}>{error || message}</p>}
    {!status ? <div className={styles.loading} role="status">{error ? 'ページを読み直してお試しください。' : '設定を読み込み中…'}</div> : <>
      <section className={styles.overview} aria-label="現在のLINE連携状況">
        <div className={styles.overviewTitle}><span className={styles.lineMark} aria-hidden="true">LINE</span><div><span className={styles.kicker}>いまの連携状況</span><h2>{status.linked ? 'LINE連携済み' : 'LINEは未連携です'}</h2></div></div>
        <p className={styles.overviewDescription}>会員情報や投稿は、今の{serviceName}アカウントにそのまま残ります。</p>
        <dl className={styles.statusGrid}><div><dt>LINE通知の設定</dt><dd>{status.linked ? notificationState : '連携後に選択'}</dd></div></dl>
        {!status.enabled && <div className={styles.availability}><b>新しいLINE連携は準備中です</b><p>新しい連携はまだ行えません。{status.linked ? '連携済みの方は、通知停止・連携解除を下から行えます。' : '受付開始までお待ちください。'}</p></div>}
      </section>

      {!status.linked && status.enabled && status.canEnable && <section className={styles.card} aria-labelledby="line-connect-heading">
        <div className={styles.cardHeading}><span className={styles.step} aria-hidden="true">1</span><div><h2 id="line-connect-heading">LINEを連携する</h2><p>内容に同意して、LINEで本人確認します。</p></div></div>
        <form action="/api/auth/line/start" method="post" onSubmit={e => { e.preventDefault(); void authorize('link'); }}>
          <a className={styles.detailLink} href="/settings/line/about">LINE情報の取扱いを読む <span aria-hidden="true">›</span></a><p className={styles.consentPurpose}>ログイン・連携管理に使います。希望するLINE通知は別に選べます。</p>
          <label className={styles.consent}><input type="checkbox" name="consent" value="yes" required disabled={busy} checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{LINE_LINK_CONSENT_LABEL}</span></label>
          <button type="button" onClick={() => void authorize('link')} className="line-button" disabled={!consent || busy}>LINEを連携する</button>
        </form>
      </section>}
      {!status.linked && status.enabled && !status.canEnable && <p className={styles.availability}>現在の会員状態では新しいLINE連携を行えません。</p>}

      {status.linked && <>
        <section className={styles.card} aria-labelledby="line-notifications-heading">
          <div className={styles.cardHeading}><span className={styles.sectionIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 21h4" /></svg></span><div><h2 id="line-notifications-heading">LINEで受け取るお知らせ</h2><p>相手の名前や本文は載せず、届いたことだけお知らせ。</p></div></div>
          {status.notificationsReady && status.canEnable ? <>
            <div className={styles.friendStep}><span className={styles.step} aria-hidden="true">1</span><div><b>公式LINEを友だち追加</b><p>追加済みの方は、そのまま次へ。</p></div>{status.friendUrl && <a className={styles.friendLink} href={status.friendUrl} target="_blank" rel="noreferrer">公式LINEを友だち追加</a>}</div>
            <form action="/api/auth/line/start" method="post" onSubmit={e => { e.preventDefault(); void authorize('preferences'); }}>
              <input type="hidden" name="action" value="preferences" /><input type="hidden" name="consent" value="yes" />
              <fieldset disabled={busy}><legend className={styles.legend}><span className={styles.step} aria-hidden="true">2</span>受け取る通知を選んでください</legend>
                <label className={`${styles.choice} ${notifyMessage ? styles.selected : ''}`}><input type="checkbox" name="message" value="yes" checked={notifyMessage} onChange={e => setNotifyMessage(e.target.checked)} /><span><b>新しいメッセージ</b><small>メッセージが届いたとき</small></span><span className={styles.choiceState} aria-hidden="true">{notifyMessage ? '選択中' : 'オフ'}</span></label>
                <label className={`${styles.choice} ${notifyOffer ? styles.selected : ''}`}><input type="checkbox" name="offer" value="yes" checked={notifyOffer} onChange={e => setNotifyOffer(e.target.checked)} /><span><b>新しいオファー・リファラル</b><small>オファーや紹介が届いたとき</small></span><span className={styles.choiceState} aria-hidden="true">{notifyOffer ? '選択中' : 'オフ'}</span></label>
                {(notifyMessage !== status.notifyMessage || notifyOffer !== status.notifyOffer) && <p className={styles.draftNotice} role="status">変更はまだ保存されていません。</p>}
                <p className={styles.saveConsent}>選んだお知らせをLINEへ送ることに同意して保存します。両方外すと通知を停止します。</p>
                <button type="button" onClick={() => void authorize('preferences')} className="line-button">{notifyMessage || notifyOffer ? 'LINEで確認して設定を保存' : 'LINE通知を停止'}</button>
              </fieldset>
            </form>
            <p className={styles.small}>保存時はLINEで本人確認します。友だち未追加・ブロック中などは届かない場合があります。<a href="/settings/line/about#notifications">通知の詳しい説明</a></p>
          </> : <div className={styles.emptyNotice}><b>{status.notificationsReady ? '通知の新規設定は利用できません' : 'LINE通知は準備中です'}</b><p>現在は通知を新しく有効にできません。</p></div>}
          <div className={styles.stopRow}><button className="line-unlink" disabled={busy} onClick={() => void stop()}>LINE通知をすべて停止</button><p>送信中のお知らせは取り消せない場合があります。</p></div>
        </section>

        <section className={`${styles.card} ${styles.manageCard}`} aria-labelledby="line-unlink-heading"><div className={styles.manageHeading}><h2 id="line-unlink-heading">LINEとの連携を解除する</h2><span className={styles.subtleBadge}>会員情報は残ります</span></div><p>LINEの通知と連動を解除する手続きです。</p><button className="line-unlink" disabled={busy} onClick={event => choose('unlink', event?.currentTarget)}>メールで本人確認して連携解除</button><a className={styles.detailLink} href="/settings/line/about#unlink">解除するとどうなる？</a></section>
      </>}

      <details className={styles.details}><summary><span><b>メールのお知らせ</b><small>LINE通知とは別の設定です</small></span><span className={styles.expand} aria-hidden="true">＋</span></summary><div className={styles.detailsBody}><p>LINE登録時のメールのお知らせは、別の同意で選びます。通知を止めても、ご自身で依頼する本人確認コードは送信されます。</p><button className="line-unlink" disabled={busy} onClick={() => void stop(true)}>メールのお知らせを停止</button></div></details>
      <section className={`${styles.card} ${styles.manageCard}`} aria-labelledby="line-withdraw-heading"><h2 id="line-withdraw-heading">退会について</h2>{status.withdrawalReady ? <><p>会員登録とLINE連携を削除します。元に戻せません。</p><button className="line-unlink" disabled={busy} onClick={event => choose('withdraw', event?.currentTarget)}>退会の本人確認へ</button></> : <p>オンライン退会は準備中です。運営窓口に退会・削除をご依頼ください。</p>}<a className={styles.detailLink} href="/settings/line/about#withdraw">退会・削除について確認する</a></section>

      {purpose && <section className={`${styles.card} ${styles.confirmation}`} aria-label="操作の確認"><span className={styles.kicker}>手続きの前にご確認ください</span><h2 ref={privacyHeadingRef} tabIndex={-1}>{purpose === 'unlink' ? 'LINE連携解除の確認' : '退会の確認'}</h2>
        <div className={styles.caution}>{purpose === 'unlink' ? <><b>LINEとの連動を解除します</b><ul><li>LINE通知が止まり、LINE側の{serviceName}との連動も解除します。LINEでログインした端末はログアウトします。</li><li>会員情報・投稿・登録メールは残ります。</li><li>再ログインには、登録メールと同じGoogleアカウントが必要です。ご用意できない場合は、先に運営窓口へご相談ください。</li></ul></> : <><b>退会は元に戻せません</b><p>会員登録とLINE連携を削除します。取引・請求・共有記録がある場合は、この画面では削除せず運営窓口での確認が必要です。バックアップ等の取扱いは運営への確認が必要です。</p></>}</div>
        <p className={styles.confirmLead}>この操作のため、登録メールアドレスへの確認コード送信を依頼します。</p>
        {!privacyPending && <button className="line-unlink" disabled={busy} onClick={() => void privacy()}>{sent ? '確認コードを再送' : '確認コードをメールで送る'}</button>}
        {(privacyError || privacyMessage) && <p ref={privacyFeedbackRef} tabIndex={-1} role={privacyError ? 'alert' : 'status'} className={`line-feedback ${styles.feedback} ${privacyError ? 'line-error' : 'line-status'}`}>{privacyError || privacyMessage}</p>}
        {sent && !privacyPending && <form onSubmit={e => { e.preventDefault(); void privacy(true); }}><label className="line-privacy-code">6桁の確認コード<input aria-label="6桁の確認コード" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} disabled={busy} /></label><button className={`line-unlink ${styles.dangerButton}`} disabled={busy || !/^\d{6}$/.test(code)}>{purpose === 'unlink' ? 'LINE連携を解除する' : '退会して会員情報を削除する'}</button></form>}
        {privacyPending && <><div className={styles.pendingNotice}><b>解除はまだ完了していません</b><p>状況を確認して、続きの手続きを行ってください。</p></div><button className="line-unlink" disabled={busy} onClick={() => void privacy(false, true)}>解除の処理を再試行</button>{needsLineConfirmation && <form action="/api/auth/line/start" method="post" onSubmit={e => { e.preventDefault(); void authorize('unlink_recovery'); }}><input type="hidden" name="action" value="unlink_recovery" /><input type="hidden" name="consent" value="yes" /><p>同じLINEで本人確認し、{serviceName}との連動解除を完了します。</p><button type="button" onClick={() => void authorize('unlink_recovery')} className="line-button" disabled={busy}>LINEで本人確認して解除を完了</button></form>}<p className={styles.small}>LINEで本人確認できない場合は、運営窓口での確認が必要です。</p></>}
        <button className={`line-unlink ${styles.cancelButton}`} disabled={busy && !startingOAuth} onClick={() => void cancelPrivacy()}>キャンセル</button></section>}
      <footer className={styles.footer}><a href="/settings/line/about">LINE連携・データの取扱いについて</a><a href="/account/privacy">ログインできない場合のLINE連携解除・退会確認</a><a href="/privacy">プライバシーポリシー</a></footer>
    </>}
  </main>;
}
