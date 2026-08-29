import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adDailyStats } from '@/db/data';

// **Web専用**。自分が出した広告の、日ごとの成果。
// 他人の枠は返さない（memberId で絞っている）。
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  const stats = await adDailyStats(gate.user.userId, id);
  if (!stats) return NextResponse.json({ error: 'この枠は見られません。' }, { status: 404 });
  return NextResponse.json(stats);
}
