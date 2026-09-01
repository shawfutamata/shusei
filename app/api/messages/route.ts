import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getMessageThreads, markThreadRead } from '@/db/data';

/** その人の個別メッセージ。3か所に散っているやり取りを1つの箱にして返す。 */
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const threads = await getMessageThreads(gate.user.userId);
  return NextResponse.json({ threads, unread: threads.reduce((total, thread) => total + thread.unread, 0) });
}

/** ここまで読んだ、と記録する。開いたときに画面から呼ぶ。 */
export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  try {
    const { key } = await request.json() as { key?: string };
    await markThreadRead(gate.user, key ?? '');
    const threads = await getMessageThreads(gate.user.userId);
    return NextResponse.json({ threads, unread: threads.reduce((total, thread) => total + thread.unread, 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '記録できませんでした。' }, { status: 400 });
  }
}
