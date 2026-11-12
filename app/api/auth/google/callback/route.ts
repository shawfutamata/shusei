import {meeting} from '@/db/meetings';
import {startMeetingAccount} from '@/db/meeting-accounts';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/app/app-auth';
import { GOOGLE_PROFILE_COOKIE, GOOGLE_MEETING_COOKIE, GOOGLE_INVITE_COOKIE, GOOGLE_RETURN_COOKIE, GOOGLE_SIGNUP_COOKIE, GOOGLE_STATE_COOKIE, exchangeGoogleCode, googleRedirectUri, safeReturnPath } from '@/app/google-auth';
import { startMemberSessionByEmail } from '@/db/data';
import { memberLoginPath } from '@/app/auth-return';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const expectedState = jar.get(GOOGLE_STATE_COOKIE)?.value ?? '';
  const inviteCode = jar.get(GOOGLE_INVITE_COOKIE)?.value ?? '';
  const directSignup = jar.get(GOOGLE_SIGNUP_COOKIE)?.value === '1';
  // 入ってきた場所。無ければ掲示板のトップ。
  const back = safeReturnPath(jar.get(GOOGLE_RETURN_COOKIE)?.value ?? '');
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  // 新規登録の認証失敗は登録画面へ戻す。会員ログインへ迷い込ませない。
  const authFailure = () => directSignup && !jar.get(GOOGLE_MEETING_COOKIE)?.value
    ? redirectHome(request, undefined, '/register?login=failed')
    : redirectHome(request, 'failed', back);

  // stateが一致しなければ、こちらが始めたログインではない。
  if (!code || !state || state !== expectedState) {
    return authFailure();
  }

  let account;
  try {
    account = await exchangeGoogleCode(code, googleRedirectUri(request));
  } catch {
    return authFailure();
  }

  const meetingId=jar.get(GOOGLE_MEETING_COOKIE)?.value||'';
  if(meetingId) {
    if(!await meeting(meetingId))return redirectHome(request,'failed',back);
    const destination=back===`/meeting/${meetingId}/requests`?back:`/meeting/${meetingId}`;
    try {
      const started=await startMeetingAccount(account.email,account.name,meetingId,jar.get(GOOGLE_PROFILE_COOKIE)?.value||'');
      const response=redirectHome(request,undefined,destination);
      response.cookies.set(SESSION_COOKIE,started.token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',expires:new Date(started.expiresAt)});
      return response;
    }catch{return redirectHome(request,'denied',destination);}
  }
  if(directSignup&&jar.get(GOOGLE_PROFILE_COOKIE)?.value) {
    try{const started=await startMeetingAccount(account.email,account.name,'direct',jar.get(GOOGLE_PROFILE_COOKIE)!.value);
      const response=redirectHome(request,undefined,'/register/complete');
      response.cookies.set(SESSION_COOKIE,started.token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',expires:new Date(started.expiresAt)});return response;
    }catch{return redirectHome(request,undefined,'/register?login=failed');}
  }
  let session;
  try {
    session = await startMemberSessionByEmail(account.email);
  } catch (error) {
    if (error instanceof Error && error.message.includes('利用権限')) {
      return redirectHome(request, directSignup ? 'pending' : 'denied', back);
    }
    // ログインは登録への同意ではない。退会直後のOAuth callbackからも
    // 勝手に会員を作り直さず、規約同意とdraftのある登録入口へ戻す。
    if (inviteCode || directSignup) {
      return redirectHome(request, undefined, inviteCode ? `/register?invite=${encodeURIComponent(inviteCode)}` : '/register');
    }
    return redirectHome(request, 'notmember', back);
  }

  const response = redirectHome(request, undefined, back.startsWith('/login/member') ? '/' : back);
  response.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: new Date(session.expiresAt),
  });
  return response;
}

function redirectHome(request: Request, login?: string, back = '') {
  // Show failures in the login form and preserve the intended destination for retry.
  const survey=/^\/meeting\/[a-zA-Z0-9-]+(?:\/requests)?$/.test(back);
  const target = new URL(survey&&login?`${back}?login=${encodeURIComponent(login)}`:login && login !== 'early' && login !== 'invited'
    ? memberLoginPath(back, login)
    : login ? `/?login=${encodeURIComponent(login)}` : back || '/', request.url);
  const response = NextResponse.redirect(target);
  for (const name of [GOOGLE_PROFILE_COOKIE, GOOGLE_MEETING_COOKIE, GOOGLE_STATE_COOKIE, GOOGLE_INVITE_COOKIE, GOOGLE_SIGNUP_COOKIE, GOOGLE_RETURN_COOKIE]) {
    response.cookies.set(name, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  }
  return response;
}
