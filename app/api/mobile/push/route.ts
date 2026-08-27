import { NextResponse } from 'next/server';
import { getAppUser } from '@/app/app-auth';
import { deleteMobilePushToken, saveMobilePushToken } from '@/db/data';

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const platform = typeof body.platform === 'string' ? body.platform : '';
    await saveMobilePushToken(user, token, platform);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '通知を設定できませんでした。' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token) await deleteMobilePushToken(user, token);
  return NextResponse.json({ ok: true });
}
