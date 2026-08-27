import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { deletePushSubscription, savePushSubscription } from '@/db/data';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  return NextResponse.json({ available: Boolean(env.VAPID_PUBLIC_KEY), publicKey: env.VAPID_PUBLIC_KEY || '' });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.slice(0, 2048) : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh.slice(0, 256) : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth.slice(0, 128) : '';
  if (!isAllowedPushEndpoint(endpoint) || p256dh.length < 40 || auth.length < 12) {
    return NextResponse.json({ error: '通知端末の情報を確認してください。' }, { status: 400 });
  }
  await savePushSubscription(user, { endpoint, expirationTime: null, keys: { p256dh, auth } });
  return NextResponse.json({ saved: true });
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as { endpoint?: unknown };
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.slice(0, 2048) : '';
  if (!endpoint) return NextResponse.json({ error: '通知端末が見つかりません。' }, { status: 400 });
  await deletePushSubscription(user, endpoint);
  return NextResponse.json({ deleted: true });
}

function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === 'fcm.googleapis.com' || hostname.endsWith('.googleapis.com') ||
      hostname === 'updates.push.services.mozilla.com' || hostname.endsWith('.push.services.mozilla.com') ||
      hostname === 'web.push.apple.com' || hostname.endsWith('.push.apple.com') ||
      hostname.endsWith('.notify.windows.com');
  } catch {
    return false;
  }
}
