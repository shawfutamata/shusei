import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getChatGPTUser, type ChatGPTUser } from './chatgpt-auth';
import { getMembershipAccess, getMobileSessionUser, upsertMember, type MembershipAccess } from '@/db/data';

export type AppAccess = { user: ChatGPTUser; membership: MembershipAccess };

export async function getAppAccess(): Promise<AppAccess | null> {
  const browserUser = await getChatGPTUser();
  if (browserUser) {
    await upsertMember(browserUser);
    return { user: browserUser, membership: await getMembershipAccess(browserUser.userId) };
  }

  const token = await getMobileBearerToken();
  if (!token) return null;
  const mobileUser = await getMobileSessionUser(token);
  if (!mobileUser) return null;
  return { user: mobileUser, membership: await getMembershipAccess(mobileUser.userId) };
}

export async function getAppUser(): Promise<ChatGPTUser | null> {
  const browserUser = await getChatGPTUser();
  if (browserUser) return browserUser;

  const token = await getMobileBearerToken();
  return token ? getMobileSessionUser(token) : null;
}

export async function requireActiveMember(): Promise<{ user: ChatGPTUser; response?: never } | { user?: never; response: NextResponse }> {
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
