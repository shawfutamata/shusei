import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { updateAdSlot } from '@/db/data';
import { AD_TITLE_MAX } from '@/app/ad-options';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** 端末側で縮小してから送る前提の上限。ここは念のための歯止め。 */
const maxImageBytes = 1_500_000;

// **Web専用**。買った枠に、見出し・リンク・画像を入れる。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;

  const form = await request.formData();
  const title = String(form.get('title') ?? '').trim();
  const linkUrl = String(form.get('linkUrl') ?? '').trim();
  if (!title) return NextResponse.json({ error: '見出しを入れてください。' }, { status: 400 });
  if (title.length > AD_TITLE_MAX) {
    return NextResponse.json({ error: `見出しは${AD_TITLE_MAX}文字までです。` }, { status: 400 });
  }

  const file = form.get('image');
  let image: { bytes: ArrayBuffer; contentType: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: '画像はJPEG・PNG・WebPのいずれかにしてください。' }, { status: 400 });
    }
    if (file.size > maxImageBytes) {
      return NextResponse.json({ error: '画像が大きすぎます。もう一度選び直してください。' }, { status: 400 });
    }
    image = { bytes: await file.arrayBuffer(), contentType: file.type };
  }

  try {
    await updateAdSlot(gate.user.userId, id, { title, linkUrl, image });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存できませんでした。' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
