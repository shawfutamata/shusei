import { env } from 'cloudflare:workers';
import { lineRecoveryReady } from './line-auth';

// 本人が承認した一度きりの限定試験。設定変更で送信枠を増やさない。
export const LINE_TEST_ID = 'tasuki-owner-line-test-v1';
export function lineTestOwnerSelected(memberId: string): boolean {
  const owner = env.LINE_TEST_MEMBER_ID || '';
  return Boolean(owner && owner.length <= 200 && !/[\s\u0000-\u001f]/.test(owner) && owner === memberId)
    && ['LINE_DATA_POLICY_READY', 'LINE_LOGIN_ENABLED', 'LINE_SIGNUP_ENABLED', 'LINE_NOTIFICATIONS_ENABLED', 'ACCOUNT_ERASURE_ENABLED']
      .every(key => env[key as keyof Cloudflare.Env] === 'false');
}
export function lineTestReadyForMember(memberId: string): boolean {
  return lineTestOwnerSelected(memberId) && lineRecoveryReady()
    && Boolean(env.LINE_PROVIDER_ID && env.LINE_MESSAGING_PROVIDER_ID === env.LINE_PROVIDER_ID)
    && /^[A-Za-z0-9._~+/-]+=*$/.test(env.LINE_MESSAGING_CHANNEL_TOKEN || '')
    && Boolean(env.LINE_MESSAGING_CHANNEL_SECRET)
    && /^U[0-9a-f]{32}$/.test(env.LINE_BOT_USER_ID || '')
    && /^@[A-Za-z0-9._-]{1,100}$/.test(env.LINE_OFFICIAL_ACCOUNT_ID || '');
}
