// 同意済みのLINEアカウントだけを対象にし、外部結果が不明なら送信・完了を許可しない。
import { env } from 'cloudflare:workers';
import { decryptLineToken, encryptLineToken, verifyLineUserToken, deauthorizeLineUser } from './line-token-crypto';
type AuthorizationRow = { member_id: string; provider_id: string; channel_id: string; subject: string; ciphertext: string; iv: string; key_version: string; expires_at: number; status: string; revision: string; deauthorize_lease_until: number };
export type LinePrivacyGrantProof = Readonly<{ tokenHash: string; purpose: 'unlink' | 'withdraw' }>;
function privacyProofValues(proof?: LinePrivacyGrantProof): [string, string] {
  if (proof === undefined) return ['', ''];
  if (!proof || typeof proof.tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(proof.tokenHash) || !['unlink', 'withdraw'].includes(proof.purpose)) {
    throw new Error('LINE連携解除の本人確認をやり直してください。');
  }
  return [proof.tokenHash, proof.purpose];
}
// DB実行時刻で判定する。外部API待ちの前に作ったDate.now()を失効判定に使わない。
const databaseNow = "CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER)";
const privacyGrantGuard = (member: string, hash: string, purpose: string) => `(${hash}='' OR EXISTS(SELECT 1 FROM line_privacy_grants
  WHERE member_id=${member} AND token_hash=${hash} AND purpose=${purpose} AND expires_at>${databaseNow}))`;
async function privacyGrantValid(memberId: string, proof?: LinePrivacyGrantProof): Promise<boolean> {
  const values = privacyProofValues(proof);
  if (!proof) return true;
  return Boolean(await env.DB.prepare(`SELECT 1 WHERE ${privacyGrantGuard('?1', '?2', '?3')}`).bind(memberId, ...values).first());
}
const binding = (r: AuthorizationRow) => ({ memberId: r.member_id, providerId: r.provider_id, channelId: r.channel_id, subject: r.subject });
const sealed = (r: AuthorizationRow) => ({ ciphertext: r.ciphertext, iv: r.iv, keyVersion: r.key_version });
async function read(memberId: string) {
  return env.DB.prepare(`SELECT t.* FROM line_authorizations t JOIN line_accounts a ON a.member_id=t.member_id
    AND a.provider_id=t.provider_id AND a.line_user_id=t.subject
    WHERE t.member_id=? AND t.provider_id=? AND t.channel_id=?`).bind(memberId, env.LINE_PROVIDER_ID, env.LINE_LOGIN_CHANNEL_ID).first<AuthorizationRow>();
}
async function verifyAndSeal(memberId: string, subject: string, accessToken: string, expiresIn: number) {
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0 || expiresIn > 31 * 86400) throw new Error('LINE認証の有効期限を確認できませんでした。');
  const verified = await verifyLineUserToken(accessToken, env.LINE_LOGIN_CHANNEL_ID, subject);
  if (verified !== 'valid') throw new Error('LINEの本人確認を完了できませんでした。');
  const protectedToken = await encryptLineToken(accessToken, { memberId, providerId: env.LINE_PROVIDER_ID, channelId: env.LINE_LOGIN_CHANNEL_ID, subject });
  return protectedToken;
}
/**
 * 公式検証・暗号化後、会員/紐付け作成と同じD1 batchへ渡す文を準備する。
 * 実行時にも紐付けを照合する。呼出元はchanges>0を確認してからsessionを発行する。
 */
export async function prepareLineAuthorization(memberId: string, subject: string, accessToken: string, expiresIn: number): Promise<D1PreparedStatement> {
  const protectedToken = await verifyAndSeal(memberId, subject, accessToken, expiresIn);
  const now = Date.now();
  return env.DB.prepare(`INSERT INTO line_authorizations(member_id,provider_id,channel_id,subject,ciphertext,iv,key_version,expires_at,status,revision,updated_at)
    SELECT member_id,provider_id,?,line_user_id,?,?,?,?,'active',?,? FROM line_accounts WHERE member_id=? AND provider_id=? AND line_user_id=?
    ON CONFLICT(member_id) DO UPDATE SET provider_id=excluded.provider_id,channel_id=excluded.channel_id,subject=excluded.subject,ciphertext=excluded.ciphertext,
    iv=excluded.iv,key_version=excluded.key_version,expires_at=excluded.expires_at,status='active',revision=excluded.revision,checked_at=0,deauthorize_lease_until=0,updated_at=excluded.updated_at
    WHERE line_authorizations.status IN ('active','reauth_required')`)
    .bind(env.LINE_LOGIN_CHANNEL_ID, protectedToken.ciphertext, protectedToken.iv, protectedToken.keyVersion, now + expiresIn * 1000, crypto.randomUUID(), now, memberId, env.LINE_PROVIDER_ID, subject);
}
/** 通常の再認証用。解除中の状態を通常ログインへ戻してはいけない。 */
export async function storeLineAuthorization(memberId: string, subject: string, accessToken: string, expiresIn: number) {
  const result = await (await prepareLineAuthorization(memberId, subject, accessToken, expiresIn)).run();
  if (!result.meta.changes) throw new Error('LINEアカウントの紐付けを確認できませんでした。');
}

/**
 * 本人の解除用OAuthからだけ呼ぶ。新tokenは解除の再試行専用で、通常認証・通知は再開しない。
 * 外部解除中の差し替えを避け、検証中にlease/credentialが変わっても全体を更新しない。
 */
export async function recoverLineDeauthorization(memberId: string, subject: string, accessToken: string, expiresIn: number, proof?: LinePrivacyGrantProof): Promise<void> {
  const proofValues = privacyProofValues(proof);
  if (!await privacyGrantValid(memberId, proof)) throw new Error('LINE連携解除の本人確認が失効しました。');
  const row = await read(memberId);
  if (!row) {
    // 旧連携・credential消失時も、独立メール本人確認＋新しい解除用OAuthからだけ補修する。
    // 別channelの保存値や新しい認証を、readの不一致だけを理由に上書きしてはいけない。
    const linked = await env.DB.prepare('SELECT consent_version AS consentVersion FROM line_accounts WHERE member_id=? AND provider_id=? AND line_user_id=?')
      .bind(memberId, env.LINE_PROVIDER_ID, subject).first<{ consentVersion: string }>();
    const existing = await env.DB.prepare('SELECT 1 FROM line_authorizations WHERE member_id=?').bind(memberId).first();
    if (!linked || existing) throw new Error('LINE連携解除の対象を確認できませんでした。');
    const protectedToken = await verifyAndSeal(memberId, subject, accessToken, expiresIn);
    const now = Date.now(), revision = crypto.randomUUID();
    const guard = "EXISTS(SELECT 1 FROM line_authorizations WHERE member_id=?1 AND revision=?2 AND status='deauthorize_pending')";
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO line_authorizations(member_id,provider_id,channel_id,subject,ciphertext,iv,key_version,expires_at,status,revision,updated_at)
        SELECT member_id,provider_id,?,line_user_id,?,?,?,?,'deauthorize_pending',?,? FROM line_accounts
        WHERE member_id=? AND provider_id=? AND line_user_id=? AND consent_version=? AND ${privacyGrantGuard('?8', '?12', '?13')}
        ON CONFLICT(member_id) DO NOTHING`)
        .bind(env.LINE_LOGIN_CHANNEL_ID, protectedToken.ciphertext, protectedToken.iv, protectedToken.keyVersion, now + expiresIn * 1000, revision, now,
          memberId, env.LINE_PROVIDER_ID, subject, linked.consentVersion, ...proofValues),
      env.DB.prepare(`UPDATE line_accounts SET notify_message=0,notify_offer=0,consent_version=?3 WHERE member_id=?1 AND ${guard}`).bind(memberId, revision, crypto.randomUUID()),
      env.DB.prepare(`UPDATE line_notification_outbox SET status='canceled',provider_id='',line_user_id='',consent_version='' WHERE member_id=?1 AND status IN ('pending','sending') AND ${guard}`).bind(memberId, revision),
      env.DB.prepare(`DELETE FROM line_oauth_flows WHERE (member_id=?1 OR session_hash IN(SELECT token_hash FROM line_sessions WHERE member_id=?1)) AND ${guard}`).bind(memberId, revision),
      env.DB.prepare(`DELETE FROM mobile_sessions WHERE token_hash IN(SELECT token_hash FROM line_sessions WHERE member_id=?1) AND ${guard}`).bind(memberId, revision),
      env.DB.prepare(`DELETE FROM line_sessions WHERE member_id=?1 AND ${guard}`).bind(memberId, revision),
    ]);
    if (!result[0].meta.changes) throw new Error('LINE連携解除の状態が変わりました。もう一度確認してください。');
    return;
  }
  const recoverable = row && row.subject === subject && ['deauthorize_pending', 'reauth_required'].includes(row.status);
  if (!recoverable || row.deauthorize_lease_until > Date.now()) throw new Error('LINE連携解除の再確認を開始できません。処理中の場合は時間をおいてください。');
  const protectedToken = await verifyAndSeal(memberId, subject, accessToken, expiresIn);
  const now = Date.now(), revision = crypto.randomUUID();
  const guard = `EXISTS(SELECT 1 FROM line_authorizations t JOIN line_accounts a ON a.member_id=t.member_id
    AND a.provider_id=t.provider_id AND a.line_user_id=t.subject WHERE t.member_id=?1 AND t.revision=?2
    AND t.status IN ('deauthorize_pending','reauth_required') AND t.deauthorize_lease_until<=?3
    AND t.provider_id=?4 AND t.channel_id=?5 AND t.subject=?6) AND ${privacyGrantGuard('?1', '?7', '?8')}`;
  const values = [memberId, row.revision, now, row.provider_id, row.channel_id, subject, ...proofValues];
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE line_accounts SET notify_message=0,notify_offer=0,consent_version=?9 WHERE member_id=?1 AND ${guard}`).bind(...values, crypto.randomUUID()),
    env.DB.prepare(`UPDATE line_notification_outbox SET status='canceled',provider_id='',line_user_id='',consent_version='' WHERE member_id=?1 AND status IN ('pending','sending') AND ${guard}`).bind(...values),
    env.DB.prepare(`DELETE FROM line_oauth_flows WHERE (member_id=?1 OR session_hash IN(SELECT token_hash FROM line_sessions WHERE member_id=?1)) AND ${guard}`).bind(...values),
    env.DB.prepare(`DELETE FROM mobile_sessions WHERE token_hash IN(SELECT token_hash FROM line_sessions WHERE member_id=?1) AND ${guard}`).bind(...values),
    env.DB.prepare(`DELETE FROM line_sessions WHERE member_id=?1 AND ${guard}`).bind(...values),
    env.DB.prepare(`UPDATE line_authorizations SET ciphertext=?9,iv=?10,key_version=?11,expires_at=?12,status='deauthorize_pending',revision=?13,
      checked_at=0,deauthorize_lease_until=0,updated_at=?3 WHERE member_id=?1 AND ${guard}`)
      .bind(...values, protectedToken.ciphertext, protectedToken.iv, protectedToken.keyVersion, now + expiresIn * 1000, revision),
  ]);
  if (!result.at(-1)?.meta.changes) throw new Error('LINE連携解除の状態が変わりました。もう一度確認してください。');
}
/** 関連操作だけを停止する。通信障害を、会員退会やデータ消去の根拠にしない。 */
async function suspend(row: AuthorizationRow, status: 'reauth_required' | 'deauthorize_pending', proof?: LinePrivacyGrantProof) {
  // 古い検証結果で、新しいOAuthが保存した資格情報や同意を取り消さない。
  const revision = crypto.randomUUID();
  const values = [row.member_id, row.revision, ...privacyProofValues(proof)];
  const guard = `EXISTS(SELECT 1 FROM line_authorizations WHERE member_id=?1 AND revision=?2) AND ${privacyGrantGuard('?1', '?3', '?4')}`;
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE line_accounts SET notify_message=0,notify_offer=0,consent_version=?5 WHERE member_id=?1 AND ${guard}`).bind(...values, crypto.randomUUID()),
    env.DB.prepare(`UPDATE line_notification_outbox SET status='canceled',provider_id='',line_user_id='',consent_version='' WHERE member_id=?1 AND status IN ('pending','sending') AND ${guard}`).bind(...values),
    // sessionとの対応が消える前に、空member_idでもそのsessionに結び付くOAuthを失効させる。
    env.DB.prepare(`DELETE FROM line_oauth_flows WHERE (member_id=?1 OR session_hash IN(SELECT token_hash FROM line_sessions WHERE member_id=?1)) AND ${guard}`).bind(...values),
    env.DB.prepare(`DELETE FROM mobile_sessions WHERE token_hash IN(SELECT token_hash FROM line_sessions WHERE member_id=?1) AND ${guard}`).bind(...values),
    env.DB.prepare(`DELETE FROM line_sessions WHERE member_id=?1 AND ${guard}`).bind(...values),
    env.DB.prepare(`UPDATE line_authorizations SET status=?5,revision=?6,deauthorize_lease_until=?7,checked_at=?8,updated_at=?8 WHERE member_id=?1 AND ${guard}`)
      .bind(...values, status, revision, status === 'deauthorize_pending' ? Date.now() + 30000 : 0, Date.now()),
  ]);
  return result.at(-1)?.meta.changes ? { ...row, status, revision } : null;
}
export async function checkLineAuthorization(memberId: string): Promise<'valid' | 'invalid' | 'unavailable'> {
  const row = await read(memberId);
  if (!row || row.status !== 'active') return 'invalid';
  if (row.expires_at <= Date.now()) { await suspend(row, 'reauth_required'); return 'invalid'; }
  let token: string;
  try { token = await decryptLineToken(sealed(row), binding(row)); } catch { return 'unavailable'; }
  const result = await verifyLineUserToken(token, row.channel_id, row.subject);
  if (result === 'invalid') await suspend(row, 'reauth_required');
  if (result !== 'valid') return result;
  // 外部検証中の解除/再認証で古くなった結果を利用させない。
  const current = await env.DB.prepare("UPDATE line_authorizations SET checked_at=? WHERE member_id=? AND revision=? AND status='active' RETURNING member_id")
    .bind(Date.now(), memberId, row.revision).first();
  return current ? 'valid' : 'invalid';
}
/** 本人が明示したunlink/退会の確認後だけ呼ぶ。acceptedもローカル削除完了を意味しない。 */
export async function requestLineDeauthorization(memberId: string, proof?: LinePrivacyGrantProof): Promise<'accepted' | 'reauth_required' | 'unavailable'> {
  if (!await privacyGrantValid(memberId, proof)) return 'unavailable';
  const row = await read(memberId);
  if (!row) return 'reauth_required';
  if (row.status === 'deauthorized') return 'accepted';
  if (row.status === 'deauthorize_pending' && row.deauthorize_lease_until > Date.now()) return 'unavailable';
  const claimed = await suspend(row, 'deauthorize_pending', proof);
  if (!claimed) return 'unavailable';
  // 期限切れでも公式APIが何を返すかは別問題。成功応答以外を「既に解除済み」と推定しない。
  let token: string;
  try { token = await decryptLineToken(sealed(row), binding(row)); } catch { return 'unavailable'; }
  // 発行前とstateless token取得後に、同じlease/暗号credential/紐付け/本人確認を一度に照合する。
  // 待機中の取消・期限切れ・再認証は送信しない。既に送信済みの外部要求は取り消せない。
  const canSend = async () => Boolean(await env.DB.prepare(`SELECT 1 FROM line_authorizations t
    JOIN line_accounts a ON a.member_id=t.member_id AND a.provider_id=t.provider_id AND a.line_user_id=t.subject
    WHERE t.member_id=?1 AND t.provider_id=?2 AND t.channel_id=?3 AND t.subject=?4
    AND t.ciphertext=?5 AND t.iv=?6 AND t.key_version=?7 AND t.revision=?8
    AND t.status='deauthorize_pending' AND t.deauthorize_lease_until>${databaseNow}
    AND ${privacyGrantGuard('?1', '?9', '?10')}`)
    .bind(memberId, row.provider_id, row.channel_id, row.subject, row.ciphertext, row.iv, row.key_version, claimed.revision, ...privacyProofValues(proof)).first());
  const result = await deauthorizeLineUser(token, canSend);
  if (result !== 'accepted') {
    await env.DB.prepare('UPDATE line_authorizations SET deauthorize_lease_until=0 WHERE member_id=? AND revision=?').bind(memberId, claimed.revision).run();
    const settled = await read(memberId);
    if (settled?.status === 'deauthorized' && settled.subject === row.subject && await privacyGrantValid(memberId, proof)) return 'accepted';
    return result === 'rejected' ? 'reauth_required' : 'unavailable';
  }
  const updated = await env.DB.prepare("UPDATE line_authorizations SET status='deauthorized',ciphertext='',iv='',deauthorize_lease_until=0,checked_at=?,updated_at=? WHERE member_id=? AND provider_id=? AND channel_id=? AND subject=? AND ciphertext=? AND iv=? AND key_version=? AND status='deauthorize_pending' RETURNING member_id")
    .bind(Date.now(), Date.now(), memberId, row.provider_id, row.channel_id, row.subject, row.ciphertext, row.iv, row.key_version).first();
  // 同じtokenでlease再取得されても204の成功は残す。別の資格情報に変わっていたら消さない。
  if (updated) return 'accepted';
  const settled = await read(memberId);
  return settled?.status === 'deauthorized' && settled.subject === row.subject ? 'accepted' : 'unavailable';
}
