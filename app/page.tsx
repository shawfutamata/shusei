import BoardClient from './BoardClient';
import { chatGPTSignInPath, getChatGPTUser } from './chatgpt-auth';
import { getBoardData } from '@/db/data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="signin-page"><div className="signin-card"><span className="brand-mark">G</span><p className="eyebrow">MEMBERS ONLY</p><h1>GIVE HUB</h1><h2>紹介から、商売が生まれる。</h2><p>守成クラブの仲間同士で「こんな人を探しています」を共有し、信頼できる紹介を届ける会員向け掲示板です。</p><a className="primary-button" href={chatGPTSignInPath('/')}>ChatGPTでログインして始める</a><small>投稿・紹介はログインした会員名で記録されます</small></div></main>;
  }
  const { requests, stats } = await getBoardData(user);
  return <BoardClient initialRequests={requests} initialStats={stats} userName={user.displayName} />;
}
