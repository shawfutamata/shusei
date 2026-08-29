import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getPlanSummary, syncReferralBenefits } from '@/db/data';

// アプリ・Web共用。使えるかどうかと件数だけを返す。
// 金額・割引・購入への誘導は含めない（App Store 3.1.1 / docs/billing-architecture.md）。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  // 招待の特典はここで確定させる。招待画面を開かない会員も、
  // アプリやWebが「いま何が使えるか」を聞いた時点で特典が反映される。
  await syncReferralBenefits(gate.user.userId).catch(() => undefined);
  const plan = await getPlanSummary(gate.user.userId);
  return NextResponse.json({
    plan: plan.activePlan,
    paid: plan.paid,
    requestsThisMonth: plan.requestsThisMonth,
    requestLimit: plan.requestLimit,
    requestsLeft: plan.requestsLeft,
  });
}
