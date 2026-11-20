import { env } from 'cloudflare:workers';
import { getAppAccess } from './app-auth';
import { lineRecoveryReady } from './line-auth';
import { serviceName } from './brand';

// 別の承認案件。旧2通テストの台帳を再開・流用しない。設定変更でも予算は増えない。
export const ONE_NOTICE_ID = 'tasuki-owner-one-notice-20261120-v1';
export const ONE_NOTICE_TEXT = `${serviceName}の本人限定テスト通知です。他の会員には送信していません。`;
export function oneNoticeWindow() { return `${env.LINE_ONE_NOTICE_STARTED_AT}|${env.LINE_ONE_NOTICE_EXPIRES_AT}`; }
export function oneNoticeOwnerSelected(id: string) {
  const owner = env.LINE_ONE_NOTICE_MEMBER_ID || '';
  return Boolean(owner && owner.length <= 200 && !/[\s\u0000-\u001f]/.test(owner) && owner === id)
    && ['LINE_DATA_POLICY_READY', 'LINE_LOGIN_ENABLED', 'LINE_SIGNUP_ENABLED', 'LINE_NOTIFICATIONS_ENABLED', 'ACCOUNT_ERASURE_ENABLED']
      .every(key => env[key as keyof Cloudflare.Env] === 'false');
}
export function oneNoticeReady(id: string, expectedWindow = oneNoticeWindow(), now = Date.now()) {
  const start = env.LINE_ONE_NOTICE_STARTED_AT || '', end = env.LINE_ONE_NOTICE_EXPIRES_AT || '';
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const from = Date.parse(start), until = Date.parse(end);
  return oneNoticeOwnerSelected(id) && expectedWindow === oneNoticeWindow()
    && iso.test(start) && iso.test(end) && Number.isFinite(from) && Number.isFinite(until)
    && new Date(from).toISOString() === start && new Date(until).toISOString() === end
    && from <= now && now < until && until > from && until - from <= 2 * 60 * 60 * 1000
    && lineRecoveryReady() && Boolean(env.LINE_PROVIDER_ID && env.LINE_PROVIDER_ID === env.LINE_MESSAGING_PROVIDER_ID)
    && /^[A-Za-z0-9._~+/-]+=*$/.test(env.LINE_MESSAGING_CHANNEL_TOKEN || '')
    && Boolean(env.LINE_MESSAGING_CHANNEL_SECRET) && /^U[0-9a-f]{32}$/.test(env.LINE_BOT_USER_ID || '');
}
export async function getOneNoticeOwner() {
  const access = await getAppAccess();
  return access?.membership.canUseApp && oneNoticeOwnerSelected(access.user.userId) ? access.user : null;
}
