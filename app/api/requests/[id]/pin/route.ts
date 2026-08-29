import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { pinRequest } from '@/db/data';

// 自分の探しごとを一覧の先頭に固定する。SAPPHIRE以上の特典で、ひと月に1件まで。
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    return NextResponse.json({ pinnedUntil: await pinRequest(gate.user.userId, id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '固定できませんでした。' }, { status: 400 });
  }
}
