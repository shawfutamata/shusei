import { NextResponse } from 'next/server';
import { SESSION_COOKIE, getSessionCookieToken } from '@/app/app-auth';
import { revokeMobileSession, verifyMobileAuthCode } from '@/db/data';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; code?: unknown };
    const session = await verifyMobileAuthCode(typeof body.email === 'string' ? body.email : '', typeof body.code === 'string' ? body.code : '');
    const response = NextResponse.json({ user: session.user });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ログインできませんでした。' }, { status: 400 });
  }
}

export async function DELETE() {
  const token = await getSessionCookieToken();
  if (token) await revokeMobileSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
