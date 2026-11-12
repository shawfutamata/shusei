import { env } from 'cloudflare:workers';
import { ensureDatabase, findInviterByCode, getMembershipAccess, getMobileSessionAccess, hashMobileSecret } from './data';
import { verifiedLineSignup } from './line-signup';
import { prepareLineAuthorization, storeLineAuthorization, requestLineDeauthorization } from './line-authorization';
import { LINE_DATA_CONSENT_VERSION } from '@/app/line-data-consent';
import { lineHash, lineReturnPath, randomLineSecret, type LineIdentity } from '@/app/line-auth';

export type LineFlow = { mode: 'login' | 'link' | 'signup' | 'preferences' | 'unlink_recovery'; memberId: string; sessionHash: string; returnTo: string; draftId: string; nonce: string; verifier: string };
export async function createLineFlow(input: Omit<LineFlow, 'nonce' | 'verifier'>) {
  await ensureDatabase();
  const state = randomLineSecret(), browser = randomLineSecret(), nonce = randomLineSecret(), verifier = randomLineSecret();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM line_oauth_flows WHERE expires_at < ?').bind(Date.now()),
    env.DB.prepare(`INSERT INTO line_oauth_flows (state_hash,browser_hash,nonce,verifier,mode,member_id,session_hash,return_to,draft_id,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(await lineHash(state), await lineHash(browser), nonce, verifier, input.mode, input.memberId, input.sessionHash, lineReturnPath(input.returnTo), input.draftId, Date.now() + 600000),
  ]);
  return { state, browser, nonce, challenge: await lineHash(verifier) };
}
export async function consumeLineFlow(state: string, browser: string) {
  if (!/^[0-9a-f]{64}$/.test(state) || !/^[0-9a-f]{64}$/.test(browser)) return null;
  await ensureDatabase();
  // Cookieだけでもstateだけでも認証できず、並行callbackでも1回しか使えない。
  return env.DB.prepare(`DELETE FROM line_oauth_flows WHERE state_hash=? AND browser_hash=? AND expires_at>?
    RETURNING mode, member_id AS memberId, session_hash AS sessionHash, return_to AS returnTo, draft_id AS draftId, nonce, verifier`)
    .bind(await lineHash(state), await lineHash(browser), Date.now()).first<LineFlow>();
}
export async function linkLineAccount(memberId: string, identity: LineIdentity) {
  await ensureDatabase();
  if (!(await getMembershipAccess(memberId)).canUseApp) throw new Error('denied');
  const current = await env.DB.prepare('SELECT provider_id AS provider, line_user_id AS subject FROM line_accounts WHERE member_id=?').bind(memberId).first<{ provider: string; subject: string }>();
  if (current && await env.DB.prepare("SELECT 1 FROM line_authorizations WHERE member_id=? AND status IN ('deauthorize_pending','deauthorized')").bind(memberId).first()) throw new Error('line_pending');
  if (current && (current.provider !== env.LINE_PROVIDER_ID || current.subject !== identity.sub)) throw new Error('line_conflict');
  const now = new Date().toISOString();
  const authorization = await prepareLineAuthorization(memberId, identity.sub, identity.accessToken, identity.expiresIn);
  try {
    const results = await env.DB.batch([
      current
        ? env.DB.prepare('UPDATE line_accounts SET display_name=?,friend=0,friend_updated_at=0 WHERE member_id=? AND provider_id=? AND line_user_id=?').bind('', memberId, env.LINE_PROVIDER_ID, identity.sub)
        : env.DB.prepare(`INSERT INTO line_accounts(member_id,provider_id,line_user_id,display_name,linked_at,consent_version) VALUES(?,?,?,?,?,?)`)
          .bind(memberId, env.LINE_PROVIDER_ID, identity.sub, '', now, crypto.randomUUID()),
      env.DB.prepare(`INSERT INTO line_data_origins(member_id,data_consent_version,data_consent_at) VALUES(?,?,?)
        ON CONFLICT(member_id) DO UPDATE SET data_consent_version=excluded.data_consent_version,data_consent_at=excluded.data_consent_at`).bind(memberId, LINE_DATA_CONSENT_VERSION, now),
      authorization,
    ]);
    if (!results.at(-1)?.meta.changes) throw new Error('line_conflict');
  } catch { throw new Error('line_conflict'); }
}
async function lineSession(memberId: string, subject: string) {
  if (!(await getMembershipAccess(memberId)).canUseApp) throw new Error('denied');
  const token = randomLineSecret(), hash = await hashMobileSecret(token), now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const created = await env.DB.batch([
    env.DB.prepare('INSERT INTO mobile_sessions(token_hash,member_id,expires_at,created_at,last_seen_at) SELECT ?,member_id,?,?,? FROM line_accounts WHERE member_id=? AND provider_id=? AND line_user_id=?').bind(hash, expiresAt, now, now, memberId, env.LINE_PROVIDER_ID, subject),
    env.DB.prepare('INSERT INTO line_sessions(token_hash,member_id) SELECT token_hash,member_id FROM mobile_sessions WHERE token_hash=?').bind(hash),
  ]);
  if (!created[0].meta.changes) throw new Error('line_unlinked');
  return { token, expiresAt };
}
export async function loginWithLine(identity: LineIdentity) {
  await ensureDatabase();
  const account = await env.DB.prepare('SELECT member_id AS memberId FROM line_accounts WHERE provider_id=? AND line_user_id=?').bind(env.LINE_PROVIDER_ID, identity.sub).first<{ memberId: string }>();
  if (!account) throw new Error('line_unlinked');
  if (await env.DB.prepare("SELECT 1 FROM line_authorizations WHERE member_id=? AND status IN ('deauthorize_pending','deauthorized')").bind(account.memberId).first()) throw new Error('line_pending');
  await storeLineAuthorization(account.memberId, identity.sub, identity.accessToken, identity.expiresIn);
  return lineSession(account.memberId, identity.sub);
}
export async function registerWithLine(identity: LineIdentity, draftId: string) {
  await ensureDatabase();
  const draft = await verifiedLineSignup(draftId);
  if (!draft) throw new Error('line_draft');
  const email = draft.email;
  // TASUKIでメール確認済みでも、登録済み会員をこの新規登録入口で自動統合しない。
  if (await env.DB.prepare('SELECT id FROM members WHERE email=?').bind(email).first()) throw new Error('line_existing');
  if (await env.DB.prepare('SELECT member_id FROM line_accounts WHERE provider_id=? AND line_user_id=?').bind(env.LINE_PROVIDER_ID, identity.sub).first()) throw new Error('line_existing');
  const inviter = draft.invite ? await findInviterByCode(draft.invite) : null;
  if (draft.invite && !inviter) throw new Error('line_draft');
  const id = `signup-${crypto.randomUUID()}`, now = new Date().toISOString();
  const authorization = await prepareLineAuthorization(id, identity.sub, identity.accessToken, identity.expiresIn);
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO members(id,email,display_name,company,primary_industry,company_pr,business_area,venue,membership_status,membership_source,invited_by,activated_at,created_at,mail_on_message,mail_on_request,mail_on_offer)
        SELECT ?,email,name,'','','','','','active','line_verified_signup',?,?,?,?,?,? FROM line_signup_drafts
        WHERE id=? AND verified_at>0 AND consumed_at=0 AND expires_at>? AND consent_version=? AND email=? AND name=? AND invite=? AND mail_consent=?`).bind(id, inviter?.id || '', now, now, draft.mailConsent ? 1 : 0, draft.mailConsent ? 1 : 0, draft.mailConsent ? 1 : 0, draftId, Date.now(), draft.consentVersion, draft.email, draft.name, draft.invite, draft.mailConsent ? 1 : 0),
      env.DB.prepare(`INSERT INTO line_accounts(member_id,provider_id,line_user_id,display_name,linked_at,consent_version) VALUES(?,?,?,'',?,?)`).bind(id, env.LINE_PROVIDER_ID, identity.sub, now, crypto.randomUUID()),
      env.DB.prepare(`INSERT INTO line_data_origins(member_id,email_from_line,name_from_line,data_consent_version,data_consent_at,email_notice_consent,email_notice_consent_at) VALUES(?,0,0,?,?,?,?)`)
        .bind(id, draft.consentVersion, draft.consentAt, draft.mailConsent ? 1 : 0, draft.mailConsent ? now : ''),
      authorization,
      env.DB.prepare('DELETE FROM line_signup_drafts WHERE id=?').bind(draftId),
    ]);
    if (!results[3].meta.changes) throw new Error('line_failed');
  } catch { throw new Error('line_existing'); }
  return lineSession(id, identity.sub);
}
export async function lineAccountStatus(memberId: string, token: string) {
  await ensureDatabase();
  const account = await env.DB.prepare(`SELECT display_name AS displayName,notify_message AS notifyMessage,notify_offer AS notifyOffer
    FROM line_accounts WHERE member_id=? AND provider_id=?`).bind(memberId, env.LINE_PROVIDER_ID || '').first<{ displayName: string; notifyMessage: number; notifyOffer: number }>();
  const access = token ? await getMobileSessionAccess(token) : null;
  return { linked: Boolean(account), displayName: account?.displayName || '', notifyMessage: Boolean(account?.notifyMessage), notifyOffer: Boolean(account?.notifyOffer), canUnlink: Boolean(access), canEnable: Boolean(access?.membership.canUseApp) };
}
export async function setLinePreferences(memberId: string, message: boolean, offer: boolean, proof?: { subject: string }) {
  await ensureDatabase();
  // 友だち情報は照会しない。認証済みの同じLINEと、本人が選んだ通知同意だけを結び付ける。
  let expectedConsentVersion = '';
  if (message || offer) {
    if (!(await getMembershipAccess(memberId)).canUseApp) throw new Error('denied');
    if (!proof?.subject) throw new Error('line_consent');
    const identity = await env.DB.prepare('SELECT consent_version AS consentVersion FROM line_accounts WHERE member_id=? AND provider_id=? AND line_user_id=?').bind(memberId, env.LINE_PROVIDER_ID, proof.subject).first<{consentVersion:string}>();
    if (!identity) throw new Error('line_conflict');
    expectedConsentVersion = identity.consentVersion;
  }
  const nextConsentVersion = crypto.randomUUID();
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE line_accounts SET notify_message=?,notify_offer=?,consent_at=?,consent_version=?,friend=0,friend_updated_at=0
      WHERE member_id=? AND provider_id=? AND (?=0 OR (line_user_id=? AND consent_version=? AND EXISTS(SELECT 1 FROM line_authorizations t
        WHERE t.member_id=line_accounts.member_id AND t.subject=line_accounts.line_user_id AND t.status='active')))`)
      .bind(message ? 1 : 0, offer ? 1 : 0, new Date().toISOString(), nextConsentVersion, memberId, env.LINE_PROVIDER_ID, message || offer ? 1 : 0, proof?.subject || '', expectedConsentVersion),
    env.DB.prepare("UPDATE line_notification_outbox SET status='canceled',line_user_id='',provider_id='',consent_version='' WHERE member_id=? AND status IN ('pending','sending') AND EXISTS(SELECT 1 FROM line_accounts WHERE member_id=? AND provider_id=? AND consent_version=?)").bind(memberId, memberId, env.LINE_PROVIDER_ID, nextConsentVersion),
  ]);
  if (!result[0].meta.changes) throw new Error('line_unlinked');
}
export async function stopLineEmailNotices(memberId: string) {
  await ensureDatabase();
  await env.DB.batch([
    env.DB.prepare('UPDATE line_data_origins SET email_notice_consent=0,email_notice_consent_at=? WHERE member_id=?').bind(new Date().toISOString(), memberId),
    env.DB.prepare('UPDATE members SET mail_on_message=0,mail_on_offer=0,mail_on_request=0 WHERE id=?').bind(memberId),
  ]);
}
export async function unlinkLineAccount(memberId: string, token: string) {
  await ensureDatabase();
  // LINEだけのセッションでは解除しない。別の入口で本人確認済みかを確かめ、締め出しを防ぐ。
  const proof = token ? await getMobileSessionAccess(token) : null;
  if (!proof?.membership.canUseApp || proof.user.userId !== memberId || await env.DB.prepare('SELECT token_hash FROM line_sessions WHERE token_hash=?').bind(await hashMobileSecret(token)).first()) {
    throw new Error('先に登録メールと同じGoogleアカウントでログインし直してください。LINE以外のログイン方法を確認してから解除できます。');
  }
  if (await requestLineDeauthorization(memberId) !== 'accepted') throw new Error('LINE側の解除を確認できませんでした。本人確認から再試行してください。');
  await removeLineAccount(memberId);
}
/** メールコード等の独立した本人確認を済ませた内部経路から呼ぶ。 */
export async function removeLineAccount(memberId: string) {
  await ensureDatabase();
  const linked = await env.DB.prepare("SELECT a.member_id FROM line_accounts a LEFT JOIN line_authorizations t ON t.member_id=a.member_id WHERE a.member_id=? AND (t.status IS NULL OR t.status!='deauthorized')").bind(memberId).first();
  if (linked) throw new Error('LINE側の連動解除を先に完了してください。');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM line_oauth_flows WHERE member_id=?1 OR session_hash IN (SELECT token_hash FROM line_sessions WHERE member_id=?1)').bind(memberId),
    env.DB.prepare('DELETE FROM mobile_sessions WHERE token_hash IN (SELECT token_hash FROM line_sessions WHERE member_id=?)').bind(memberId),
    env.DB.prepare('DELETE FROM line_sessions WHERE member_id=?').bind(memberId),
    env.DB.prepare('DELETE FROM line_notification_outbox WHERE member_id=?').bind(memberId),
    env.DB.prepare('DELETE FROM line_oauth_flows WHERE member_id=?').bind(memberId),
    env.DB.prepare('DELETE FROM line_accounts WHERE member_id=?').bind(memberId),
  ]);
}
