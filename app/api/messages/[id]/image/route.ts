import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { readMessageImage } from '@/db/data';
import { MESSAGE_IMAGE_DAYS } from '@/app/message-options';

// メッセージに付いた画像。**当人2人しか読めない。**
//
// 見つからない・期限切れ・権限なしを**すべて404にまとめる。** 分けて返すと、
// 「そのIDのやり取りは存在する」ことだけが外から分かってしまう。
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  const found = await readMessageImage(gate.user, id).catch(() => null);
  if (!found) return NextResponse.json({ error: '画像が見つかりませんでした。' }, { status: 404 });
  return new Response(found.body, {
    headers: {
      'content-type': found.contentType,
      // 当人しか読めないので private。期限の日数より短く持たせる。
      'cache-control': `private, max-age=${Math.min(86400, MESSAGE_IMAGE_DAYS * 86400)}`,
    },
  });
}
