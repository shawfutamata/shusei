import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminDeleteAd, adminSetAdStopped } from '@/db/admin';

// 広告の掲載を止める／戻す。枠と数字は消さない（お金をいただいているため）。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  const { stopped } = await request.json() as { stopped?: boolean };
  await adminSetAdStopped(id, stopped === true);
  return NextResponse.json({ ok: true });
}

// 広告の枠を記録ごと消す。止めたあとのものだけ（adminDeleteAd 側で確かめる）。
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  try {
    await adminDeleteAd(id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '削除できませんでした。' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
