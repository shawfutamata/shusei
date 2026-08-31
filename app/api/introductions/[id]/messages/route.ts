import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { INTRODUCTION_MESSAGE_MAX, addIntroductionMessage, listIntroductionMessages } from '@/db/data';
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    const { body } = await request.json() as { body?: string };
    return NextResponse.json({ messages: await addIntroductionMessage(gate.user, id, body ?? '') }, { status: 201 });
  } catch (error) {
    return errorResponse(error, '送れませんでした。');
  }
}
