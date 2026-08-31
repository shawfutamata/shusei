import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/app/app-auth';
import { GOOGLE_INVITE_COOKIE, GOOGLE_STATE_COOKIE, exchangeGoogleCode, googleRedirectUri } from '@/app/google-auth';
import { registerEarlyAccessMember, registerInvitedMember, startMemberSessionByEmail } from '@/db/data';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const expectedState = jar.get(GOOGLE_STATE_COOKIE)?.value ?? '';
  const inviteCode = jar.get(GOOGLE_INVITE_COOKIE)?.value ?? '';
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';

  // stateが一致しなければ、こちらが始めたログインではない。
  if (!code || !state || state !== expectedState) {
    return redirectHome(request, 'failed');
  }

  let account;
  try {
    account = await exchangeGoogleCode(code, googleRedirectUri(request));
  } catch {
    return redirectHome(request, 'failed');
  }

  let session;
  try {
    session = await startMemberSessionByEmail(account.email);
  } catch (error) {
    if (error instanceof Error && error.message.includes('利用権限')) return redirectHome(request, 'denied');
    // 会員ではない。招待コード（＝招待リンク）から来ていれば、そこで登録する。
    // 登録できた人はそのまま使えるようにする。`registerInvitedMember()` は
    // 利用中の会員として書いているので、ここで入口を閉じると「登録は済んで
    // いるのに入れない」という行き止まりになる。招待した人の人数も、この
    // 登録の時点で1人ぶん増える。
    if (inviteCode) {
      const registered = await registerInvitedMember(account.email, account.name, inviteCode);
      if (registered?.alreadyMember) return redirectHome(request, 'denied');
      if (registered) {
        // ここは外側の catch の中。セッションを開くのに失敗しても
        // 登録そのものは済んでいるので、案内を出してもう一度ログイン
        // してもらう。失敗を外へ投げると、真っ白な画面になる。
        try {
          const started = await startMemberSessionByEmail(account.email);
          const welcome = redirectHome(request, 'invited');
          welcome.cookies.set(SESSION_COOKIE, started.token, {
            httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: new Date(started.expiresAt),
          });
          return welcome;
        } catch {
          return redirectHome(request, 'pending');
        }
      }
    }
    // 先行テストの枠（先着50名）。空いていれば、そのまま会員として入れる。
    // 埋まったらこの経路は閉じ、招待リンク経由だけになる。
    const early = await registerEarlyAccessMember(account.email, account.name);
    if (early) {
      const started = await startMemberSessionByEmail(account.email);
      const welcome = redirectHome(request, 'early');
      welcome.cookies.set(SESSION_COOKIE, started.token, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: new Date(started.expiresAt),
      });
      return welcome;
    }
    return redirectHome(request, 'notmember');
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
  for (const name of [GOOGLE_STATE_COOKIE, GOOGLE_INVITE_COOKIE]) {
    response.cookies.set(name, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  }
  return response;
}
