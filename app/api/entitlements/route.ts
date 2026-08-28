import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getPlanSummary } from '@/db/data';
import { can } from '@/app/entitlements';

// アプリ・Web共用。使えるかどうかと件数だけを返す。
// 金額・割引・購入への誘導は含めない（App Store 3.1.1 / docs/billing-architecture.md）。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const plan = await getPlanSummary(gate.user.userId);
  return NextResponse.json({
    plan: plan.activePlan,
    paid: plan.paid,
    // アプリはこの真偽値だけを見て、使えない画面を出さない。
    canScanBusinessCards: can(plan, 'scan_business_card'),
    requestsThisMonth: plan.requestsThisMonth,
    requestLimit: plan.requestLimit,
    requestsLeft: plan.requestsLeft,
    businessCards: plan.businessCards,
    businessCardLimit: plan.businessCardLimit,
    businessCardsLeft: plan.businessCardsLeft,
  });
}
