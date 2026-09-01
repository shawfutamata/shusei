import { env } from 'cloudflare:workers';

/**
 * 運営のアカウント。**ここが唯一の情報源。**
 *
 * `ADMIN_EMAILS` に書いたメールアドレスが、
 *
 * - 管理画面（/admin）に入れる人であり、
 * - **課金なしでスタンダード相当の機能を使える人**（app/effective-plan.ts）であり、
 * - ランクが最上位で固定される人（db/data.ts）
 *
 * でもある。以前は「マスターアカウント」を別の環境変数で持っていたが、
 * 同じことを2か所で決めていたため、**マイページはスタンダード、管理画面は無料**と
 * 食い違った。決める場所を1つにして、その食い違いを無くしてある。
 *
 * **空なら誰も当てはまらない。** 設定を忘れたときに素通りするほうが、
 * 機能が使えないより危ない。開けるほうを既定にしない。
 *
 * このファイルは**何も import しない**（`cloudflare:workers` を除く）。
 * db/data.ts からも app/admin-auth.ts からも読むので、間に何か挟むと
 * import が輪になって壊れるため。
 */
export function adminEmails() {
  return String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string) {
  const allowed = adminEmails();
  return allowed.length > 0 && allowed.includes(String(email || '').trim().toLowerCase());
}
