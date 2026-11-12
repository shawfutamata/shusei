import { env } from 'cloudflare:workers';

export type TokenBinding = Readonly<{ memberId: string; providerId: string; channelId: string; subject: string }>;
export type SealedLineToken = Readonly<{ ciphertext: string; iv: string; keyVersion: string }>;
export type LineTokenVerification = 'valid' | 'invalid' | 'unavailable';
export type LineDeauthorization = 'accepted' | 'rejected' | 'unavailable';
export type LineTokenCryptoConfig = Readonly<{ LINE_TOKEN_ENCRYPTION_KEY?: string; LINE_TOKEN_KEY_VERSION?: string }>;
export type LineTokenCryptoConfiguration =
  | { ready: true; keyVersion: string }
  | { ready: false; reason: 'missing_key' | 'invalid_key' | 'invalid_key_version' };

const MAX_TOKEN_LENGTH = 16384;
const MAX_CIPHERTEXT_LENGTH = Math.ceil((MAX_TOKEN_LENGTH + 16) / 3) * 4;
const encoder = new TextEncoder();

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: unknown, maxLength: number): Uint8Array<ArrayBuffer> {
  // 曖昧なBase64（空白・URL形式・省略padding・未使用bit）を保存値として受け入れない。
  if (typeof value !== 'string' || !value.length || value.length > maxLength || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('line_token_encoding_invalid');
  }
  const binary = atob(value), bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (encodeBase64(bytes) !== value) throw new Error('line_token_encoding_invalid');
  return bytes;
}

/** 秘密の値を返さず、設定漏れだけを確認する。鍵の世代は暗号文と一緒に保存する。 */
export function validateLineTokenCryptoConfig(config: LineTokenCryptoConfig = env): LineTokenCryptoConfiguration {
  if (!config.LINE_TOKEN_ENCRYPTION_KEY) return { ready: false, reason: 'missing_key' };
  try {
    const bytes = decodeBase64(config.LINE_TOKEN_ENCRYPTION_KEY, 44);
    const valid = bytes.byteLength === 32;
    bytes.fill(0);
    if (!valid) return { ready: false, reason: 'invalid_key' };
  } catch { return { ready: false, reason: 'invalid_key' }; }
  if (typeof config.LINE_TOKEN_KEY_VERSION !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(config.LINE_TOKEN_KEY_VERSION)) {
    return { ready: false, reason: 'invalid_key_version' };
  }
  return { ready: true, keyVersion: config.LINE_TOKEN_KEY_VERSION };
}

export function lineTokenCryptoReady(): boolean {
  return validateLineTokenCryptoConfig().ready;
}

async function loadKey(): Promise<{ key: CryptoKey; keyVersion: string }> {
  const config = validateLineTokenCryptoConfig();
  if (!config.ready) throw new Error('line_token_crypto_unavailable');
  const bytes = decodeBase64(env.LINE_TOKEN_ENCRYPTION_KEY, 44);
  try {
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    return { key, keyVersion: config.keyVersion };
  } finally { bytes.fill(0); }
}

function validToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH && /^[A-Za-z0-9\-._~+/]+=*$/.test(value);
}

function additionalData(binding: TokenBinding, keyVersion: string): Uint8Array<ArrayBuffer> {
  if (!binding || [binding.memberId, binding.providerId, binding.channelId, binding.subject]
    .some(value => typeof value !== 'string' || !value.length || value.length > 512 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value))) {
    throw new Error('line_token_binding_invalid');
  }
  // 区切り文字の連結を避け、他会員・別Provider・別channel・別世代への暗号文の移植を防ぐ。
  return encoder.encode(JSON.stringify(['tasuki-line-user-access-token', 1, binding.memberId, binding.providerId, binding.channelId, binding.subject, keyVersion]));
}

export async function encryptLineToken(token: string, binding: TokenBinding): Promise<SealedLineToken> {
  if (!validToken(token)) throw new Error('line_token_invalid');
  const { key, keyVersion } = await loadKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(binding, keyVersion), tagLength: 128 }, key, encoder.encode(token));
  return { ciphertext: encodeBase64(new Uint8Array(ciphertext)), iv: encodeBase64(iv), keyVersion };
}

export async function decryptLineToken(sealed: SealedLineToken, binding: TokenBinding): Promise<string> {
  try {
    const { key, keyVersion } = await loadKey();
    // 古い世代を現在の鍵で推測して開かない。鍵の切替時は明示的な移行が必要。
    if (!sealed || sealed.keyVersion !== keyVersion) throw new Error('version');
    const iv = decodeBase64(sealed.iv, 16), ciphertext = decodeBase64(sealed.ciphertext, MAX_CIPHERTEXT_LENGTH);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 17) throw new Error('length');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: additionalData(binding, keyVersion), tagLength: 128 }, key, ciphertext);
    const bytes = new Uint8Array(plaintext);
    try {
      const token = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!validToken(token)) throw new Error('token');
      return token;
    } finally { bytes.fill(0); }
  } catch {
    // WebCrypto例外や保存内容を呼出元・ログへ流さず、失敗は必ず同じ理由にする。
    throw new Error('line_token_decryption_failed');
  }
}

/** 有効期限だけでなく発行先channelと本人を確認する。失効していても同意解除済みとは限らない。 */
export async function verifyLineUserToken(token: string, channelId: string, subject: string): Promise<LineTokenVerification> {
  if (!validToken(token) || typeof channelId !== 'string' || !channelId || typeof subject !== 'string' || !subject) return 'invalid';
  try {
    // 公式仕様がquery指定のため、このURLや例外・レスポンス本文は記録しない。
    const url = new URL('https://api.line.me/oauth2/v2.1/verify');
    url.searchParams.set('access_token', token);
    // Workersはredirect:error未対応。manualで3xxを成功扱いせず、資格情報の転送を止める。
    const verification = await fetch(url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (verification.status === 400 || verification.status === 401) return 'invalid';
    if (verification.status !== 200) return 'unavailable';
    const data: unknown = await verification.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'unavailable';
    const claims = data as Record<string, unknown>;
    if (claims.client_id !== channelId || typeof claims.expires_in !== 'number' || !Number.isFinite(claims.expires_in) || claims.expires_in <= 0 ||
        typeof claims.scope !== 'string' || !claims.scope.split(/\s+/).includes('openid')) return 'invalid';
    const userInfo = await fetch('https://api.line.me/oauth2/v2.1/userinfo', {
      method: 'GET', headers: { authorization: `Bearer ${token}` }, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    // userinfoは利用者tokenでの要求。401/403なら現在の認可で本人確認を完了できない。
    if (userInfo.status === 400 || userInfo.status === 401 || userInfo.status === 403) return 'invalid';
    if (userInfo.status !== 200) return 'unavailable';
    const user: unknown = await userInfo.json();
    if (!user || typeof user !== 'object' || Array.isArray(user)) return 'unavailable';
    return (user as Record<string, unknown>).sub === subject ? 'valid' : 'invalid';
  } catch { return 'unavailable'; }
}

/** Loginチャネルの資格情報だけを使う。Messaging/static tokenには代替しない。 */
export function lineDeauthorizationReady(): boolean {
  return validToken(env.LINE_LOGIN_CHANNEL_ID) && validToken(env.LINE_LOGIN_CHANNEL_SECRET);
}

/** 発行待ちの前後に、同じ解除対象・lease・本人確認がまだ有効か呼出元で照合する。 */
export type LineDeauthorizationGuard = () => Promise<boolean>;

/**
 * 解除直前にLogin ID/secretから15分のstateless channel tokenを得る。永続化・共有cacheはしない。
 * 公式仕様: https://developers.line.biz/en/reference/messaging-api/nojs/#issue-stateless-channel-access-token
 * 解除仕様: https://developers.line.biz/en/reference/line-login/#deauthorize-your-app-to-which-the-user-has-granted-permissions
 * rejectedは「解除済み」ではない。400の理由を推測せず204だけを成功とする。
 * 発行・解除とも通信断は結果不明なので、ここで自動再試行しない。
 */
export async function deauthorizeLineUser(token: string, canSend: LineDeauthorizationGuard): Promise<LineDeauthorization> {
  if (!validToken(token)) return 'rejected';
  if (!lineDeauthorizationReady() || typeof canSend !== 'function') return 'unavailable';
  try {
    if (!await canSend()) return 'unavailable';
    const issuedAfter = Date.now();
    const issued = await fetch('https://api.line.me/oauth2/v3/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.LINE_LOGIN_CHANNEL_ID, client_secret: env.LINE_LOGIN_CHANNEL_SECRET }),
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (issued.status !== 200) return 'unavailable';
    const data: unknown = await issued.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'unavailable';
    const credential = data as Record<string, unknown>;
    if (credential.token_type !== 'Bearer' || !validToken(credential.access_token) ||
        typeof credential.expires_in !== 'number' || !Number.isSafeInteger(credential.expires_in) ||
        credential.expires_in <= 0 || credential.expires_in > 900) return 'unavailable';
    // 応答受信時刻ではなく発行要求の開始時刻を使い、DB再照合に費やした時間も期限から差し引く。
    const expiresAt = issuedAfter + credential.expires_in * 1000;
    if (Date.now() >= expiresAt || !await canSend() || Date.now() >= expiresAt) return 'unavailable';
    const response = await fetch('https://api.line.me/user/v1/deauthorize', {
      method: 'POST', headers: { authorization: `Bearer ${credential.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ userAccessToken: token }), redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (response.status === 204) return 'accepted';
    if (response.status === 400) return 'rejected';
    // 401/403はchannel側の認証・権限の問題。利用者tokenの無効と取り違えない。
    return 'unavailable';
  } catch { return 'unavailable'; }
}
