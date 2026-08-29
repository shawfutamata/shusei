// 紹介でたまった無料月を、Stripeの顧客残高に入れる。**Web専用**（金額を扱うため）。
//
// 値引きは「いま払っている料金の1ヶ月ぶん」。年払いの人は割引後の月あたり額になるので、
// 年払いの20%OFFと紹介の無料月が二重取りにならない。
import { creditCustomer, referralCreditYen, stripeConfigured } from './stripe';
import { getPlanState, getStripeLink, markReferralCreditsApplied, unappliedReferralCredits } from '@/db/data';
import { currentPlan } from './entitlements';

/**
 * まだ請求に当てていない無料月を、その場でStripeの残高に入れる。
 * 有料会員だけが対象（無料会員はプレミアム1ヶ月として受け取り済み）。
 * 何度呼んでも二重にはならない（当てたぶんは applied_month を埋める）。
 * @returns 入れた金額（円）。0なら何もしていない。
 */
export async function applyReferralCreditsToStripe(memberId: string) {
  if (!stripeConfigured()) return 0;
  const link = await getStripeLink(memberId);
  if (!link.customerId) return 0;

  const plan = currentPlan(await getPlanState(memberId));
  if (plan === 'free') return 0;

  const credits = await unappliedReferralCredits(memberId);
  if (!credits.length) return 0;

  const perCredit = referralCreditYen(plan, link.interval);
  const total = perCredit * credits.length;
  if (total <= 0) return 0;

  try {
    await creditCustomer(link.customerId, total, `紹介 ${credits.length}人ぶんの無料月`);
  } catch (error) {
    // 入れられなかったときは applied_month を埋めない。次に開いたときやり直す。
    console.error('referral credit failed', error);
    return 0;
  }
  await markReferralCreditsApplied(credits, new Date().toISOString().slice(0, 7));
  return total;
}
