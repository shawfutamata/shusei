import { env } from 'cloudflare:workers';
import { ensureDatabase, findInviterByCode, hashMobileSecret } from './data';
import { ensureMeetings } from './meetings';
import { randomLineSecret } from '@/app/line-auth';
import { LINE_DATA_CONSENT_VERSION } from '@/app/line-data-consent';
import { serviceName } from '@/app/brand';

export const LINE_SIGNUP_BROWSER_COOKIE = 'line_signup_browser';
const DRAFT_LIFETIME = 20 * 60 * 1000;
const CODE_LIFETIME = 10 * 60 * 1000;
const RESEND_DELAY = 60 * 1000;
const invalidCode = '確認コードが正しくないか、有効期限・試行回数を超えています。再送してやり直してください。';
const existingEmail = 'このメールアドレスは登録済みです。ログイン画面から既存のアカウントでログインしてください。';

type SignupInput = { name: unknown; email: unknown; invite?: unknown; consent: unknown; lineConsent: unknown; mailConsent?: unknown; draftId?: unknown };
export type VerifiedLineSignup = { name: string; email: string; invite: string; mailConsent: boolean; consentVersion: string; consentAt: string };

/** 生のIPを残さず、メール送信とコード確認を別々の小さな枠で制限する。 */
export async function allowLineSignupSubmission(ip: string, action: 'request' | 'verify') {
  await ensureMeetings();
  const bucket = Math.floor(Date.now() / 600000);
  const key = await hashMobileSecret(`line-signup:${action}:${ip}:${bucket}`);
  const row = await env.DB.prepare(`INSERT INTO meeting_submit_limits(id,count,expires) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count`).bind(key, (bucket + 1) * 600000).first<{ count: number }>();
  return !!row && row.count <= (action === 'request' ? 8 : 30);
}

export async function requestLineSignup(input: SignupInput, browserToken?: string) {
  if (input.consent !== true || input.lineConsent !== true) throw new Error('利用規約・プライバシーポリシーとLINE情報の保存・利用への同意をご確認ください。');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const invite = typeof input.invite === 'string' ? input.invite.trim().toUpperCase() : '';
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('お名前を120文字以内で入力してください。');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('受信できるメールアドレスを入力してください。');
  if (invite.length > 16) throw new Error('紹介リンクが無効です。');
  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) throw new Error('確認メールの送信設定が未完了です。運営窓口へお問い合わせください。');
  await ensureDatabase();
  if (await env.DB.prepare('SELECT id FROM members WHERE lower(email)=? LIMIT 1').bind(email).first()) throw new Error(existingEmail);
  if (invite && !await findInviterByCode(invite)) throw new Error('紹介リンクが無効です。');
  let draftId = crypto.randomUUID();
  let browser = randomLineSecret();
  if (input.draftId !== undefined && input.draftId !== '') {
    if (typeof input.draftId !== 'string' || !validId(input.draftId) || !validBrowser(browserToken)) throw new Error('登録を最初からやり直してください。');
    const prior = await env.DB.prepare('SELECT id FROM line_signup_drafts WHERE id=? AND browser_hash=? AND consumed_at=0 AND expires_at>?')
      .bind(input.draftId, await browserHash(browserToken!), Date.now()).first();
    if (!prior) throw new Error('登録の有効期限が切れています。最初からやり直してください。');
    draftId = input.draftId;
    browser = browserToken!;
  }
  const now = Date.now();
  // 端数を捨てて6桁を均等に生成する。平文コードは送信中だけメモリに置く。
  let random: number;
  do { random = crypto.getRandomValues(new Uint32Array(1))[0]; } while (random >= 4294000000);
  const code = String(random % 1000000).padStart(6, '0');
  const hash = await codeHash(draftId, code), boundBrowser = await browserHash(browser);
  // メール単位のUPSERTで同時再送を防ぐ。再送は確認済み状態も失効させ、入力変更の流用を防ぐ。
  const saved = await env.DB.prepare(`INSERT INTO line_signup_drafts
    (id,name,email,invite,mail_consent,consent_version,consent_at,browser_hash,code_hash,code_expires_at,expires_at,requested_at,attempts,verified_at,consumed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,0,0)
    ON CONFLICT(email) DO UPDATE SET id=excluded.id,name=excluded.name,invite=excluded.invite,mail_consent=excluded.mail_consent,
      consent_version=excluded.consent_version,consent_at=excluded.consent_at,browser_hash=excluded.browser_hash,code_hash=excluded.code_hash,
      code_expires_at=excluded.code_expires_at,expires_at=excluded.expires_at,requested_at=excluded.requested_at,attempts=0,verified_at=0,consumed_at=0
    WHERE line_signup_drafts.requested_at<=? RETURNING id`)
    .bind(draftId, name, email, invite, input.mailConsent === true ? 1 : 0, LINE_DATA_CONSENT_VERSION, new Date(now).toISOString(), boundBrowser, hash,
      now + CODE_LIFETIME, now + DRAFT_LIFETIME, now, now - RESEND_DELAY).first();
  if (!saved) throw new Error('確認コードは1分後に再送できます。');
  // 任意のお知らせがOFFでも、本人が依頼した確認メールだけを送る。
  let delivered = false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ from: env.AUTH_FROM_EMAIL, to: [email], subject: `${serviceName} LINE登録のメール確認コード`,
        text: `${serviceName}のLINE登録用メール確認コード: ${code}\n有効期限は10分です。メール確認後、LINEで本人認証すると登録が完了します。\nこのコードを他の人に伝えないでください。心当たりがなければ、このメールを破棄してください。` }),
    });
    delivered = response.ok;
  } catch { /* 配送結果が不明なときは再送せず、発行したコードだけを無効化する。 */ }
  if (!delivered) {
    await env.DB.prepare("UPDATE line_signup_drafts SET code_hash='',code_expires_at=0,attempts=5 WHERE id=? AND code_hash=?").bind(draftId, hash).run();
    throw new Error('確認メールの送信を確認できませんでした。1分後に再試行してください。');
  }
  // 期限切れの個人入力と確認用ハッシュは、次の利用時に消す。会員データには触れない。
  await env.DB.prepare('DELETE FROM line_signup_drafts WHERE expires_at<=?').bind(now).run();
  return { draftId, browserToken: browser };
}

export async function verifyLineSignup(draftId: string, browserToken: string, code: string) {
  await ensureDatabase();
  if (!validId(draftId) || !validBrowser(browserToken) || !/^\d{6}$/.test(code)) throw new Error(invalidCode);
  const now = Date.now(), hash = await codeHash(draftId, code);
  // 正誤の判定と回数消費を1つのUPDATEにし、並行試行で5回の制限を越えさせない。
  const result = await env.DB.prepare(`UPDATE line_signup_drafts SET attempts=attempts+1,
      verified_at=CASE WHEN code_hash=? THEN ? ELSE 0 END,
      code_expires_at=CASE WHEN code_hash=? THEN 0 ELSE code_expires_at END,
      code_hash=CASE WHEN code_hash=? THEN '' ELSE code_hash END
    WHERE id=? AND browser_hash=? AND code_expires_at>? AND expires_at>? AND attempts<5 AND verified_at=0 AND consumed_at=0 AND consent_version=?
    RETURNING verified_at AS verifiedAt`)
    .bind(hash, now, hash, hash, draftId, await browserHash(browserToken), now, now, LINE_DATA_CONSENT_VERSION).first<{ verifiedAt: number }>();
  if (!result?.verifiedAt) throw new Error(invalidCode);
}

/** browserToken省略は、既に検証されたOAuthフローを使うサーバー内コールバック専用。 */
export async function verifiedLineSignup(draftId: string, browserToken?: string): Promise<VerifiedLineSignup | null> {
  await ensureDatabase();
  if (!validId(draftId) || (browserToken !== undefined && !validBrowser(browserToken))) return null;
  const browserCondition = browserToken === undefined ? '' : ' AND browser_hash=?';
  const values: (string | number)[] = [draftId, Date.now(), LINE_DATA_CONSENT_VERSION];
  if (browserToken !== undefined) values.push(await browserHash(browserToken));
  const row = await env.DB.prepare(`SELECT name,email,invite,mail_consent AS mailConsent,consent_version AS consentVersion,consent_at AS consentAt
    FROM line_signup_drafts WHERE id=? AND expires_at>? AND verified_at>0 AND consumed_at=0 AND consent_version=?${browserCondition}`)
    .bind(...values).first<Omit<VerifiedLineSignup, 'mailConsent'> & { mailConsent: number }>();
  return row ? { ...row, mailConsent: row.mailConsent === 1 } : null;
}
function validId(value: string) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value); }
function validBrowser(value?: string) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function browserHash(value: string) { return hashMobileSecret(`line-signup-browser:${value}`); }
function codeHash(draftId: string, code: string) { return hashMobileSecret(`line-signup-code:${draftId}:${code}`); }
