import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getReferralSummary } from '@/db/data';

// アプリからも呼ぶ経路。会費・割引に関わる数字は返さない。
// （App Store 3.1.1 / docs/billing-architecture.md「アプリ内に価格・割引を置かない」）
export async function GET(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const summary = await getReferralSummary(gate.user.userId);
  return NextResponse.json({
    code: summary.code,
    url: `${new URL(request.url).origin}/join/${summary.code}`,
    invitedCount: summary.invitedCount,
    waitingCount: summary.waitingCount,
    activeCount: summary.activeCount,
  });
}
