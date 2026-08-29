import BoardClient from './BoardClient';
import { getAppAccess } from './app-auth';
import { serviceName } from './brand';
import { getBoardData } from '@/db/data';
import BrandMark from './BrandMark';
import LegalLinks from './LegalLinks';

export const dynamic = 'force-dynamic';

const loginErrors: Record<string, string> = {
  notmember: 'そのGoogleアカウントのメールアドレスは、会員として登録されていません。ご登録のメールアドレスでログインするか、運営窓口へお問い合わせください。',
  denied: 'このアカウントには現在利用権限がありません。運営窓口へお問い合わせください。',
  failed: 'ログインを完了できませんでした。お手数ですが、もう一度お試しください。',
  unconfigured: 'ただいまログインをご利用いただけません。運営窓口へお問い合わせください。',
  pending: '登録を受け付けました。運営が確認したうえでご案内しますので、少しお待ちください。',
};

export default async function Home({ searchParams }: { searchParams: Promise<{ login?: string; ad?: string }> }) {
  const access = await getAppAccess();
  if (!access) {
    const { login } = await searchParams;
    const error = login ? loginErrors[login] ?? loginErrors.failed : '';
    return <main className="signin-page"><div className="signin-card"><BrandMark /><p className="eyebrow">MEMBERS ONLY</p><h1>{serviceName}</h1><h2>紹介から、商売が生まれる。</h2><p>守成クラブの仲間同士で「こんな人を探しています」を共有し、信頼できる紹介を届ける会員向け掲示板です。</p>{!!error && <p className={login === 'pending' ? 'login-message' : 'login-error'}>{error}</p>}<a className="primary-button google-button" href="/api/auth/google/start"><GoogleMark />Googleでログイン</a><small>守成クラブに登録済みのメールアドレスのGoogleアカウントでログインしてください</small><LegalLinks /></div></main>;
  }
  if (!access.membership.canUseApp) {
    return <main className="signin-page"><div className="signin-card"><BrandMark /><p className="eyebrow">MEMBERS ONLY</p><h1>{serviceName}</h1><h2>まだ利用権限がありません。</h2><p>{access.user.email} は会員として登録されていないか、現在利用権限が停止しています。ご入会手続きや状態のご確認は運営窓口までお問い合わせください。</p><small>登録済みの会員メールアドレスでログインし直すと利用できます</small><LegalLinks /></div></main>;
  }
  const { requests, stats, ads } = await getBoardData(access.user);
  // 出稿枠の決済から戻ってきたかどうか。開く画面をサーバー側で決めておく。
  const { ad } = await searchParams;
  const adReturn = ad === 'done' || ad === 'cancel' ? ad : '';
  return <BoardClient initialRequests={requests} initialStats={stats} initialAds={ads} userName={access.user.displayName} adReturn={adReturn} />;
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" /><path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C7.9 41 15.4 46 24 46z" /><path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.3-5.7z" /><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" /></svg>;
}
