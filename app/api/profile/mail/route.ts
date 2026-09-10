import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getMailOnMessage, setMailOnMessage } from '@/db/data';

// **Web専用**。メッセージが届いたときのメールを、会員が自分で止められるようにする。
//
// プロフィールの保存（/api/profile）に混ぜていない。あちらは顔写真まで含む
// 大きなフォームで、切り替えのたびに全部を送り直すことになるため。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  return NextResponse.json({ on: await getMailOnMessage(gate.user.userId) });
}

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { on } = await request.json().catch(() => ({ on: true })) as { on?: boolean };
  return NextResponse.json({ on: await setMailOnMessage(gate.user.userId, on !== false) });
}
