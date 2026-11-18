import { env } from 'cloudflare:workers';
import { getAppAccess } from './app-auth';
import { lineRecoveryReady } from './line-auth';

export const LINE_LINK_CHECK_PATH = '/settings/line/check';
// 今回承認された接続確認だけ。旧通知試験のID・台帳・送信枠には触れない。
export function lineLinkCheckReady(memberId: string, now = Date.now()): boolean {
  const owner = env.LINE_LINK_CHECK_MEMBER_ID || '';
  const start = env.LINE_LINK_CHECK_STARTED_AT || '', end = env.LINE_LINK_CHECK_EXPIRES_AT || '';
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const from = Date.parse(start), until = Date.parse(end);
  return Boolean(owner && owner.length <= 200 && !/[\s\u0000-\u001f]/.test(owner) && owner === memberId)
    && iso.test(start) && iso.test(end) && Number.isFinite(from) && Number.isFinite(until)
    && new Date(from).toISOString() === start && new Date(until).toISOString() === end
    && from <= now && now < until && until > from && until - from <= 24 * 60 * 60 * 1000
    && ['LINE_DATA_POLICY_READY', 'LINE_LOGIN_ENABLED', 'LINE_SIGNUP_ENABLED', 'LINE_NOTIFICATIONS_ENABLED', 'ACCOUNT_ERASURE_ENABLED']
      .every(key => env[key as keyof Cloudflare.Env] === 'false')
    && lineRecoveryReady();
}
export function lineLinkCheckWindow() {
  return `${env.LINE_LINK_CHECK_STARTED_AT}|${env.LINE_LINK_CHECK_EXPIRES_AT}`;
}
export async function getLineLinkCheckOwner() {
  const access = await getAppAccess();
  return access?.membership.canUseApp && lineLinkCheckReady(access.user.userId) ? access.user : null;
}
