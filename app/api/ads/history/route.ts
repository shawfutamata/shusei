import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { listMemberAdHistory } from '@/db/data';

// これまでに出した広告を全部。自分の投稿から見返すときに読む。
// 枠を買う画面（/api/ads）は直近90日しか返さないので、そちらとは別にしてある。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  return NextResponse.json({ ads: await listMemberAdHistory(gate.user.userId) });
}
