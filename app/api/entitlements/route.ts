import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getPlanSummary } from '@/db/data';

// アプリ・Web共用。使えるかどうかと件数だけを返す。
// 金額・割引・購入への誘導は含めない（App Store 3.1.1 / docs/billing-architecture.md）。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const plan = await getPlanSummary(gate.user.userId);
  return NextResponse.json({
    pro: plan.pro,
    requestsThisMonth: plan.requestsThisMonth,
    requestLimit: plan.requestLimit,
    businessCards: plan.businessCards,
    businessCardLimit: plan.businessCardLimit,
  });
}
