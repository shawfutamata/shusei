import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getSessionCookieToken } from '@/app/app-auth';
import { getMobileSessionAccess } from '@/db/data';
import { lineFriendUrl, lineLoginReady, lineMessagingReady } from '@/app/line-auth';
import { lineAccountStatus, setLinePreferences, stopLineEmailNotices } from '@/db/line-accounts';
import { cleanupLineTransientData } from '@/db/line-notifications';
const headers = { 'Cache-Control': 'no-store' };
export async function GET() {
  const token = await getSessionCookieToken(), access = token ? await getMobileSessionAccess(token) : null;
  if (!access) return NextResponse.json({ error: 'ログインしてください。' }, { status: 401, headers });
  await cleanupLineTransientData();
  return NextResponse.json({ ...await lineAccountStatus(access.user.userId, token), withdrawalReady: env.ACCOUNT_ERASURE_ENABLED === 'true', enabled: lineLoginReady(), notificationsReady: lineMessagingReady(), friendUrl: lineFriendUrl() }, { headers });
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: '送信元を確認してください。' }, { status: 403, headers });
  const token = await getSessionCookieToken(), access = token ? await getMobileSessionAccess(token) : null;
  if (!access) return NextResponse.json({ error: 'ログインしてください。' }, { status: 401, headers });
  try {
    const text = await request.text(); if (text.length > 1000) throw new Error('入力を確認してください。'); const body = JSON.parse(text);
    if (body.action === 'stop_email') await stopLineEmailNotices(access.user.userId);
    else if (body.action === 'preferences' && body.message === false && body.offer === false) await setLinePreferences(access.user.userId, false, false);
    else throw new Error('通知を有効にするには、LINEで本人確認してください。連携解除はメール認証から行えます。');
    return GET();
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '保存できませんでした。' }, { status: 400, headers }); }
}
