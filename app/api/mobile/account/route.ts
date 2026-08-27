import { NextResponse } from 'next/server';
import { getAppUser, getMobileBearerToken } from '@/app/app-auth';
import { deleteMobileAccount } from '@/db/data';

export async function DELETE() {
  const token = await getMobileBearerToken();
  const user = token ? await getAppUser() : null;
  if (!user) return NextResponse.json({ error: 'アプリからログインし直してください。' }, { status: 401 });
  await deleteMobileAccount(user);
  return NextResponse.json({ ok: true });
}
