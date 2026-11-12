import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionCookieToken, SESSION_COOKIE } from '@/app/app-auth';
import { LINE_BROWSER_COOKIE, LINE_SETTINGS_PATH, exchangeLineCode, lineLoginReady, lineSignupReady, lineRecoveryReady } from '@/app/line-auth';
import { consumeLineFlow, linkLineAccount, loginWithLine, registerWithLine, setLinePreferences, removeLineAccount } from '@/db/line-accounts';
import { storeLineAuthorization, recoverLineDeauthorization, requestLineDeauthorization } from '@/db/line-authorization';
import { LINE_PRIVACY_COOKIE, readLinePrivacyGrant, removeLinePrivacyGrants } from '@/db/line-privacy';
import { LINE_SIGNUP_BROWSER_COOKIE } from '@/db/line-signup';
import { hashMobileSecret, getMobileSessionAccess } from '@/db/data';
export async function GET(request: Request) {
  const url = new URL(request.url), jar = await cookies();
  const flow = await consumeLineFlow(url.searchParams.get('state') || '', jar.get(LINE_BROWSER_COOKIE)?.value || '');
  const settingFlow = flow?.mode === 'link' || flow?.mode === 'preferences';
  const recovering = flow?.mode === 'unlink_recovery';
  const home = recovering ? '/account/privacy' : settingFlow ? LINE_SETTINGS_PATH : flow?.mode === 'signup' ? '/register' : '/login/member';
  const fail = (error: string) => redirect(request, `${home}?${settingFlow || recovering ? 'line' : 'login'}=${encodeURIComponent(error)}`);
  if (!flow || !(recovering ? lineRecoveryReady() : lineLoginReady()) || (flow.mode === 'signup' && !lineSignupReady())) return fail('line_failed');
  const code = url.searchParams.get('code');
  if (!code || code.length > 2048 || url.searchParams.has('error')) return fail('line_canceled');
  try {
    const identity = await exchangeLineCode(code, flow.verifier, flow.nonce);
    if (recovering) {
      const grantToken = jar.get(LINE_PRIVACY_COOKIE)?.value || '', grant = await readLinePrivacyGrant(grantToken);
      if (!grant || grant.memberId !== flow.memberId || await hashMobileSecret(grantToken) !== flow.sessionHash) return fail('line_session');
      const proof = { tokenHash: flow.sessionHash, purpose: 'unlink' as const };
      await recoverLineDeauthorization(flow.memberId, identity.sub, identity.accessToken, identity.expiresIn, proof);
      if (await requestLineDeauthorization(flow.memberId, proof) !== 'accepted') return fail('line_pending');
      await removeLineAccount(flow.memberId); await removeLinePrivacyGrants(flow.memberId, 'unlink');
      const token = await getSessionCookieToken(), access = token ? await getMobileSessionAccess(token, { skipLineAuthorization: true }) : null;
      const response = redirect(request, access ? `${LINE_SETTINGS_PATH}?line=line_removed` : '/login/member?login=line_removed');
      response.cookies.set(LINE_PRIVACY_COOKIE, '', {httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
      if (!access) response.cookies.set(SESSION_COOKIE, '', {httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
      return response;
    }
    if (settingFlow) {
      const token = await getSessionCookieToken(), access = token ? await getMobileSessionAccess(token) : null;
      if (!access?.membership.canUseApp || access.user.userId !== flow.memberId || !token || await hashMobileSecret(token) !== flow.sessionHash) return fail('line_session');
    }
    if (flow.mode === 'preferences') {
      const chosen = JSON.parse(flow.draftId) as { message: boolean; offer: boolean };
      await storeLineAuthorization(flow.memberId, identity.sub, identity.accessToken, identity.expiresIn);
      await setLinePreferences(flow.memberId, chosen.message, chosen.offer, { subject: identity.sub });
      return redirect(request, `${LINE_SETTINGS_PATH}?line=preferences_saved`);
    }
    if (flow.mode === 'link') { await linkLineAccount(flow.memberId, identity); return redirect(request, `${LINE_SETTINGS_PATH}?line=linked`); }
    const session = flow.mode === 'signup' ? await registerWithLine(identity, flow.draftId) : await loginWithLine(identity);
    const response = redirect(request, flow.mode === 'signup' ? '/register/complete' : flow.returnTo);
    response.cookies.set(LINE_SIGNUP_BROWSER_COOKIE, '', {httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: new Date(session.expiresAt) });
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    return fail(['denied', 'line_conflict', 'line_unlinked', 'line_draft', 'line_email', 'line_existing', 'line_friend', 'line_consent', 'line_pending'].includes(reason) ? reason : 'line_failed');
  }
}
function redirect(request: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set('Cache-Control', 'no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(LINE_BROWSER_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
