import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/app/app-auth';
import { GOOGLE_STATE_COOKIE, exchangeGoogleCode, googleRedirectUri } from '@/app/google-auth';
import { startMemberSessionByEmail } from '@/db/data';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const expectedState = (await cookies()).get(GOOGLE_STATE_COOKIE)?.value ?? '';
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';

  // stateが一致しなければ、こちらが始めたログインではない。
  if (!code || !state || state !== expectedState) {
    return redirectHome(request, 'failed');
  }

  let session;
  try {
    const email = await exchangeGoogleCode(code, googleRedirectUri(request));
    session = await startMemberSessionByEmail(email);
  } catch (error) {
    const reason = error instanceof Error && error.message.includes('利用権限') ? 'denied' : 'notmember';
    return redirectHome(request, reason);
  }

  const response = redirectHome(request);
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: new Date(session.expiresAt),
  });
  return response;
}

function redirectHome(request: Request, login?: string) {
  const target = new URL(login ? `/?login=${login}` : '/', request.url);
  const response = NextResponse.redirect(target);
  response.cookies.set(GOOGLE_STATE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
