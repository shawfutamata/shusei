import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { GOOGLE_STATE_COOKIE, googleRedirectUri } from '@/app/google-auth';

export async function GET(request: Request) {
  if (!env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(new URL('/?login=unconfigured', request.url));
  }
  const state = crypto.randomUUID();
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', googleRedirectUri(request));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authorize);
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  });
  return response;
}
