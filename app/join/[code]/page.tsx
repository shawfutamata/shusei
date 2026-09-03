import Link from 'next/link';
import { serviceName } from '../../brand';
import { campaignUntilLabel, freeCampaign } from '../../campaign';
import { findInviterByCode } from '@/db/data';
import BrandMark from '../../BrandMark';
import LegalLinks from '../../LegalLinks';

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const inviter = await findInviterByCode(code);

  if (!inviter) {
    return <main className="signin-page"><div className="signin-card"><BrandMark /><p className="eyebrow">MEMBERS ONLY</p><h1>{serviceName}</h1><h2>この招待リンクは使えません。</h2><p>リンクの期限が切れているか、紹介者が会員でなくなっている可能性があります。お手数ですが、紹介者にもう一度リンクを送ってもらってください。</p><Link className="primary-button" href="/">トップへ</Link><LegalLinks /></div></main>;
  }

  return <main className="signin-page"><div className="signin-card">
    <BrandMark />
    <p className="eyebrow">INVITATION</p>
    <h1>{serviceName}</h1>
    <p className="invite-from"><b>{inviter.displayName}</b>さん<small>{inviter.company}</small></p>
    <h2>からのご招待です。</h2>
    <p>会員同士で「こんな人を探しています」を共有し、信頼できるオファーを届ける会員向け掲示板です。</p>
    {/* 会費の話は、参加を決める前に見えているほうがよい。あとから知ると
        「無料だと思っていた」になる。終わりの日も一緒に出す。 */}
    {!!freeCampaign.until && <p className="join-campaign"><b>いまは{freeCampaign.name}中です。</b>{campaignUntilLabel()}まで、すべての機能をお金をかけずにお使いいただけます。お申し込みもお支払いも要りません。</p>}
    <a className="primary-button google-button" href={`/api/auth/google/start?invite=${encodeURIComponent(code)}`}><GoogleMark />Googleで参加する</a>
    <small>ご登録後、運営が確認してからご利用いただけます。ふだんお使いのGoogleアカウントでどうぞ。</small>
  <LegalLinks /></div></main>;
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" /><path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C7.9 41 15.4 46 24 46z" /><path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.3-5.7z" /><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" /></svg>;
}
