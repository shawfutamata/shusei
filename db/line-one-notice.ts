import { env } from 'cloudflare:workers';
import { ONE_NOTICE_ID, ONE_NOTICE_TEXT, oneNoticeReady, oneNoticeOwnerSelected, oneNoticeWindow } from '@/app/line-one-notice';
import { ensureDatabase, getMembershipAccess } from './data';
import { checkLineAuthorization } from './line-authorization';

type Identity = { subject: string; linked_at: string; revision: string };
type Budget = { status: 'unknown' | 'accepted' | 'failed'; closed: number };
async function owner(id: string) {
  if (!oneNoticeOwnerSelected(id) || !(await getMembershipAccess(id)).canUseApp) throw new Error('unavailable');
  await ensureDatabase();
}
async function identity(id: string) {
  return env.DB.prepare(`SELECT a.line_user_id subject,a.linked_at,t.revision FROM line_accounts a
    JOIN line_authorizations t ON t.member_id=a.member_id AND t.provider_id=a.provider_id AND t.subject=a.line_user_id
    WHERE a.member_id=? AND a.provider_id=? AND t.channel_id=? AND t.status='active'
    AND t.expires_at>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)`)
    .bind(id, env.LINE_PROVIDER_ID, env.LINE_LOGIN_CHANNEL_ID).first<Identity>();
}
const budget = () => env.DB.prepare('SELECT status,closed FROM line_one_notice_budget WHERE test_id=?').bind(ONE_NOTICE_ID).first<Budget>();
export async function getOneNoticeStatus(id: string) {
  await owner(id);
  const row = await budget();
  return { status: row?.status || 'unused', closed: Boolean(row?.closed), ready: oneNoticeReady(id) && !row && Boolean(await identity(id)), window: oneNoticeWindow() };
}
export async function closeOneNotice(id: string) {
  await owner(id);
  // 本人ID・LINE ID・tokenは台帳に保存しない。閉鎖記録だけ残し再送を防ぐ。
  await env.DB.prepare(`INSERT INTO line_one_notice_budget(test_id,status,closed) VALUES(?,'unknown',1)
    ON CONFLICT(test_id) DO UPDATE SET closed=1`).bind(ONE_NOTICE_ID).run();
  return getOneNoticeStatus(id);
}
export async function sendOneNotice(id: string, window: string) {
  await owner(id);
  if (!oneNoticeReady(id, window)) throw new Error('unavailable');
  if (await budget()) return getOneNoticeStatus(id);
  const before = await identity(id);
  if (!before || !/^U[0-9a-f]{32}$/.test(before.subject) || await checkLineAuthorization(id) !== 'valid') throw new Error('authorization');
  await owner(id);
  if (!oneNoticeReady(id, window)) throw new Error('expired');
  const current = await identity(id);
  if (!current || current.subject !== before.subject || current.revision !== before.revision || current.linked_at !== before.linked_at) throw new Error('changed');
  // 原子的な一度きりの消費。失敗・不明・中断も消費済みのまま。削除/再連携でも戻さない。
  const claimed = await env.DB.prepare(`INSERT OR IGNORE INTO line_one_notice_budget(test_id,status,closed)
    VALUES(?,'unknown',0) RETURNING test_id`).bind(ONE_NOTICE_ID).first();
  if (!claimed) return getOneNoticeStatus(id);
  let result: Budget['status'] = 'failed';
  try {
    await owner(id);
    const latest = await identity(id), row = await budget();
    if (row && !row.closed && latest && latest.subject === before.subject && latest.revision === before.revision && latest.linked_at === before.linked_at && oneNoticeReady(id, window)) {
      result = 'unknown';
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
        headers: { authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_TOKEN}`, 'content-type': 'application/json', 'X-Line-Retry-Key': crypto.randomUUID() },
        body: JSON.stringify({ to: before.subject, messages: [{ type: 'text', text: ONE_NOTICE_TEXT }] }),
      });
      result = response.status === 200 ? 'accepted' : response.status >= 400 && response.status < 500 ? 'failed' : 'unknown';
    }
  } catch { /* 実際に届いたか不明でも再送しない。 */ }
  await env.DB.prepare('UPDATE line_one_notice_budget SET status=? WHERE test_id=?').bind(result, ONE_NOTICE_ID).run();
  return getOneNoticeStatus(id);
}
