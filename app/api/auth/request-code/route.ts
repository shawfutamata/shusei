import { NextResponse } from 'next/server';
import { requestMobileAuthCode } from '@/db/data';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown };
    await requestMobileAuthCode(typeof body.email === 'string' ? body.email : '');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '認証コードを送信できませんでした。' }, { status: 400 });
  }
}
