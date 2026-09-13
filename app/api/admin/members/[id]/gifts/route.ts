import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminClearAdGifts } from '@/db/admin';

// その会員が持っている広告の無料券を、まとめて取り消す。
// 行は消さず days_left を 0 にするだけ（何が当たったかの記録は残す）。
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  const cleared = await adminClearAdGifts(id);
  return NextResponse.json({ ok: true, cleared });
}
