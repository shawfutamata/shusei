import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createIntroduction, listMyIntroductions } from '@/db/data';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  return NextResponse.json({ introductions: await listMyIntroductions(user) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const requestId = clean(body.requestId, 80);
  const personName = clean(body.personName, 60);
  const personCompany = clean(body.personCompany, 80);
  const relationship = clean(body.relationship, 120);
  const fitReason = clean(body.fitReason, 400);
  if (!requestId || !personName || !personCompany || !relationship || !fitReason || body.consentConfirmed !== true) {
    return NextResponse.json({ error: '紹介先の了承を確認し、必須項目を入力してください。' }, { status: 400 });
  }
  try {
    const id = await createIntroduction(user, { requestId, personName, personCompany, relationship, fitReason });
    return NextResponse.json({ id, points: 10 }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '紹介を登録できませんでした。' }, { status: 400 });
  }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
