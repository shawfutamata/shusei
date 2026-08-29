// Stripeとのやり取りをまとめる。**Web専用**。
// アプリ内に価格・購入導線を置けないため（App Store 3.1.1 /
// docs/billing-architecture.md）、このファイルは mobile/ から参照しない。
//
// 鍵は環境変数から読む。コードにも、やり取りの記録にも書かない。
import Stripe from 'stripe';
import { env } from 'cloudflare:workers';
import { planCatalog } from './plan-catalog';
import type { Plan } from './entitlements';

/** Workersのfetchで動かす。NodeのhttpモジュールはWorkersに無い。 */
export function stripeClient() {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY が設定されていません。');
  // apiVersion は指定せず、入れたSDKの既定に任せる。SDKを上げたときに
  // 版のずれで落ちるのを避けるため。
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export function stripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_STANDARD && env.STRIPE_PRICE_PREMIUM);
}

/** 有料プランと Stripe の price を対応させる。無料プランに price は無い。 */
export function priceIdFor(plan: Plan) {
  if (plan === 'standard') return env.STRIPE_PRICE_STANDARD || '';
  if (plan === 'premium') return env.STRIPE_PRICE_PREMIUM || '';
  return '';
}

/** Stripeのpriceから、こちらのプラン名に戻す。webhookで使う。 */
export function planForPrice(priceId: string): Plan | '' {
  if (priceId && priceId === env.STRIPE_PRICE_STANDARD) return 'standard';
  if (priceId && priceId === env.STRIPE_PRICE_PREMIUM) return 'premium';
  return '';
}

/** 紹介1人ぶんの値引き額。いま契約しているプランの1ヶ月ぶんを返す（円）。 */
export function monthlyYen(plan: Plan) {
  return planCatalog[plan].monthlyYen;
}
