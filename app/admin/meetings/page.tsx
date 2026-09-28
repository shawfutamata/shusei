import { isAdminEmail } from '@/app/admin-auth';
import { getAppAccess } from '@/app/app-auth';
import LoginForm from '@/app/login/LoginForm';
import BrandMark from '@/app/BrandMark';
import Link from 'next/link';
import '@/app/login/welcome.css';
import MeetingAdmin from './MeetingAdmin';
import '@/app/meeting/meeting.css';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const access = await getAppAccess();
  if (!access) return <LoginForm standalone purpose="admin" returnTo="/admin/meetings" />;
  if (!isAdminEmail(access.user.email)) return (
    <main className="member-login-page">
      <header><Link className="welcome-brand" href="/login"><BrandMark /><span>TASUKI</span></Link><Link href="/">会員画面へ戻る</Link></header>
      <section className="member-login-shell">
        <div className="signin-card">
          <BrandMark /><h2>このアカウントでは管理画面を開けません</h2>
          <p>ログイン済み：<strong>{access.user.email}</strong></p>
          <p>運営用に登録されたGoogleアカウントを選択してください。</p>
          <a className="primary-button" href="/api/auth/google/start?return_to=%2Fadmin%2Fmeetings">別のGoogleアカウントでログイン</a>
        </div>
      </section>
    </main>
  );
  return <MeetingAdmin />;
}
