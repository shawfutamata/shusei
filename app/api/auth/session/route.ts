import { NextResponse } from 'next/server';
import { SESSION_COOKIE, getSessionCookieToken } from '@/app/app-auth';
import { revokeMobileSession } from '@/db/data';

export async function POST() {
  return NextResponse.json({ error: 'WebのログインはGoogleをご利用ください。' }, { status: 403 });
}

export async function DELETE() {
  const token = await getSessionCookieToken();
  if (token) await revokeMobileSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
