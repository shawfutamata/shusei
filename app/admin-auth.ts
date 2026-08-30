import { env } from 'cloudflare:workers';
import { getAppAccess } from './app-auth';

/**
 * 管理画面に入れる人かどうか。
 *
 * **`ADMIN_EMAILS` が空なら、誰も入れない。** 設定を忘れたときに素通りする
 * ほうが、機能が使えないより危ない。開けるほうを既定にしない。
 *
 * 入口は会員と同じGoogleログイン。管理用のパスワードは作らない。
 * 増やせば、それだけ漏れる口が増えるため。
 */
export function adminEmails() {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  const allowed = adminEmails();
  return allowed.length > 0 && allowed.includes(email.trim().toLowerCase());
}

/**
 * 管理画面とその操作の入口。**すべての管理APIの先頭で必ず呼ぶ。**
 * 画面を出し分けるだけでは、URLを直接叩かれたときに守れない。
 */
export async function getAdmin() {
  const access = await getAppAccess();
  if (!access || !isAdminEmail(access.user.email)) return null;
  return access.user;
}
