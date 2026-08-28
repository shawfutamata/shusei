'use client';

import { useState } from 'react';
import { serviceMark, serviceName } from '../brand';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

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

  return <main className="signin-page"><form className="signin-card" onSubmit={submit}><span className="brand-mark">{serviceMark}</span><p className="eyebrow">MEMBERS ONLY</p><h1>{serviceName}</h1><h2>{step === 'email' ? 'メールアドレスでログイン' : '認証コードを入力'}</h2><p>{step === 'email' ? '守成クラブに登録済みのメールアドレスを入力してください。6桁の認証コードをお送りします。' : `${email} 宛に6桁のコードを送りました。10分以内に入力してください。`}</p><label className="login-field"><span>{step === 'email' ? 'メールアドレス' : '認証コード'}</span>{step === 'email'
    ? <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
    : <input className="login-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required />}</label>{!!message && <p className="login-message">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? '処理しています…' : step === 'email' ? '認証コードを送る' : 'ログインする'}</button>{step === 'code' && <button type="button" className="login-back" onClick={() => { setStep('email'); setCode(''); setMessage(''); }}>メールアドレスを変更</button>}<small>登録済み会員専用です。ログインできない場合は運営窓口へお問い合わせください。</small></form></main>;
}

async function post(path: string, body: Record<string, string>) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(data.error || '通信に失敗しました。');
  return data;
}
