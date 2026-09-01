import { getAppAccess } from './app-auth';
import { isAdminEmail } from './admin-emails';

// 誰が運営かの判定は app/admin-emails.ts が持つ。**唯一の情報源。**
// ここから import が輪にならないよう、判定だけを外に出してある。
export { adminEmails, isAdminEmail } from './admin-emails';

/**
 * 管理画面に入れる人かどうか。
 *
 * **`ADMIN_EMAILS` が空なら、誰も入れない。** 設定を忘れたときに素通りする
 * ほうが、機能が使えないより危ない。開けるほうを既定にしない。
 *
 * 入口は会員と同じGoogleログイン。管理用のパスワードは作らない。
 * 増やせば、それだけ漏れる口が増えるため。
 */
export async function getAdmin() {
  const access = await getAppAccess();
  if (!access || !isAdminEmail(access.user.email)) return null;
  return access.user;
}
