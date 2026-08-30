import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminSetFeedbackDone } from '@/db/admin';

// ご意見に「読んだ」印を付ける／戻す。消さないので、あとから読み返せる。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  const { done } = await request.json() as { done?: boolean };
  await adminSetFeedbackDone(id, done === true);
  return NextResponse.json({ ok: true });
}
