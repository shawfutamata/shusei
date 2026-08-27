import { NextResponse } from 'next/server';
import { verifyMobileAuthCode } from '@/db/data';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; code?: unknown };
    const session = await verifyMobileAuthCode(typeof body.email === 'string' ? body.email : '', typeof body.code === 'string' ? body.code : '');
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'ログインできませんでした。' }, { status: 400 });
  }
}
