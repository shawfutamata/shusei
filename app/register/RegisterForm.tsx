'use client';

import { useRef, useState } from 'react';
import { GoogleMark } from '@/app/login/LoginForm';
import { serviceName } from '@/app/brand';

export default function RegisterForm({ invite, initialMessage = '' }: { invite: string; initialMessage?: string }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage);
  const submitting = useRef(false);

  async function go() {
    if (submitting.current || !consent) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'draft', consent, invite }),
      });
      const result = await response.json() as { draft?: string; error?: string };
      if (!response.ok || !result.draft) throw new Error(result.error || '登録できませんでした。');
      window.location.assign(`/api/auth/google/start?signup=1&draft=${encodeURIComponent(result.draft)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '通信できませんでした。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className="meeting-page meeting-survey meeting-signup tasuki-signup">
    <header className="meeting-hiru-brand"><strong>{serviceName}</strong><small>仕事でつながる会員サービス</small></header>
    <h1>あなたの得意を、<br />次の仕事へ。</h1>
    <section className="meeting-signup-form">
      <h2>新規会員登録</h2>
      <p className="meeting-auth-legal">Googleアカウントで登録できます。招待コードは必要ありません。</p>
      <p className="meeting-auth-legal">① Googleで本人認証 → ② プロフィールを入力 → ③ 利用開始<br />お名前・会社名・業種などは、登録後の{serviceName}内で一度だけ入力します。</p>
      <fieldset disabled={busy} className="meeting-registration-profile">
        <label className="meeting-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span><a href="/terms" target="_blank" rel="noreferrer">利用規約</a>・<a href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>に同意して登録します。</span></label>
      </fieldset>
      {error && <p role="alert" className="meeting-auth-error">{error}</p>}
      <button type="button" className="meeting-google" disabled={!consent || busy} onClick={() => void go()}><GoogleMark />{busy ? '確認中…' : 'Googleで登録'}</button>
      <p className="meeting-auth-legal">登録済みの方は、同じGoogleアカウントでお進みください。<br /><a href="/login/member">ログインはこちら</a></p>
      <a href="/login">サービス紹介へ戻る</a>
    </section>
  </main>;
}
