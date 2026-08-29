import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { extendRequest } from '@/db/data';

// 募集の期限を延ばす。EMERALD以上の特典で、1件につき1回まで。
// ランクの確認は db/data.ts の中で行う（画面は隠すだけ、止めるのはサーバー）。
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    return NextResponse.json({ deadline: await extendRequest(gate.user.userId, id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '延長できませんでした。' }, { status: 400 });
  }
}
