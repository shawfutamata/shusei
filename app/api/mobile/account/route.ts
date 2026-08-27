import { NextResponse } from 'next/server';
import { getMobileBearerToken } from '@/app/app-auth';
import { deleteMobileAccount, getMobileSessionAccess } from '@/db/data';

export async function DELETE() {
  const token = await getMobileBearerToken();
  const access = token ? await getMobileSessionAccess(token) : null;
  if (!access) return NextResponse.json({ error: 'アプリからログインし直してください。' }, { status: 401 });
  await deleteMobileAccount(access.user);
  return NextResponse.json({ ok: true });
}
