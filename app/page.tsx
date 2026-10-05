import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import BoardClient from './BoardClient';
import { getAppAccess } from './app-auth';
import { serviceName } from './brand';
import { getBoardData } from '@/db/data';
import BrandMark from './BrandMark';
import LegalLinks from './LegalLinks';
import { isAdminEmail } from './admin-auth';
import {memberLoginPath} from './auth-return';
import { recordProductEvent } from '@/db/product-events';

export const metadata = {
  alternates: { canonical: 'https://tasuki.club/' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ login?: string; ad?: string; tab?: string; contact?:string; member?:string; action?:string; meeting?:string }> }) {
  // admin.tasuki.club は同じWorkerが受ける。管理画面の入口として使うので、
  // その名前で来た人は掲示板ではなく /admin へ送る。
  // **入れるかどうかは /admin 側でメールを見て決める。** ここは道案内だけ。
  const host = (await headers()).get('host') ?? '';
  if (host.split(':')[0].startsWith('admin.')) redirect('/admin');

  const access = await getAppAccess();
  if (!access) {
    const { login, tab, contact, member, action, meeting } = await searchParams;
    const target=contact?`/?contact=${encodeURIComponent(contact)}`:member?`/?member=${encodeURIComponent(member)}`:action==='post'?`/?action=post${meeting?'&meeting='+encodeURIComponent(meeting):''}`:'';
    if(target)redirect(memberLoginPath(target));
    if (login) redirect(`/login?login=${encodeURIComponent(login)}`);
    if (tab === 'survey') redirect(`/login/member?return_to=${encodeURIComponent('/?tab=survey')}`);
    redirect('/login');
  }
  if (!access.membership.canUseApp) {
    return <main className="signin-page"><div className="signin-card"><BrandMark /><p className="eyebrow">MEMBERS ONLY</p><h1>{serviceName}</h1><h2>まだ利用権限がありません。</h2><p>{access.user.email} は会員として登録されていないか、現在利用権限が停止しています。ご入会手続きや状態のご確認は運営窓口までお問い合わせください。</p><small>登録済みの会員メールアドレスでログインし直すと利用できます</small><LegalLinks /></div></main>;
  }
  const { requests, stats, ads } = await getBoardData(access.user);
  await recordProductEvent(access.user.userId, 'tasuki_opened').catch(() => console.error('Product visit could not be recorded'));
  // 出稿枠の決済から戻ってきたかどうか。開く画面をサーバー側で決めておく。
  const { ad, tab, contact, member, action } = await searchParams;
  const adReturn = ad === 'done' || ad === 'cancel' ? ad : '';
  const initialTab = tab === 'survey' ? 'survey' : contact||member||action==='post' ? 'home' : undefined;
  const target=contact||member||'';
  const validTarget=target.length<=160&&/^[a-zA-Z0-9_-]+$/.test(target);
  const initialMemberId=!contact&&validTarget?member||'':'';
  const initialPost=!validTarget&&action==='post';
  return <BoardClient initialMemberId={initialMemberId} initialPost={initialPost} canManageMeetings={isAdminEmail(access.user.email)} initialRequests={requests} initialStats={stats} initialAds={ads} userName={access.user.displayName} adReturn={adReturn} initialTab={initialTab} />;
}
