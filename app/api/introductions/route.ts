import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { createIntroduction, getReceivedIntroductions, getSentIntroductions, type OfferKind } from '@/db/data';
import { errorResponse } from '@/app/paywall-response';

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
  const kind: OfferKind = body.kind === 'self' ? 'self' : 'referral';
  // 自社で請け負うオファーには「間柄」がない。相手は自分だからで、
  // 入力を求めても書きようがないため、決まった一言を入れておく。
  const person = kind === 'self' ? relationship || '自社で請け負います' : relationship;
  // 他人を差し出すときだけ、本人の了承を確かめる。自分の会社を出すのに
  // 自分の了承を取らせるのは、意味のない一手間になる。
  const consented = kind === 'self' || body.consentConfirmed === true;
  if (!requestId || !personName || !personCompany || !person || !fitReason || !consented) {
    return NextResponse.json({ error: 'オファーする方の了承を確認し、必須項目を入力してください。' }, { status: 400 });
  }
  try {
    const id = await createIntroduction(user, { requestId, personName, personCompany, relationship: person, fitReason, kind });
    return NextResponse.json({ id, points: 10 }, { status: 201 });
  } catch (error) {
    return errorResponse(error, 'オファーを送れませんでした。');
  }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
