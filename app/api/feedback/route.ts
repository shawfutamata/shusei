import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { countFeedback, createFeedback } from '@/db/data';
import { isFeedbackCategory } from '@/app/feedback-options';

export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  return NextResponse.json({ sentCount: await countFeedback(gate.user.userId) });
}

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const body = await request.json().catch(() => ({})) as { category?: unknown; body?: unknown };
  if (!isFeedbackCategory(body.category) || typeof body.body !== 'string') {
    return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 });
  }
  try {
    await createFeedback(gate.user, { category: body.category, body: body.body });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '送信できませんでした。' }, { status: 400 });
  }
}
