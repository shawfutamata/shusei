import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { deleteMessage } from '@/db/data';
import { errorResponse } from '@/app/paywall-response';

// メッセージ1通を消す。**消せるのは送った本人だけ**（db/data.ts で確かめる）。
// 取り消せないので、画面側では消す前に確かめてから呼ぶこと。
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    await deleteMessage(gate.user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, '削除できませんでした。');
  }
}
