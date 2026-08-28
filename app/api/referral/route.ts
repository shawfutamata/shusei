import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getReferralSummary } from '@/db/data';

// Web専用。無料月の残高を含むので、アプリからは呼ばない（/api/invite を使う）。
export async function GET(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const summary = await getReferralSummary(gate.user.userId);
  return NextResponse.json({ ...summary, url: `${new URL(request.url).origin}/join/${summary.code}` });
}
