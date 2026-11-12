import { env } from 'cloudflare:workers';
import { ensureDatabase, hashMobileSecret, deleteMobileAccount } from './data';
import { ensureMeetings } from './meetings';
import type { SessionUser } from '@/app/session-user';
import { serviceName } from '@/app/brand';
import { removeLineAccount } from './line-accounts';
import { randomLineSecret } from '@/app/line-auth';
import { requestLineDeauthorization, type LinePrivacyGrantProof } from './line-authorization';
export type PrivacyPurpose = 'unlink' | 'withdraw';
/** 確認メールの送信は、会場アンケートの大きな共用枠とは別に制限する。 */
export async function allowLinePrivacySubmission(ip: string, action: 'request' | 'confirm') {
  await ensureMeetings();
  const bucket = Math.floor(Date.now() / 600000);
  const key = await hashMobileSecret(`line-privacy:${action}:${ip}:${bucket}`);
  const row = await env.DB.prepare(`INSERT INTO meeting_submit_limits(id,count,expires) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count`)
    .bind(key, (bucket + 1) * 600000).first<{count:number}>();
  return !!row && row.count <= (action === 'request' ? 8 : 30);
}

export async function requestLinePrivacyCode(memberId: string, purpose: PrivacyPurpose) {
  await ensureDatabase();
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) throw new Error('確認メールの送信設定が未完了です。運営窓口へお問い合わせください。');
  const member = await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(memberId).first<{ email: string }>();
  if (!member?.email) throw new Error('会員情報を確認できませんでした。');
  const now = Date.now(), code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  const hash = await hashMobileSecret(`${memberId}:${purpose}:${code}`);
  const inserted = await env.DB.prepare(`INSERT INTO line_privacy_codes(member_id,purpose,code_hash,expires_at,requested_at,attempts) VALUES(?,?,?,?,?,0)
    ON CONFLICT(member_id) DO UPDATE SET purpose=excluded.purpose,code_hash=excluded.code_hash,expires_at=excluded.expires_at,requested_at=excluded.requested_at,attempts=0
    WHERE line_privacy_codes.requested_at<=? RETURNING member_id`).bind(memberId, purpose, hash, now + 600000, now, now - 60000).first();
  if (!inserted) throw new Error('確認コードは1分後に再送できます。');
  // このメールは本人が送信を依頼した確認コードだけ。任意のお知らせ同意とは分ける。
  let delivered = false;
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ from: env.AUTH_FROM_EMAIL, to: [member.email], subject: purpose === 'unlink' ? `${serviceName} LINE連携解除の確認コード` : `${serviceName} 退会の確認コード`, text: `${purpose === 'unlink' ? 'LINE連携解除' : '退会'}の確認コード: ${code}\n有効期限は10分です。心当たりがなければ操作せず、このメールを破棄してください。` }) });
    delivered = response.ok;
  } catch { /* uncertain delivery: invalidate code rather than duplicate send */ }
  if (!delivered) { await env.DB.prepare("UPDATE line_privacy_codes SET code_hash='',expires_at=?,attempts=5 WHERE member_id=? AND code_hash=?").bind(Date.now() + 60000, memberId, hash).run(); throw new Error('確認メールの送信を確認できませんでした。1分後に再試行してください。'); }
}
export async function verifyLinePrivacyCode(memberId: string, purpose: PrivacyPurpose, code: string) {
  await ensureDatabase();
  if (!/^\d{6}$/.test(code)) throw new Error('6桁の確認コードを入力してください。');
  const hash = await hashMobileSecret(`${memberId}:${purpose}:${code}`), now = Date.now();
  // 成否とも回数を消費し、並行確認・再利用・目的の差し替えを防ぐ。
  const verified = await env.DB.batch([
    env.DB.prepare('DELETE FROM line_privacy_codes WHERE member_id=? AND purpose=? AND code_hash=? AND expires_at>? AND attempts<5 RETURNING member_id').bind(memberId, purpose, hash, now),
    env.DB.prepare('UPDATE line_privacy_codes SET attempts=attempts+1 WHERE member_id=? AND expires_at>? AND attempts<5').bind(memberId, now),
  ]);
  if (!verified[0].results.length) throw new Error('確認コードが正しくないか、有効期限・試行回数を超えています。');
}
export const LINE_PRIVACY_COOKIE = 'line_privacy_grant';
export async function issueLinePrivacyGrant(memberId: string, purpose: PrivacyPurpose) {
  const token = randomLineSecret(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM line_privacy_grants WHERE expires_at<=? OR (member_id=? AND purpose=?)').bind(now, memberId, purpose),
    env.DB.prepare('INSERT INTO line_privacy_grants(token_hash,member_id,purpose,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await hashMobileSecret(token), memberId, purpose, now+600000, now),
  ]);
  return token;
}
export async function readLinePrivacyGrant(token: string, purpose: PrivacyPurpose = 'unlink') {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  await ensureDatabase();
  return env.DB.prepare('SELECT member_id AS memberId,purpose,expires_at AS expiresAt FROM line_privacy_grants WHERE token_hash=? AND purpose=? AND expires_at>?')
    .bind(await hashMobileSecret(token), purpose, Date.now()).first<{memberId:string;purpose:PrivacyPurpose;expiresAt:number}>();
}
export async function removeLinePrivacyGrants(memberId: string, purpose: PrivacyPurpose) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM line_oauth_flows WHERE mode='unlink_recovery' AND session_hash IN (SELECT token_hash FROM line_privacy_grants WHERE member_id=? AND purpose=?)").bind(memberId, purpose),
    env.DB.prepare('DELETE FROM line_privacy_grants WHERE member_id=? AND purpose=?').bind(memberId, purpose),
  ]);
}
export async function performLinePrivacyAction(user: SessionUser, purpose: PrivacyPurpose, proof?: LinePrivacyGrantProof) {
  if (purpose === 'withdraw') { await deleteMobileAccount(user); return { done:true }; }
  const linked = await env.DB.prepare('SELECT 1 FROM line_accounts WHERE member_id=?').bind(user.userId).first();
  if (!linked) return { done:true };
  const result = await requestLineDeauthorization(user.userId, proof);
  if (result === 'accepted') { await removeLineAccount(user.userId); return { done:true }; }
  return { done:false, pending:true, needsLineConfirmation:result==='reauth_required', message:result==='reauth_required'?'LINE側の解除を完了するため、LINEで本人確認をしてください。通知は停止しています。':'LINE側の解除を確認できませんでした。通知は停止しています。時間をおいて再試行してください。' };
}
export async function confirmLinePrivacyAction(user: SessionUser, purpose: PrivacyPurpose, code: string) {
  await verifyLinePrivacyCode(user.userId,purpose,code);
  return performLinePrivacyAction(user,purpose);
}
