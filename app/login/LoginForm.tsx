'use client';

import Welcome from './Welcome';
import BrandMark from '../BrandMark';
import LegalLinks from '../LegalLinks';

export default function LoginForm({ initialMessage = '', standalone = false, returnTo = '/', purpose = 'member' }: { initialMessage?: string; standalone?: boolean; returnTo?: string; purpose?: 'member' | 'admin' }) {
  const googleReturn = standalone ? returnTo : '/';
  const form = <section className="signin-card"><BrandMark /><p className="eyebrow">{purpose === 'admin' ? 'OPERATIONS' : '会員ログイン'}</p><h2>{purpose === 'admin' ? '運営ログイン' : '会員ログイン'}</h2><p>{purpose === 'admin' ? '運営用として登録されたメールアドレスのGoogleアカウントでログインしてください。ログイン後、この管理画面に戻ります。' : '登録したメールアドレスと同じGoogleアカウントでログインしてください。'}</p><a className="primary-button google-button" href={`/api/auth/google/start?return_to=${encodeURIComponent(googleReturn)}`}><GoogleMark />Googleでログイン</a>{!!initialMessage && <p className="login-message" role="status">{initialMessage}</p>}{purpose === 'member' && <section className="login-registration" aria-label="新規登録のご案内"><h3>初めてTASUKIを使う方へ</h3><p>こちらは登録済みの方のログイン画面です。</p><a className="secondary-link" href="/register">無料アカウントを作成 →</a><p>Googleアカウントで登録できます。<br />新規登録は、本人認証後すぐに利用できます。</p></section>}<small>{purpose === 'admin' ? '運営用アカウントでログインできない場合は運営窓口へお問い合わせください。' : '登録済みで利用できない方：登録したメールアドレスのGoogleアカウントがない場合や、運営確認待ちの場合は運営窓口へお問い合わせください。'}</small><LegalLinks /></section>;

  if (standalone) return <main className="member-login-page"><header><a href="/login" className="welcome-brand"><BrandMark /><span>TASUKI</span></a><a href="/login">サービス紹介へ戻る</a></header><section className="member-login-shell">{form}</section></main>;
  return <Welcome initialMessage={initialMessage}>{form}</Welcome>;
}

export function GoogleMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" /><path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C7.9 41 15.4 46 24 46z" /><path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.3-5.7z" /><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" /></svg>;
}
