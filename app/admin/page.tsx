import { getAdmin } from '@/app/admin-auth';
import { adminAds, adminFeedback, adminMembers, adminRequests, adminSummary } from '@/db/admin';
import { serviceName } from '@/app/brand';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

/**
 * 運営用の管理画面。会員には出さない。
 *
 * 入れない人には**404を返す**（403ではなく）。「権限が無い」と返すと、
 * そこに管理画面があること自体を教えてしまう。
 */
export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) {
    return <main className="admin-locked">
      <div className="admin-locked-card">
        <p>404</p>
        <h1>ページが見つかりません</h1>
        <span>URLをご確認ください。</span>
        <a href="/api/auth/google/start">Googleでログイン</a>
      </div>
    </main>;
  }

  const [summary, members, requests, ads, feedback] = await Promise.all([
    adminSummary(), adminMembers(), adminRequests(), adminAds(), adminFeedback(),
  ]);
  return <AdminClient adminName={admin.displayName} adminEmail={admin.email} serviceName={serviceName}
    initial={{ summary, members, requests, ads, feedback }} />;
}
