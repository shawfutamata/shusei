import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { SessionUser } from './session-user';
import { getMobileSessionAccess, type MembershipAccess } from '@/db/data';

export const SESSION_COOKIE = 'member_session';

export type AppAccess = { user: SessionUser; membership: MembershipAccess };

/**
 * ログインしているのは誰か。入口は2つだけ。
 *
 * - Web … Googleログインが発行した member_session Cookie
 * - アプリ … Authorization: Bearer のトークン
 *
 * どちらも同じ mobile_sessions を見る。以前はここにChatGPT Sitesが差し込む
 * ヘッダ（oai-authenticated-user-*）の経路があったが、Sitesから切り離した
 * ときに外した。**ヘッダを信じる経路が無くなったので、誰かがヘッダを
 * 詐称してログイン扱いになることもない。**
 */
export async function getAppAccess(): Promise<AppAccess | null> {
  const token = await getMobileBearerToken() || await getSessionCookieToken();
  return token ? getMobileSessionAccess(token) : null;
}

export async function getSessionCookieToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value?.trim() ?? '';
}

export async function requireActiveMember(): Promise<{ user: SessionUser; response?: never } | { user?: never; response: NextResponse }> {
  const access = await getAppAccess();
  if (!access) return { response: NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 }) };
  if (!access.membership.canUseApp) {
    return { response: NextResponse.json({ error: 'このアカウントには現在利用権限がありません。運営窓口へお問い合わせください。' }, { status: 403 }) };
  }
  return { user: access.user };
}

export async function getMobileBearerToken() {
  const authorization = (await headers()).get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}
