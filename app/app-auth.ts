import { headers } from 'next/headers';
import { getChatGPTUser, type ChatGPTUser } from './chatgpt-auth';
import { getMobileSessionUser } from '@/db/data';

export async function getAppUser(): Promise<ChatGPTUser | null> {
  const browserUser = await getChatGPTUser();
  if (browserUser) return browserUser;

  const requestHeaders = await headers();
  const authorization = requestHeaders.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return null;
  return getMobileSessionUser(authorization.slice(7).trim());
}

export async function getMobileBearerToken() {
  const authorization = (await headers()).get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}
