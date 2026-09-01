import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { GOOGLE_INVITE_COOKIE, GOOGLE_RETURN_COOKIE, GOOGLE_STATE_COOKIE, googleRedirectUri, safeReturnPath } from '@/app/google-auth';

export async function GET(request: Request) {
  if (!env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(new URL('/?login=unconfigured', request.url));
  }
  const state = crypto.randomUUID();
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', googleRedirectUri(request));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authorize);
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  });
  // どこから入ったか。**管理画面から入った人を掲示板に放り出さない。**
  // 行き先は自分のサイトの中だけ。外部のURLを渡されても捨てる。
  const back = safeReturnPath(new URL(request.url).searchParams.get('return_to'));
  response.cookies.set(GOOGLE_RETURN_COOKIE, back, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: back ? 600 : 0,
  });
  // 招待リンク経由なら、戻ってきたときに誰の紹介かが分かるように持っておく。
  const invite = (new URL(request.url).searchParams.get('invite') ?? '').trim().toUpperCase().slice(0, 16);
  response.cookies.set(GOOGLE_INVITE_COOKIE, invite, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: invite ? 600 : 0,
  });
  return response;
}
