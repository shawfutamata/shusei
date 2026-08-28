import BoardClient from './BoardClient';
import { getAppAccess } from './app-auth';
import { chatGPTSignInPath } from './chatgpt-auth';
import { getBoardData } from '@/db/data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const access = await getAppAccess();
  if (!access) {
    return <main className="signin-page"><div className="signin-card"><span className="brand-mark">G</span><p className="eyebrow">MEMBERS ONLY</p><h1>GIVE HUB</h1><h2>紹介から、商売が生まれる。</h2><p>守成クラブの仲間同士で「こんな人を探しています」を共有し、信頼できる紹介を届ける会員向け掲示板です。</p><a className="primary-button" href={chatGPTSignInPath('/')}>ChatGPTでログインして始める</a><small>投稿・紹介はログインした会員名で記録されます</small></div></main>;
  }
  if (!access.membership.canUseApp) {
    return <main className="signin-page"><div className="signin-card"><span className="brand-mark">G</span><p className="eyebrow">MEMBERS ONLY</p><h1>GIVE HUB</h1><h2>まだ利用権限がありません。</h2><p>{access.user.email} は会員として登録されていないか、現在利用権限が停止しています。ご入会手続きや状態のご確認は運営窓口までお問い合わせください。</p><small>登録済みの会員メールアドレスでログインし直すと利用できます</small></div></main>;
  }
  const { requests, stats } = await getBoardData(access.user);
  return <BoardClient initialRequests={requests} initialStats={stats} userName={access.user.displayName} />;
}
