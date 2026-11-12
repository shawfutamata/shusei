import { env } from 'cloudflare:workers';
import { serviceUrl } from './brand';
import { lineTokenCryptoReady, lineDeauthorizationReady } from '@/db/line-token-crypto';

export const LINE_BROWSER_COOKIE = 'line_oauth_browser';
export const LINE_SETTINGS_PATH = '/settings/line';
export function lineRecoveryReady() {
  return Boolean(env.LINE_PROVIDER_ID) && lineDeauthorizationReady() && lineTokenCryptoReady();
}
export function lineLoginReady() {
  return env.LINE_DATA_POLICY_READY === 'true' && env.LINE_LOGIN_ENABLED === 'true' && lineRecoveryReady();
}
export function lineSignupReady() { return lineLoginReady() && env.LINE_SIGNUP_ENABLED === 'true' && Boolean(env.RESEND_API_KEY && env.AUTH_FROM_EMAIL && env.AUTH_CODE_PEPPER); }
export function lineMessagingReady() {
  // プロバイダーが異なると同じ人でもIDが変わる。設定一致を必須にして誤配送を防ぐ。
  return lineLoginReady() && env.LINE_NOTIFICATIONS_ENABLED === 'true'
    && env.LINE_MESSAGING_PROVIDER_ID === env.LINE_PROVIDER_ID
    && Boolean(env.LINE_MESSAGING_CHANNEL_TOKEN && env.LINE_MESSAGING_CHANNEL_SECRET && env.LINE_BOT_USER_ID);
}
export function lineFriendUrl() {
  const id = env.LINE_OFFICIAL_ACCOUNT_ID || '';
  return /^@[a-zA-Z0-9._-]+$/.test(id) ? `https://line.me/R/ti/p/${encodeURIComponent(id)}` : '';
}
export function lineRedirectUri() { return `${serviceUrl}/api/auth/line/callback`; }
export function randomLineSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function lineHash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function lineReturnPath(raw: string) {
  // 認証用URLや外部URLへ戻さず、コードを含むURLの反射も防ぐ。
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n\u0000-\u001f]/.test(raw) || raw.startsWith('/api/') || raw.startsWith('/login')) return '/';
  const url = new URL(raw, serviceUrl);
  return url.origin === serviceUrl ? (url.pathname + url.search + url.hash).slice(0, 500) : '/';
}
export type LineIdentity = { sub: string; accessToken: string; expiresIn: number };
export async function exchangeLineCode(code: string, verifier: string, nonce: string): Promise<LineIdentity> {
  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: lineRedirectUri(),
      client_id: env.LINE_LOGIN_CHANNEL_ID, client_secret: env.LINE_LOGIN_CHANNEL_SECRET, code_verifier: verifier }),
  });
  if (!response.ok) throw new Error('line_failed');
  const token = await response.json() as { id_token?: string; access_token?: string; expires_in?: number };
  if (!token.id_token || !token.access_token || !Number.isSafeInteger(token.expires_in) || token.expires_in! <= 0 || token.expires_in! > 31 * 86400) throw new Error('line_failed');
  // JWTを自己申告のプロフィールとして読まない。LINEの公式検証APIで署名・aud・nonceを検証する。
  const verified = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ id_token: token.id_token, client_id: env.LINE_LOGIN_CHANNEL_ID, nonce }),
  });
  if (!verified.ok) throw new Error('line_failed');
  const claims = await verified.json() as { iss?: string; aud?: string; exp?: number; iat?: number; nonce?: string; sub?: string };
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== 'https://access.line.me' || claims.aud !== env.LINE_LOGIN_CHANNEL_ID || claims.nonce !== nonce
    || typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.iat !== 'number' || claims.iat > now + 60
    || !/^U[0-9a-f]{32}$/.test(claims.sub || '')) throw new Error('line_failed');
  // LINEから氏名・メールは取得しない。tokenはサーバー内で暗号化保存する入口へだけ渡す。
  return { sub: claims.sub!, accessToken: token.access_token, expiresIn: token.expires_in! };
}
export async function validLineSignature(raw: string, signature: string) {
  if (!env.LINE_MESSAGING_CHANNEL_SECRET || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LINE_MESSAGING_CHANNEL_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(signature), c => c.charCodeAt(0)), new TextEncoder().encode(raw));
}
