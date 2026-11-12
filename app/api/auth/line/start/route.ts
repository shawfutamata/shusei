import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionCookieToken } from '@/app/app-auth';
import { LINE_BROWSER_COOKIE, LINE_SETTINGS_PATH, lineLoginReady, lineRedirectUri, lineSignupReady, lineMessagingReady, lineRecoveryReady } from '@/app/line-auth';
import { createLineFlow } from '@/db/line-accounts';
import { hashMobileSecret, getMobileSessionAccess } from '@/db/data';
import { verifiedLineSignup, LINE_SIGNUP_BROWSER_COOKIE } from '@/db/line-signup';
import { LINE_PRIVACY_COOKIE, readLinePrivacyGrant } from '@/db/line-privacy';
import { getLineTestOwner } from '@/app/line-test-auth';
import { lineTestReadyForMember } from '@/app/line-test-config';
import { getLineTestStatus } from '@/db/line-test';
import { checkSubmissionLimit } from '@/db/meetings';
export async function GET(request: Request) {
  const url = new URL(request.url), signup = url.searchParams.get('signup') === '1';
  if (!lineLoginReady() || (signup && !lineSignupReady())) return failure(request, signup ? '/register?login=line_unconfigured' : '/login/member?login=line_unconfigured');
  const draft = signup ? url.searchParams.get('draft') || '' : '';
  if (signup) {
    const saved = await verifiedLineSignup(draft, (await cookies()).get(LINE_SIGNUP_BROWSER_COOKIE)?.value || '');
    if (!saved) return failure(request, '/register?login=line_draft');
  }
  return start(request, signup ? 'signup' : 'login', '', '', url.searchParams.get('return_to') || '/', draft);
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: '送信元を確認してください。' }, { status: 403 });
  const body = await request.formData();
  if (body.get('action') === 'test_link') {
    const owner = await getLineTestOwner();
    if (!owner || !lineTestReadyForMember(owner.userId)) return new Response('Not found', { status: 404 });
    const token = await getSessionCookieToken(), access = token ? await getMobileSessionAccess(token) : null;
    if (!token || !access?.membership.canUseApp || access.user.userId !== owner.userId) return failure(request, '/admin/line-test?line=line_session');
    if (body.get('consent') !== 'yes') return failure(request, '/admin/line-test?line=line_consent');
    if ((await getLineTestStatus(owner.userId)).closed) return failure(request, '/admin/line-test?line=line_failed');
    return start(request, 'test_link', owner.userId, await hashMobileSecret(token), '/admin/line-test', '', request.headers.get('accept') === 'application/json');
  }
  if (body.get('action') === 'unlink_recovery') {
    if (!lineRecoveryReady()) return failure(request, '/account/privacy?line=line_unconfigured');
    const token = (await cookies()).get(LINE_PRIVACY_COOKIE)?.value || '', grant = await readLinePrivacyGrant(token);
    if (!grant || body.get('consent') !== 'yes') return failure(request, '/account/privacy?line=line_session');
    return start(request, 'unlink_recovery', grant.memberId, await hashMobileSecret(token), '/account/privacy', '', request.headers.get('accept') === 'application/json');
  }
  if (!lineLoginReady()) return failure(request, `${LINE_SETTINGS_PATH}?line=line_unconfigured`);
  const token = await getSessionCookieToken(), access = token ? await getMobileSessionAccess(token) : null;
  if (!access?.membership.canUseApp || !token) return failure(request, '/login/member?return_to=%2Fsettings%2Fline');
  if (body.get('consent') !== 'yes') return failure(request, `${LINE_SETTINGS_PATH}?line=line_consent`);
  const preferences = body.get('action') === 'preferences';
  if (preferences && !lineMessagingReady()) return failure(request, `${LINE_SETTINGS_PATH}?line=line_unconfigured`);
  return start(request, preferences ? 'preferences' : 'link', access.user.userId, await hashMobileSecret(token), LINE_SETTINGS_PATH, preferences ? JSON.stringify({ message: body.get('message') === 'yes', offer: body.get('offer') === 'yes' }) : '', request.headers.get('accept') === 'application/json');
}
async function start(request: Request, mode: 'login' | 'link' | 'signup' | 'preferences' | 'unlink_recovery' | 'test_link', memberId: string, sessionHash: string, returnTo: string, draftId: string, jsonResponse = false) {
  if (!await checkSubmissionLimit('line-auth', `start:${request.headers.get('cf-connecting-ip') || 'local'}`)) return NextResponse.json({ error: '少し待って再試行してください。' }, { status: 429 });
  const flow = await createLineFlow({ mode, memberId, sessionHash, returnTo, draftId });
  const authorize = new URL('https://access.line.me/oauth2/v2.1/authorize');
  const params = { response_type: 'code', client_id: env.LINE_LOGIN_CHANNEL_ID, redirect_uri: lineRedirectUri(), state: flow.state,
    scope: 'openid', nonce: flow.nonce,
    code_challenge: flow.challenge, code_challenge_method: 'S256' };
  for (const [key, value] of Object.entries(params)) authorize.searchParams.set(key, value);
  const response = jsonResponse ? NextResponse.json({ authorizeUrl: authorize.toString() }) : NextResponse.redirect(authorize, 303);
  response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(LINE_BROWSER_COOKIE, flow.browser, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
function failure(request: Request, path: string) { return NextResponse.redirect(new URL(path, request.url), 303); }
