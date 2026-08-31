import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { createIntroduction, getReceivedIntroductions, getSentIntroductions } from '@/db/data';

// 届いた紹介と、出した紹介の両方を返す。やり取りは2人でするものなので、
// 紹介者の側にも入口が要る。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  const [introductions, sent] = await Promise.all([
    getReceivedIntroductions(user), getSentIntroductions(user),
  ]);
  return NextResponse.json({ introductions, sent });
}

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  const body = await request.json() as Record<string, unknown>;
  const requestId = clean(body.requestId, 80);
  const personName = clean(body.personName, 60);
  const personCompany = clean(body.personCompany, 80);
  const relationship = clean(body.relationship, 120);
  const fitReason = clean(body.fitReason, 400);
  if (!requestId || !personName || !personCompany || !relationship || !fitReason || body.consentConfirmed !== true) {
    return NextResponse.json({ error: 'オファーする方の了承を確認し、必須項目を入力してください。' }, { status: 400 });
  }
  try {
    const id = await createIntroduction(user, { requestId, personName, personCompany, relationship, fitReason });
    return NextResponse.json({ id, points: 10 }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'オファーを送れませんでした。' }, { status: 400 });
  }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
