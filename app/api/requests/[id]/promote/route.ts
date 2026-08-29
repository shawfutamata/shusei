import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { promoteRequest } from '@/db/data';

// 自分の探しごとを、選んだ業種の一覧で先頭に出す。DIAMONDの特典で、ひと月に1件まで。
// ランクと持ち主の確認は db/data.ts の中で行う。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { industry?: string };
  const industry = typeof body.industry === 'string' ? body.industry : '';
  if (!industry) return NextResponse.json({ error: '業種をお選びください。' }, { status: 400 });
  try {
    return NextResponse.json(await promoteRequest(gate.user.userId, id, industry));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '設定できませんでした。' }, { status: 400 });
  }
}
