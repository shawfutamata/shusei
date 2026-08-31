import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/app/app-auth';
import { startLocalDevSession } from '@/db/data';

// 手元で動かすときのログイン。ChatGPT Sitesが差し込んでいた
// /signin-with-chatgpt の代わり。**本番のビルドには入らない。**
//
// 二重に閉じてある。
//   1. import.meta.env.DEV … 本番ビルドでは false に置き換わるので、
//      下の中身ごと消える。デプロイした先にこの経路は存在しない。
//   2. ホスト名がlocalhost … 開発サーバーを外に出していても入られない。
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!import.meta.env.DEV || !isLocal(url.hostname)) {
    return NextResponse.json({ error: 'この経路は開発中のみ使えます。' }, { status: 404 });
  }

  // ?as=<会員ID> で別の会員として入れる。2人いないと確かめられない画面
  // （紹介のやり取りなど）を手元で見るため。
  const session = await startLocalDevSession(url.searchParams.get('as') ?? '');
  const response = NextResponse.redirect(new URL(returnTo(url), request.url));
  response.cookies.set(SESSION_COOKIE, session.token, {
    // 手元はhttpなので secure は付けない。付けるとCookieが保存されない。
    httpOnly: true, sameSite: 'lax', path: '/', expires: new Date(session.expiresAt),
  });
  return response;
}

function isLocal(hostname: string) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname);
}

/** 戻り先は同一サイト内だけ。`//` で始まる外部URLは受け取らない。 */
function returnTo(url: URL) {
  const value = url.searchParams.get('return_to') ?? '/';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
