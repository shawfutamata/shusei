'use client';

import { useState } from 'react';
import { serviceName } from '../brand';
import BrandMark from '../BrandMark';
import LegalLinks from '../LegalLinks';

export default function LoginForm({ initialMessage = '' }: { initialMessage?: string }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialMessage);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (step === 'email') {
        await post('/api/auth/request-code', { email });
        setStep('code');
        setMessage('メールに届いた6桁を入力してください。');
      } else {
        await post('/api/auth/session', { email, code });
        window.location.href = '/';
        return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '処理できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  return <main className="signin-page"><form className="signin-card" onSubmit={submit}><BrandMark /><p className="eyebrow">MEMBERS ONLY</p><h1>{serviceName}</h1><h2>{step === 'email' ? 'ログイン' : '認証コードを入力'}</h2><p>{step === 'email' ? 'ご登録済みのGoogleアカウント、またはメールアドレスでログインできます。' : `${email} 宛に6桁のコードを送りました。10分以内に入力してください。`}</p>{step === 'email' && <><a className="primary-button google-button" href="/api/auth/google/start"><GoogleMark />Googleでログイン</a><div className="login-divider"><span>または</span></div></>}<label className="login-field"><span>{step === 'email' ? 'メールアドレス' : '認証コード'}</span>{step === 'email'
    ? <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
    : <input className="login-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required />}</label>{!!message && <p className="login-message">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? '処理しています…' : step === 'email' ? '認証コードを送る' : 'ログインする'}</button>{step === 'code' && <button type="button" className="login-back" onClick={() => { setStep('email'); setCode(''); setMessage(''); }}>メールアドレスを変更</button>}<small>登録済み会員専用です。ログインできない場合は運営窓口へお問い合わせください。</small><LegalLinks /></form></main>;
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" /><path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C7.9 41 15.4 46 24 46z" /><path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.3-5.7z" /><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" /></svg>;
}

async function post(path: string, body: Record<string, string>) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || '通信に失敗しました。');
  return data;
}
