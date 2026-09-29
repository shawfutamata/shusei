import {signupDraft} from '@/db/meeting-accounts';
import {meeting} from '@/db/meetings';
import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { GOOGLE_PROFILE_COOKIE, GOOGLE_MEETING_COOKIE, GOOGLE_INVITE_COOKIE, GOOGLE_RETURN_COOKIE, GOOGLE_SIGNUP_COOKIE, GOOGLE_STATE_COOKIE, googleRedirectUri, safeReturnPath } from '@/app/google-auth';
import { memberLoginPath } from '@/app/auth-return';

export async function GET(request: Request) {
  const query=new URL(request.url).searchParams;
  const meetingId=query.get('meeting')||'';
  const survey=meetingId?await meeting(meetingId):null;
  const surveyBack=survey&&query.get('return_to')===`/meeting/${survey.id}/requests`?`/meeting/${survey.id}/requests`:survey?`/meeting/${survey.id}`:'';
  if(meetingId&&!survey)return NextResponse.json({error:'アンケートが見つかりません。'},{status:404});
  if (!env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(new URL(surveyBack?surveyBack+'?login=unconfigured':memberLoginPath(new URL(request.url).searchParams.get('return_to') ?? '', 'unconfigured'), request.url));
  }
  const draft=query.get('draft')||'';
  if(draft&&!await signupDraft(survey?.id||'direct',draft))return NextResponse.redirect(new URL(surveyBack+'?login=failed',request.url));
  const state = crypto.randomUUID();
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', googleRedirectUri(request));
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid email profile');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authorize);
  response.cookies.set(GOOGLE_PROFILE_COOKIE,draft,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:draft?600:0});
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  });
  // どこから入ったか。**管理画面から入った人を掲示板に放り出さない。**
  // 行き先は自分のサイトの中だけ。外部のURLを渡されても捨てる。
  response.cookies.set(GOOGLE_MEETING_COOKIE,survey?.id||'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:survey?600:0});
  const back = !survey&&draft?'/register/complete':surveyBack || safeReturnPath(new URL(request.url).searchParams.get('return_to'));
  response.cookies.set(GOOGLE_RETURN_COOKIE, back, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: back ? 600 : 0,
  });
  // 招待リンク経由なら、戻ってきたときに誰の紹介かが分かるように持っておく。
  const invite = (new URL(request.url).searchParams.get('invite') ?? '').trim().toUpperCase().slice(0, 16);
  response.cookies.set(GOOGLE_INVITE_COOKIE, invite, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: invite ? 600 : 0,
  });
  // LPの登録と通常ログインを区別し、ログイン操作だけで会員登録しない。
  const signup = new URL(request.url).searchParams.get('signup') === '1';
  response.cookies.set(GOOGLE_SIGNUP_COOKIE, signup ? '1' : '', {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: signup ? 600 : 0,
  });
  return response;
}
