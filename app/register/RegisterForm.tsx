'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleMark } from '@/app/login/LoginForm';
import { useLineAvailability } from '@/app/LineLoginButton';
import { LINE_DATA_DISCLOSURE } from '@/app/line-data-consent';
import { serviceName } from '@/app/brand';

type BusyAction = 'google' | 'request' | 'verify' | null;
export default function RegisterForm({ invite, initialMessage = '' }: { invite: string; initialMessage?: string }) {
  const [consent, setConsent] = useState(false);
  const [lineConsent, setLineConsent] = useState(false);
  const [mailConsent, setMailConsent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [draftId, setDraftId] = useState('');
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState(initialMessage);
  const [lineError, setLineError] = useState('');
  const [status, setStatus] = useState('');
  const pending = useRef<AbortController | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const line = useLineAvailability();
  const busy = busyAction !== null;

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  useEffect(() => { if (draftId) codeInput.current?.focus(); }, [draftId, resendAt]);
  useEffect(() => () => pending.current?.abort(), []);

  async function run(action: Exclude<BusyAction, null>) {
    if (pending.current || !consent || (action !== 'google' && !lineConsent)) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusyAction(action);
    if (action === 'google') setError(''); else { setLineError(''); setStatus(''); }
    const timer = window.setTimeout(() => controller.abort(), 20000);
    let navigating = false;
    try {
      const response = await fetch(action === 'google' ? '/api/register' : '/api/auth/line/registration', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify(action === 'google'
          ? { action: 'draft', consent, invite, authProvider: 'google' }
          : action === 'request'
            ? { action, consent, invite, name, email, lineConsent, mailConsent, ...(draftId ? { draftId } : {}) }
            : { action, draftId, code }),
      });
      const result = await response.json() as { draft?: string; draftId?: string; next?: string; error?: string };
      if (pending.current !== controller) return;
      if (!response.ok) throw new Error(result.error || '登録できませんでした。');
      if (action === 'google') {
        if (!result.draft) throw new Error('登録できませんでした。');
        navigating = true;
        window.location.assign(`/api/auth/google/start?signup=1&draft=${encodeURIComponent(result.draft)}`);
      } else if (action === 'request') {
        if (!result.draftId) throw new Error('確認メールの送信結果を確認できませんでした。');
        setDraftId(result.draftId);
        setCode('');
        setResendAt(Date.now() + 60000);
        setStatus('確認コードを送信しました。メールが届かない場合は迷惑メールフォルダもご確認ください。');
        codeInput.current?.focus();
      } else {
        const expected = `/api/auth/line/start?signup=1&draft=${encodeURIComponent(draftId)}`;
        if (result.next !== expected) throw new Error('登録を最初からやり直してください。');
        navigating = true;
        window.location.assign(expected);
      }
    } catch (cause) {
      if (pending.current !== controller) return;
      const message = controller.signal.aborted ? '通信を確認できませんでした。少し待って再試行してください。' : cause instanceof Error ? cause.message : '通信できませんでした。';
      if (action === 'google') setError(message); else setLineError(message);
    } finally {
      window.clearTimeout(timer);
      if (pending.current === controller && !navigating) { pending.current = null; setBusyAction(null); }
    }
  }

  function cancelLine() {
    pending.current?.abort();
    pending.current = null;
    setBusyAction(null);
    setDraftId('');
    setCode('');
    setLineError('');
    setStatus('LINE登録を中断しました。入力内容を確認して、もう一度お進みいただけます。');
    window.setTimeout(() => nameInput.current?.focus(), 0);
  }

  return <main className="meeting-page meeting-survey meeting-signup tasuki-signup">
    <header className="meeting-hiru-brand"><strong>{serviceName}</strong><small>仕事でつながる会員サービス</small></header>
    <h1>あなたの得意を、<br />次の仕事へ。</h1>
    <section className="meeting-signup-form">
      <h2>新規会員登録</h2>
      <p className="meeting-auth-legal">{line.signup ? 'GoogleまたはLINEで登録できます。' : 'Googleアカウントで登録できます。'}招待コードは必要ありません。</p>
      <p className="meeting-auth-legal">① 本人認証 → ② プロフィールを入力 → ③ 利用開始<br />{line.signup ? 'Google登録では追加の入力は不要です。LINE登録では先にお名前とメールアドレスを入力します。会社名・業種などは登録後に設定できます。' : `お名前・会社名・業種などは、登録後の${serviceName}内で一度だけ入力します。`}</p>
      <fieldset disabled={busy || !!draftId} className="meeting-registration-profile">
        <label className="meeting-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span><a href="/terms" target="_blank" rel="noreferrer">利用規約</a>・<a href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>に同意して登録します。</span></label>
      </fieldset>
      {error && <p role="alert" className="meeting-auth-error">{error}</p>}
      <button type="button" className="meeting-google" disabled={!consent || busy} onClick={() => void run('google')}><GoogleMark />{busyAction === 'google' ? '確認中…' : 'Googleで登録'}</button>
      {line.signup && <section className="line-register-option" aria-labelledby="line-register-title">
        <h3 id="line-register-title">LINEで登録する方へ</h3>
        <p>メール確認のあと、LINEの画面で本人認証します。LINEからお名前・メールアドレスは取得しません。</p>
        {!draftId ? <form onSubmit={event => { event.preventDefault(); void run('request'); }}>
          <fieldset disabled={busy}>
            <legend>登録するお名前とメールアドレス</legend>
            <label htmlFor="line-register-name">お名前（必須）<input id="line-register-name" ref={nameInput} autoComplete="name" value={name} maxLength={120} required onChange={event => setName(event.target.value)} /></label>
            <label htmlFor="line-register-email">メールアドレス（必須）<input id="line-register-email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} maxLength={254} required onChange={event => setEmail(event.target.value)} /></label>
            <label className="meeting-consent"><input type="checkbox" checked={lineConsent} onChange={event => setLineConsent(event.target.checked)} /><span>{LINE_DATA_DISCLOSURE}</span></label>
            <label className="meeting-consent"><input type="checkbox" checked={mailConsent} onChange={event => setMailConsent(event.target.checked)} /><span>登録メールでメッセージ・オファー・おすすめ案件のお知らせを受け取る（任意）。希望しない場合も登録できます。</span></label>
          </fieldset>
          <button type="submit" className="line-button" disabled={!consent || !lineConsent || busy || remaining > 0}>{busyAction === 'request' ? '確認コードを送信中…' : remaining > 0 ? `${remaining}秒後に再送できます` : 'LINE登録の確認コードを送る'}</button>
        </form> : <form onSubmit={event => { event.preventDefault(); void run('verify'); }}>
          <p>入力したメールアドレス<br /><strong style={{ overflowWrap: 'anywhere' }}>{email.trim()}</strong></p>
          <label htmlFor="line-register-code">メールの6桁の確認コード<input id="line-register-code" ref={codeInput} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} required disabled={busy} aria-describedby="line-code-help" onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
          <p id="line-code-help">コードは10分間有効です。入力後にLINEの本人認証へ進みます。この時点ではまだ会員登録されません。</p>
          <button type="submit" className="line-button" disabled={busy || !/^\d{6}$/.test(code)}>{busyAction === 'verify' ? '確認中…' : 'メールを確認してLINEへ進む'}</button>
          <div className="meeting-auth-actions" style={{ flexWrap: 'wrap', gap: 8 }}><button type="button" disabled={busy || remaining > 0} onClick={() => void run('request')}>{busyAction === 'request' ? '再送中…' : remaining > 0 ? `${remaining}秒後に再送できます` : '確認コードを再送する'}</button></div>
        </form>}
        {lineError && <p role="alert" className="meeting-auth-error">{lineError}</p>}
        {status && <p role="status">{status}</p>}
        {(draftId || (busyAction !== null && busyAction !== 'google')) && <div className="meeting-auth-actions"><button type="button" onClick={cancelLine}>LINE登録を中断・入力し直す</button></div>}
        <p>既存アカウントとは自動で統合しません。登録済みのメールアドレスは<a href="/login/member">ログイン画面</a>からお進みください。</p>
      </section>}
      <p className="meeting-auth-legal">{line.login ? '登録済みの方は、登録時のGoogleアカウントまたは連携済みのLINEでログインしてください。' : '登録済みの方は、同じGoogleアカウントでお進みください。'}<br /><a href="/login/member">ログインはこちら</a></p>
      <a href="/login">サービス紹介へ戻る</a>
    </section>
  </main>;
}
