import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminDeleteRequest } from '@/db/admin';

// 会員をまたいで、問題のある案件を消す。やり取りと紹介も一緒に消える。
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  try {
    await adminDeleteRequest(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '削除できませんでした。' }, { status: 400 });
  }
}
