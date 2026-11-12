import { NextResponse } from 'next/server';
import { lineSignupReady } from '@/app/line-auth';
import { allowLineSignupSubmission, LINE_SIGNUP_BROWSER_COOKIE, requestLineSignup, verifyLineSignup } from '@/db/line-signup';

const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: '送信元を確認してください。' }, { status: 403, headers });
  if (!lineSignupReady()) return NextResponse.json({ error: 'LINE登録は現在ご利用いただけません。' }, { status: 503, headers });
  try {
    const body = await boundedJson(request);
    if (body.action !== 'request' && body.action !== 'verify') throw new Error('登録操作を確認してください。');
    if (!await allowLineSignupSubmission(request.headers.get('cf-connecting-ip') || 'local', body.action)) return NextResponse.json({ error: '操作が集中しています。10分ほど待ってから再試行してください。' }, { status: 429, headers });
    const browser = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${LINE_SIGNUP_BROWSER_COOKIE}=`))?.slice(LINE_SIGNUP_BROWSER_COOKIE.length + 1) || '';
    if (body.action === 'request') {
      const result = await requestLineSignup({ name: body.name, email: body.email, invite: body.invite, consent: body.consent, lineConsent: body.lineConsent, mailConsent: body.mailConsent, draftId: body.draftId }, browser);
      const response = NextResponse.json({ draftId: result.draftId }, { headers });
      response.cookies.set(LINE_SIGNUP_BROWSER_COOKIE, result.browserToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 1200 });
      return response;
    }
    if (typeof body.draftId !== 'string' || typeof body.code !== 'string') throw new Error('6桁の確認コードを入力してください。');
    await verifyLineSignup(body.draftId, browser, body.code);
    return NextResponse.json({ next: `/api/auth/line/start?signup=1&draft=${encodeURIComponent(body.draftId)}` }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '登録できませんでした。' }, { status: 400, headers });
  }
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('入力形式を確認してください。');
  const limit = 4096;
  if (Number(request.headers.get('content-length')) > limit) throw new Error('入力が長すぎます。');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('入力を確認してください。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error('入力が長すぎます。'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('入力を確認してください。'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('入力を確認してください。');
  return body as Record<string, unknown>;
}
