import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { deleteMobilePushToken, saveMobilePushToken } from '@/db/data';

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
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
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token) await deleteMobilePushToken(user, token);
  return NextResponse.json({ ok: true });
}
