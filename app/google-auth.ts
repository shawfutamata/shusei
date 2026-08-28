import { env } from 'cloudflare:workers';

export const GOOGLE_STATE_COOKIE = 'google_oauth_state';

export function googleRedirectUri(request: Request) {
  return `${new URL(request.url).origin}/api/auth/google/callback`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Googleログインの設定が未完了です。');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) throw new Error('Googleとの通信に失敗しました。');

  const { id_token: idToken } = await response.json() as { id_token?: string };
  if (!idToken) throw new Error('Googleからアカウント情報を取得できませんでした。');

  // id_tokenはGoogleのトークンエンドポイントからTLSで直接受け取っているため、
  // 署名の再検証は不要（Googleのドキュメントもこの経路では省略してよいとしている）。
  const claims = decodeJwtPayload(idToken);
  if (claims.email_verified !== true) throw new Error('Googleアカウントのメールアドレスが未確認です。');
  if (!claims.email) throw new Error('Googleからメールアドレスを取得できませんでした。');
  return claims.email;
}

function decodeJwtPayload(token: string) {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Googleからアカウント情報を取得できませんでした。');
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
  const json = new TextDecoder().decode(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));
  return JSON.parse(json) as { email?: string; email_verified?: boolean };
}
