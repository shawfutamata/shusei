import { NextResponse } from 'next/server';
import { getAppAccess, getMobileBearerToken } from '@/app/app-auth';
import { revokeMobileSession } from '@/db/data';

export async function GET() {
  const access = await getAppAccess();
  if (!access) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  return NextResponse.json({ user: access.user, membership: access.membership });
}

export async function DELETE() {
  const token = await getMobileBearerToken();
  if (token) await revokeMobileSession(token);
  return NextResponse.json({ ok: true });
}
