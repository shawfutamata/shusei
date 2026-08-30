import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { listMyRequests } from '@/db/data';

// マイページの「自分の投稿」。掲示板と違って、期限が切れたものも全部返す。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  return NextResponse.json({ requests: await listMyRequests(gate.user) });
}
