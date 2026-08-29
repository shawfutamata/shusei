// Stripeとのやり取りをまとめる。**Web専用**。
// アプリ内に価格・購入導線を置けないため（App Store 3.1.1 /
// docs/billing-architecture.md）、このファイルは mobile/ から参照しない。
//
// 鍵は環境変数から読む。コードにも、やり取りの記録にも書かない。
import Stripe from 'stripe';
import { env } from 'cloudflare:workers';
import { monthlyEquivalentYen } from './plan-catalog';
import type { BillingCycle, Plan } from './entitlements';

/** Workersのfetchで動かす。NodeのhttpモジュールはWorkersに無い。 */
export function stripeClient() {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY が設定されていません。');
  // apiVersion は指定せず、入れたSDKの既定に任せる。SDKを上げたときに
  // 版のずれで落ちるのを避けるため。
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export function stripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_STANDARD);
}

/** 出稿枠の1回きりの支払いが使えるか。 */
export function adSlotConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_AD_SLOT);
}

export function adSlotPriceId() {
  return env.STRIPE_PRICE_AD_SLOT || '';
}

/** 有料プランと Stripe の price を対応させる。無料プランに price は無い。 */
export function priceIdFor(plan: Plan, cycle: BillingCycle) {
  if (plan === 'standard') return (cycle === 'year' ? env.STRIPE_PRICE_STANDARD_YEAR : env.STRIPE_PRICE_STANDARD) || '';
  return '';
}

/** 年払いの価格IDが両方そろっているか。片方だけなら年払いは出さない。 */
export function yearlyConfigured() {
  return Boolean(env.STRIPE_PRICE_STANDARD_YEAR);
}

/** Stripeのpriceから、こちらのプランと周期に戻す。webhookで使う。 */
export function planForPrice(priceId: string): { plan: Plan | ''; cycle: BillingCycle } {
  if (!priceId) return { plan: '', cycle: 'month' };
  if (priceId === env.STRIPE_PRICE_STANDARD) return { plan: 'standard', cycle: 'month' };
  if (priceId === env.STRIPE_PRICE_STANDARD_YEAR) return { plan: 'standard', cycle: 'year' };
  return { plan: '', cycle: 'month' };
}

/**
 * 紹介1人ぶんの値引き額（円）。
 * 「いま払っている料金の1ヶ月ぶん」なので、年払いの人は割引後の月あたり額になる。
 * 20%OFFと紹介の無料月が二重取りにならないようにするため。
 */
export function referralCreditYen(plan: Plan, cycle: BillingCycle) {
  return monthlyEquivalentYen(plan, cycle);
}

/** 顧客の残高に値引きを入れる。次回以降の請求から自動で引かれる。 */
export async function creditCustomer(customerId: string, yen: number, description: string) {
  if (yen <= 0) return;
  const stripe = stripeClient();
  await stripe.customers.createBalanceTransaction(customerId, { amount: -yen, currency: 'jpy', description });
}
