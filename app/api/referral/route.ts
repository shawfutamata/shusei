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

  // 申し込みボタンを出すかどうかは、この2行だけで決まる（環境変数を見るだけ）。
  // **招待まわりが転んでも、ここは必ず返す。** ひとつでも例外が漏れると
  // 画面は referral を受け取れず、Stripeが設定済みでも「準備中」に見える。
  // 申し込みボタンが黙って消えるのは、いちばん高くつく壊れ方なので。
  const billingBase = { ready: stripeConfigured(), yearly: yearlyConfigured() };

  try {
    // 資格の判定はここで走る。有料会員のぶんは、確定と同時にStripeの残高へ入れる。
    const summary = await getReferralSummary(gate.user.userId);
    const creditedYen = await applyReferralCreditsToStripe(gate.user.userId).catch(() => 0);
    const link = await getStripeLink(gate.user.userId);
    const plan = currentPlan(await getPlanState(gate.user.userId));

    return NextResponse.json({
      ...summary,
      url: `${new URL(request.url).origin}/join/${summary.code}`,
      billing: {
        ...billingBase,
        hasCustomer: Boolean(link.customerId),
        cycle: link.interval,
        creditedYen,
        // 紹介1人ぶんの値引き額。年払いの人は割引後の月あたり額になる。
        creditPerReferralYen: plan === 'free' ? 0 : referralCreditYen(plan, link.interval),
      },
    });
  } catch (error) {
    // 招待の数字は出せなくても、支払いの入口だけは残す。
    // 何が転んだかはログに残す（画面には出さない）。
    console.error('referral summary failed', error);
    return NextResponse.json({
      code: '', url: '', invitedCount: 0, waitingCount: 0, activeCount: 0, qualifyingCount: 0,
      earnedMonths: 0, waitingCredits: 0, appliedMonths: 0, remaining: 0, capTotal: 0, qualifyDays: 30,
      /** 招待まわりの数字が読めていない。画面はこれを見て、招待欄だけ引っ込める。 */
      degraded: true,
      billing: { ...billingBase, hasCustomer: false, cycle: 'month' as const, creditedYen: 0, creditPerReferralYen: 0 },
    });
  }
}
