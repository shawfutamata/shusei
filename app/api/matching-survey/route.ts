import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { closeMatchingSurvey, createMatchingSurvey, getMatchingSurveys } from '@/db/data';

export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  return NextResponse.json({ surveys: await getMatchingSurveys(gate.user.userId) });
}

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const body = await request.json().catch(() => ({})) as {
    title?: unknown; industryTags?: unknown; details?: unknown; closeId?: unknown;
  };
  try {
    if (typeof body.closeId === 'string') {
      await closeMatchingSurvey(gate.user.userId, body.closeId);
      return NextResponse.json({ ok: true });
    }
    if (typeof body.title !== 'string' || !Array.isArray(body.industryTags)
      || !body.industryTags.every((tag) => typeof tag === 'string')
      || typeof body.details !== 'string') {
      return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 });
    }
    await createMatchingSurvey(gate.user, {
      title: body.title,
      industryTags: body.industryTags,
      details: body.details,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '送信できませんでした。' }, { status: 400 });
  }
}
