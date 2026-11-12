import { env } from 'cloudflare:workers';
import { serviceName, serviceUrl } from '@/app/brand';
import { lineMessagingReady } from '@/app/line-auth';
import { ensureDatabase, getMembershipAccess } from './data';
import { checkLineAuthorization } from './line-authorization';

type NoticeKind = 'message' | 'offer';
type Outbox = { event_key: string; member_id: string; provider_id: string; line_user_id: string; consent_version: string; kind: NoticeKind; message_text: string; retry_key: string; attempts: number; created_at: number };
const MAX_AGE = 20 * 3600000; // LINEの再送キー保持期間（24時間）を超えて再送しない。
export async function sendLineNotice(memberId: string, kind: NoticeKind, eventKey: string) {
  if (!lineMessagingReady()) return;
  await ensureDatabase();
  const preference = kind === 'message' ? 'notify_message' : 'notify_offer';
  const summary = kind === 'message' ? '新しいメッセージが届きました。' : '新しいオファーが届きました。';
  const message = `${serviceName}に${summary}\n\n${serviceUrl}/?intro=1\n\n通知設定: ${serviceUrl}/settings/line`;
  await env.DB.prepare(`INSERT OR IGNORE INTO line_notification_outbox
    (event_key,member_id,provider_id,line_user_id,consent_version,kind,message_text,retry_key,available_at,created_at)
    SELECT ?,member_id,provider_id,line_user_id,consent_version,?,?,?,?,? FROM line_accounts
    WHERE member_id=? AND provider_id=? AND ${preference}=1`)
    .bind(eventKey, kind, message, crypto.randomUUID(), Date.now(), Date.now(), memberId, env.LINE_PROVIDER_ID).run();
  await dispatchLineNotice(eventKey);
}
async function dispatchLineNotice(eventKey: string) {
  if (!lineMessagingReady()) return false;
  const now = Date.now();
  // 同時実行はリースで1本に絞り、タイムアウト後も同じX-Line-Retry-Keyを使う。
  const row = await env.DB.prepare(`UPDATE line_notification_outbox SET status='sending',lease_until=?,attempts=attempts+1
    WHERE event_key=? AND ((status='pending' AND available_at<=?) OR (status='sending' AND lease_until<?))
      AND attempts<5 AND created_at>? RETURNING *`).bind(now + 60000, eventKey, now, now, now - MAX_AGE).first<Outbox>();
  if (!row) return false;
  const authorization = await checkLineAuthorization(row.member_id);
  if (authorization !== 'valid') {
    if (authorization === 'unavailable') await settleFailure(row, true, 'line_auth_unavailable');
    else await env.DB.prepare("UPDATE line_notification_outbox SET status='canceled',line_user_id='',provider_id='',consent_version='' WHERE event_key=?").bind(eventKey).run();
    return false;
  }
  const account = await env.DB.prepare(`SELECT notify_message,notify_offer FROM line_accounts
    WHERE member_id=? AND provider_id=? AND line_user_id=? AND consent_version=?`)
    .bind(row.member_id, row.provider_id, row.line_user_id, row.consent_version).first<{ notify_message: number; notify_offer: number }>();
  if (!account || !account[row.kind === 'message' ? 'notify_message' : 'notify_offer']
    || row.provider_id !== env.LINE_PROVIDER_ID || !(await getMembershipAccess(row.member_id)).canUseApp) {
    await env.DB.prepare("UPDATE line_notification_outbox SET status='canceled',line_user_id='',provider_id='',consent_version='' WHERE event_key=?").bind(eventKey).run();
    return false;
  }
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      // 予期しない転送先へMessaging tokenと宛先を渡さない。3xxは配信成功にしない。
      method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_TOKEN}`, 'content-type': 'application/json', 'X-Line-Retry-Key': row.retry_key },
      signal: AbortSignal.timeout(5000),
      // 通知のプレビューに相手の氏名・本文・取引条件を載せない。
      body: JSON.stringify({ to: row.line_user_id, messages: [{ type: 'text', text: row.message_text }] }),
    });
    if (response.ok || (response.status === 409 && response.headers.has('x-line-accepted-request-id'))) {
      await env.DB.prepare("UPDATE line_notification_outbox SET status='accepted',accepted_at=?,lease_until=0,last_error='',line_user_id='',provider_id='',consent_version='' WHERE event_key=?").bind(Date.now(), eventKey).run();
      return true;
    }
    const retry = response.status === 429 || response.status >= 500;
    await settleFailure(row, retry, `http_${response.status}`);
  } catch { await settleFailure(row, true, 'network'); }
  return false;
}
async function settleFailure(row: Outbox, retry: boolean, error: string) {
  const pending = retry && row.attempts < 5 && Date.now() - row.created_at < MAX_AGE;
  await env.DB.prepare("UPDATE line_notification_outbox SET status=?,last_error=?,lease_until=0,available_at=?,line_user_id=CASE WHEN ? THEN line_user_id ELSE '' END,provider_id=CASE WHEN ? THEN provider_id ELSE '' END,consent_version=CASE WHEN ? THEN consent_version ELSE '' END WHERE event_key=? AND status='sending'")
    .bind(pending ? 'pending' : 'failed', error, Date.now() + Math.min(3600000, 60000 * 2 ** row.attempts), pending ? 1 : 0, pending ? 1 : 0, pending ? 1 : 0, row.event_key).run();
}
export async function flushLineNotifications() {
  await cleanupLineTransientData();
  if (!lineMessagingReady()) return { enabled: false, attempted: 0, accepted: 0 };
  await ensureDatabase();
  await env.DB.prepare("UPDATE line_notification_outbox SET status='expired',line_user_id='',provider_id='',consent_version='' WHERE status IN ('pending','sending') AND (created_at<? OR attempts>=5)").bind(Date.now() - MAX_AGE).run();
  const rows = await env.DB.prepare(`SELECT event_key FROM line_notification_outbox WHERE (status='pending' AND available_at<=?) OR (status='sending' AND lease_until<?)
    ORDER BY created_at LIMIT 50`).bind(Date.now(), Date.now()).all<{ event_key: string }>();
  let accepted = 0;
  for (const row of rows.results) if (await dispatchLineNotice(row.event_key)) accepted++;
  return { enabled: true, attempted: rows.results.length, accepted };
}
export type LineWebhookEvent = { webhookEventId?: string; type?: string; timestamp?: number; source?: { type?: string; userId?: string } };
export async function processLineWebhook(events: LineWebhookEvent[]) {
  await ensureDatabase();
  for (const event of events) {
    // followは保存・利用しない。unfollowは利用者の通知停止として処理するだけで、友だち状態を持たない。
    if (!event || event.type !== 'unfollow' || event.source?.type !== 'user'
      || !/^U[0-9a-f]{32}$/.test(event.source.userId || '') || !Number.isSafeInteger(event.timestamp)
      || event.timestamp! > Date.now() + 60000 || event.timestamp! < 0) continue;
    const at = new Date(event.timestamp!).toISOString();
    // 再配信でも、後から本人が行った新しい通知同意を取り消さない。
    await env.DB.batch([
      env.DB.prepare(`UPDATE line_accounts SET notify_message=0,notify_offer=0,consent_at=?,consent_version=?
        WHERE provider_id=? AND line_user_id=? AND linked_at<=? AND consent_at<=?`)
        .bind(at, crypto.randomUUID(), env.LINE_PROVIDER_ID, event.source.userId!, at, at),
      env.DB.prepare(`UPDATE line_notification_outbox SET status='canceled',line_user_id='',provider_id='',consent_version=''
        WHERE status IN ('pending','sending') AND member_id IN (SELECT member_id FROM line_accounts
          WHERE provider_id=? AND line_user_id=? AND notify_message=0 AND notify_offer=0)`)
        .bind(env.LINE_PROVIDER_ID, event.source.userId!),
    ]);
  }
}
/** LINE由来の一時データを、本体APIと定期Workerの両方で片付ける。 */
export async function cleanupLineTransientData() {
  await ensureDatabase();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM line_oauth_flows WHERE expires_at<=?').bind(Date.now()),
    env.DB.prepare('DELETE FROM line_privacy_codes WHERE expires_at<=?').bind(Date.now()),
    env.DB.prepare('DELETE FROM line_privacy_grants WHERE expires_at<=?').bind(Date.now()),
    env.DB.prepare('DELETE FROM line_signup_drafts WHERE expires_at<=?').bind(Date.now()),
    env.DB.prepare('DELETE FROM line_sessions WHERE token_hash NOT IN (SELECT token_hash FROM mobile_sessions WHERE expires_at>?)').bind(new Date().toISOString()),
    env.DB.prepare('DELETE FROM line_webhook_events'),
    env.DB.prepare('UPDATE line_accounts SET friend=0,friend_updated_at=0 WHERE friend!=0 OR friend_updated_at!=0'),
    env.DB.prepare("UPDATE line_notification_outbox SET status='expired',line_user_id='',provider_id='',consent_version='' WHERE status IN ('pending','sending') AND created_at<?").bind(Date.now() - MAX_AGE),
    env.DB.prepare("UPDATE line_notification_outbox SET line_user_id='',provider_id='',consent_version='' WHERE status NOT IN ('pending','sending')"),
  ]);
}
