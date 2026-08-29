import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getPlanState, getReferralSummary, getStripeLink } from '@/db/data';
import { currentPlan } from '@/app/entitlements';
import { referralCreditYen, stripeConfigured, yearlyConfigured } from '@/app/stripe';
import { applyReferralCreditsToStripe } from '@/app/billing-credits';

// Web専用。無料月の残高とお支払いの状態を含むので、アプリからは呼ばない
// （アプリは /api/invite と /api/entitlements を使う）。
export async function GET(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;

  // 資格の判定はここで走る。有料会員のぶんは、確定と同時にStripeの残高へ入れる。
  const summary = await getReferralSummary(gate.user.userId);
  const creditedYen = await applyReferralCreditsToStripe(gate.user.userId).catch(() => 0);
  const link = await getStripeLink(gate.user.userId);
  const plan = currentPlan(await getPlanState(gate.user.userId));

  return NextResponse.json({
    ...summary,
    url: `${new URL(request.url).origin}/join/${summary.code}`,
    billing: {
      ready: stripeConfigured(),
      yearly: yearlyConfigured(),
      hasCustomer: Boolean(link.customerId),
      cycle: link.interval,
      creditedYen,
      // 紹介1人ぶんの値引き額。年払いの人は割引後の月あたり額になる。
      creditPerReferralYen: plan === 'free' ? 0 : referralCreditYen(plan, link.interval),
    },
  });
}
