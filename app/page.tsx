import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import BoardClient from './BoardClient';
import { getAppAccess } from './app-auth';
import { serviceName } from './brand';
import { getBoardData } from '@/db/data';
import BrandMark from './BrandMark';
import LegalLinks from './LegalLinks';
import LandingPage from './LandingPage';

export const metadata = { alternates: { canonical: 'https://tasuki.club/lp' } };

export const dynamic = 'force-dynamic';

const loginErrors: Record<string, string> = {
  notmember: 'そのGoogleアカウントのメールアドレスは、会員として登録されていません。ご登録のメールアドレスでログインするか、運営窓口へお問い合わせください。',
  denied: 'このアカウントには現在利用権限がありません。運営窓口へお問い合わせください。',
  failed: 'ログインを完了できませんでした。お手数ですが、もう一度お試しください。',
  unconfigured: 'ただいまログインをご利用いただけません。運営窓口へお問い合わせください。',
  pending: '登録を受け付けました。もう一度ログインしてください。うまくいかない場合は運営窓口へお知らせください。',
};

export default async function Home({ searchParams }: { searchParams: Promise<{ login?: string; ad?: string }> }) {
  // admin.tasuki.club は同じWorkerが受ける。管理画面の入口として使うので、
  // その名前で来た人は掲示板ではなく /admin へ送る。
  // **入れるかどうかは /admin 側でメールを見て決める。** ここは道案内だけ。
  const host = (await headers()).get('host') ?? '';
  if (host.split(':')[0].startsWith('admin.')) redirect('/admin');

  const access = await getAppAccess();
  if (!access) {
    const { login } = await searchParams;
    const error = login ? loginErrors[login] ?? loginErrors.failed : '';
    return <LandingPage error={error} pending={login === 'pending'} />;
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
