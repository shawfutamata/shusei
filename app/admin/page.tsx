import { isAdminEmail } from '@/app/admin-auth';
import { getAppAccess } from '@/app/app-auth';
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
  // getAdmin() と同じ判定だが、入れなかったときに「誰として来ているか」を
  // 出したいので、ここでは access を手元に残す。
  const access = await getAppAccess();
  const admin = access && isAdminEmail(access.user.email) ? access.user : null;
  if (!admin) {
    return <main className="admin-locked">
      <div className="admin-locked-card">
        <p>404</p>
        <h1>ページが見つかりません</h1>
        <span>URLをご確認ください。</span>
        {/* ログインしている人には、そのアドレスだけを出す。自分のアドレスを
            自分に見せるだけなので何も漏れないが、**管理画面に入れないときの
            原因がほぼこれ**（別のGoogleアカウントで入っている／ADMIN_EMAILS の
            綴りが違う）なので、ここで気づけるようにしておく。
            「権限がありません」とは書かない。それを書くと、ここに管理画面が
            あること自体を教えてしまう。 */}
        {access && <small className="admin-locked-who">いま <b>{access.user.email}</b> でログイン中です。</small>}
        <a href="/api/auth/google/start?return_to=%2Fadmin">Googleでログイン</a>
      </div>
    </main>;
  }

  const [summary, members, requests, ads, feedback] = await Promise.all([
    adminSummary(), adminMembers(), adminRequests(), adminAds(), adminFeedback(),
  ]);
  return <AdminClient adminName={admin.displayName} adminEmail={admin.email} serviceName={serviceName}
    initial={{ summary, members, requests, ads, feedback }} />;
}
