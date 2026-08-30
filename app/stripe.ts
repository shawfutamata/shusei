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

/**
 * 出稿枠の1回きりの支払いが使えるか。
 *
 * 金額は日数×単価でその都度変わるので、Stripeに価格を作り置きしない
 * （price_data で毎回渡す）。だから必要なのは秘密鍵だけ。
 */
export function adSlotConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY);
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

/** 支払い1件ぶん。会員のマイページに出す。 */
export type BillingRecord = {
  id: string;
  /** YYYY-MM-DD。日本時間で出す。 */
  date: string;
  /** 税込の請求額（円）。 */
  yen: number;
  what: string;
  /** 領収書・請求書のPDF。Stripeが持っているものをそのまま渡す。 */
  receiptUrl: string;
  paid: boolean;
};

/**
 * その会員の支払い履歴を返す。
 *
 * 請求書（invoice）を見る。購読は Stripe が毎回作り、出稿枠の1回きりの
 * 支払いも `invoice_creation` で作らせているので、**両方ここに並ぶ**。
 * 請求書が無い古い支払いだけ、charge のレシートで拾う。
 *
 * 金額はStripeが持っているものを使う。こちらで計算し直さない。
 * 会員に見せる領収書の額と、実際に引き落とした額がずれないようにするため。
 */
export async function listBillingHistory(customerId: string, limit = 24): Promise<BillingRecord[]> {
  if (!customerId) return [];
  const stripe = stripeClient();
  const [invoices, charges] = await Promise.all([
    stripe.invoices.list({ customer: customerId, limit }),
    stripe.charges.list({ customer: customerId, limit }),
  ]);

  const records: BillingRecord[] = invoices.data
    .filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'void')
    .map((invoice) => ({
      id: invoice.id ?? '',
      date: jstDate(invoice.created),
      yen: invoice.amount_paid || invoice.amount_due || 0,
      what: invoice.lines.data[0]?.description || 'TASUKI ご利用料金',
      receiptUrl: invoice.hosted_invoice_url || invoice.invoice_pdf || '',
      paid: invoice.status === 'paid',
    }));

  // 請求書が付いていない古い支払いだけ足す。
  // 突き合わせは「日付と金額」で見る。SDKの版によって invoice と charge を
  // つなぐ項目名が変わる（22系で invoice.charge が無くなった）ので、
  // 版に左右されない見分け方にしておく。いまは出稿枠にも請求書を作らせて
  // いるので、ここを通るのはこの変更より前の支払いだけ。
  const seen = new Set(records.map((record) => `${record.date}:${record.yen}`));
  for (const charge of charges.data) {
    if (charge.status !== 'succeeded') continue;
    if (seen.has(`${jstDate(charge.created)}:${charge.amount}`)) continue;
    records.push({
      id: charge.id,
      date: jstDate(charge.created),
      yen: charge.amount,
      what: charge.description || 'TASUKI ご利用料金',
      receiptUrl: charge.receipt_url ?? '',
      paid: true,
    });
  }

  return records.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** Stripeの秒を、日本時間の日付にする。 */
function jstDate(seconds: number) {
  return new Date(seconds * 1000 + 9 * 3600_000).toISOString().slice(0, 10);
}
