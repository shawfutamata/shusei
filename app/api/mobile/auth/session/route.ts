import { NextResponse } from 'next/server';
import { getAppUser, getMobileBearerToken } from '@/app/app-auth';
import { getMembershipAccess, revokeMobileSession } from '@/db/data';

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  return NextResponse.json({ user, membership: await getMembershipAccess(user.userId) });
}

export async function DELETE() {
  const token = await getMobileBearerToken();
  if (token) await revokeMobileSession(token);
  return NextResponse.json({ ok: true });
}
