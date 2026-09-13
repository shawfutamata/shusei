import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { INTRODUCTION_MESSAGE_MAX, addIntroductionMessage, listIntroductionMessages } from '@/db/data';
import { MESSAGE_IMAGE_MAX_BYTES } from '@/app/message-options';
import { errorResponse } from '@/app/paywall-response';

// 紹介1件ごとの、投稿者と紹介者だけのやり取り。
//
// **読めるのも書けるのもその2人だけ。** 確かめているのは db/data.ts の
// `introductionPartner()` で、GETもPOSTも必ずそこを通る。関係のない人が
// URLを打っても、空ではなく400で断る。
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    return NextResponse.json({ messages: await listIntroductionMessages(gate.user, id), max: INTRODUCTION_MESSAGE_MAX });
  } catch (error) {
    return errorResponse(error, '表示できませんでした。');
  }
}

// 画像を付けるときだけ multipart。文章だけのときは今までどおりJSONで来る。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
    if (!multipart) {
      const { body } = await request.json() as { body?: string };
      return NextResponse.json({ messages: await addIntroductionMessage(gate.user, id, body ?? '') }, { status: 201 });
    }
    const form = await request.formData();
    const body = String(form.get('body') ?? '');
    const picked = form.get('image');
    let image: { bytes: ArrayBuffer; contentType: string } | undefined;
    if (picked instanceof File && picked.size > 0) {
      // 端末で長辺1400pxのJPEGに焼き直してから送っている。ここは**歯止め**。
      if (picked.size > MESSAGE_IMAGE_MAX_BYTES) {
        return NextResponse.json({ error: '画像が大きすぎます。別の写真をお試しください。' }, { status: 400 });
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(picked.type)) {
        return NextResponse.json({ error: '画像はJPEG・PNG・WebPに対応しています。' }, { status: 400 });
      }
      image = { bytes: await picked.arrayBuffer(), contentType: picked.type };
    }
    return NextResponse.json({ messages: await addIntroductionMessage(gate.user, id, body, image) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, '送れませんでした。');
  }
}
