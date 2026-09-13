import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { updateAdSlot, withdrawAd } from '@/db/data';
import { readAdContent } from '@/app/ad-upload';

// **Web専用**。買った枠の中身を入れ替える。入れるものは
// タイトル・説明文・リンク・画像の4つだけ（期間は買うときに決まっている）。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;

  const parsed = await readAdContent(await request.formData());
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await updateAdSlot(gate.user.userId, id, parsed.content);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存できませんでした。' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// 掲載を途中で取り下げる。**戻せない。** 空いた枠はすぐ次の人が押さえられる。
// お金と無料券は返らない（app/api/ads/checkout と同じで、返金はStripe側の判断）。
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    await withdrawAd(gate.user.userId, id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '取り下げられませんでした。' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
