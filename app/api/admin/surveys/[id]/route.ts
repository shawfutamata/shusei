import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminIntroduceSurveyMember } from '@/db/admin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '見つかりません。' }, { status: 404 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { memberId?: unknown; note?: unknown };
  if (typeof body.memberId !== 'string' || typeof body.note !== 'string') {
    return NextResponse.json({ error: '紹介する会員を選んでください。' }, { status: 400 });
  }
  try {
    await adminIntroduceSurveyMember(id, body.memberId, body.note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '紹介できませんでした。' }, { status: 400 });
  }
}
