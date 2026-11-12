import { env } from 'cloudflare:workers';
import { LINE_TEST_ID, lineTestReadyForMember } from '@/app/line-test-config';
import { ensureDatabase, getMembershipAccess } from './data';
import { checkLineAuthorization } from './line-authorization';

type SlotStatus = 'unused' | 'accepted' | 'unknown' | 'failed';
type Budget = { owner_member_id: string; linked_at: string; authorization_revision: string; closed: number; slot1: SlotStatus; slot2: SlotStatus; retry1: string; retry2: string };
type Identity = { subject: string; linked_at: string; revision: string };
async function owner(memberId: string) {
  if (!lineTestReadyForMember(memberId)) throw new Error('line_test_unavailable');
  await ensureDatabase();
  if (!(await getMembershipAccess(memberId)).canUseApp) throw new Error('line_test_unavailable');
}
async function identity(memberId: string) {
  return env.DB.prepare(`SELECT a.line_user_id AS subject,a.linked_at,t.revision FROM line_accounts a
    JOIN line_authorizations t ON t.member_id=a.member_id AND t.provider_id=a.provider_id AND t.subject=a.line_user_id
    WHERE a.member_id=? AND a.provider_id=? AND t.channel_id=? AND t.status='active' AND t.expires_at>?`)
    .bind(memberId, env.LINE_PROVIDER_ID, env.LINE_LOGIN_CHANNEL_ID, Date.now()).first<Identity>();
}
async function budget() { return env.DB.prepare('SELECT * FROM line_test_budget WHERE test_id=?').bind(LINE_TEST_ID).first<Budget>(); }
function matches(row: Budget, memberId: string, id: Identity | null) {
  return Boolean(id && row.owner_member_id === memberId && row.linked_at === id.linked_at && row.authorization_revision === id.revision);
}
export async function getLineTestStatus(memberId: string) {
  await owner(memberId);
  const row = await budget(), id = await identity(memberId);
  return { closed: Boolean(row?.closed), linkedReady: Boolean(id && /^U[0-9a-f]{32}$/.test(id.subject) && (!row || matches(row, memberId, id)) && !row?.closed),
    slots: [{ slot: 1 as const, status: row?.slot1 || 'unused' }, { slot: 2 as const, status: row?.slot2 || 'unused' }] };
}
export async function closeLineTest(memberId: string) {
  await owner(memberId);
  // 連携前でも永久閉鎖できる。既に送信を開始したリクエストは取り消せない。
  await env.DB.prepare(`INSERT INTO line_test_budget(test_id,owner_member_id,linked_at,authorization_revision,closed,retry1,retry2)
    VALUES(?,?,'','',1,?,?) ON CONFLICT(test_id) DO UPDATE SET closed=1`)
    .bind(LINE_TEST_ID, memberId, crypto.randomUUID(), crypto.randomUUID()).run();
  return getLineTestStatus(memberId);
}
export async function sendLineTestNotice(memberId: string, slot: 1 | 2) {
  await owner(memberId);
  if (slot !== 1 && slot !== 2) throw new Error('line_test_invalid_slot');
  const existing = await budget();
  if (existing?.closed || (existing && existing[`slot${slot}`] !== 'unused')) return getLineTestStatus(memberId);
  const before = await identity(memberId);
  if (!before || !/^U[0-9a-f]{32}$/.test(before.subject) || (existing && !matches(existing, memberId, before))) throw new Error('line_test_link_changed');
  if (await checkLineAuthorization(memberId) !== 'valid') throw new Error('line_test_authorization');
  await owner(memberId);
  const id = await identity(memberId);
  if (!id || id.subject !== before.subject || id.revision !== before.revision || id.linked_at !== before.linked_at) throw new Error('line_test_link_changed');
  // 固定案件に一度だけ作成。取消・再試行・再登録で新しい予算を作らない。
  await env.DB.prepare(`INSERT OR IGNORE INTO line_test_budget(test_id,owner_member_id,linked_at,authorization_revision,retry1,retry2)
    VALUES(?,?,?,?,?,?)`).bind(LINE_TEST_ID, memberId, id.linked_at, id.revision, crypto.randomUUID(), crypto.randomUUID()).run();
  const claimed = await env.DB.prepare(`UPDATE line_test_budget SET slot${slot}='unknown'
    WHERE test_id=? AND owner_member_id=? AND linked_at=? AND authorization_revision=? AND closed=0 AND slot${slot}='unused' RETURNING *`)
    .bind(LINE_TEST_ID, memberId, id.linked_at, id.revision).first<Budget>();
  if (!claimed) return getLineTestStatus(memberId);
  // ここから結果不明も永久消費。DB保存失敗時も再送しない。
  let result: SlotStatus = 'failed';
  try {
    await owner(memberId);
    const latest = await identity(memberId), current = await budget();
    if (current && !current.closed && matches(current, memberId, latest) && latest?.subject === id.subject) {
      result = 'unknown';
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
        headers: { authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_TOKEN}`, 'content-type': 'application/json', 'X-Line-Retry-Key': claimed[`retry${slot}`] },
        body: JSON.stringify({ to: id.subject, messages: [{ type: 'text', text: `TASUKIの本人限定テスト通知（${slot}/2）です。他の会員には送信していません。` }] }),
      });
      // 受付と配達を混同しない。本文や外部エラーは保存・返却しない。
      result = response.status === 200 ? 'accepted' : response.status >= 400 && response.status < 500 ? 'failed' : 'unknown';
    }
  } catch { /* 送信済みか不明でも予算は消費済みのまま。 */ }
  await env.DB.prepare(`UPDATE line_test_budget SET slot${slot}=? WHERE test_id=? AND slot${slot}='unknown'`).bind(result, LINE_TEST_ID).run();
  return getLineTestStatus(memberId);
}
