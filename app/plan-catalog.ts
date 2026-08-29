// 金額と表示名。**Web専用**。
// アプリ内に価格・割引を出せないため（App Store 3.1.1 / docs/billing-architecture.md）、
// このファイルはアプリ側（mobile/）からは絶対に参照しない。
import { UNLIMITED, planLimits, type BillingCycle, type Plan } from './entitlements';

/** 年払いの割引率。1年ぶんをまとめて前払いしてもらうぶん安くする。 */
export const YEARLY_DISCOUNT = 0.2;

export const planCatalog: Record<Plan, { name: string; monthlyYen: number; summary: string }> = {
  free: { name: '無料', monthlyYen: 0, summary: '探しごとは月1件まで' },
  standard: { name: 'スタンダード', monthlyYen: 1000, summary: '探しごとは何件でも' },
};

/** 年払いの総額。月額×12から割引を引く。 */
export function yearlyYen(plan: Plan) {
  return Math.round(planCatalog[plan].monthlyYen * 12 * (1 - YEARLY_DISCOUNT));
}

/**
 * その契約でいくら払っているかを「1ヶ月あたり」に直す。
 * 紹介1人ぶんの値引き額はこれを使う。年払いの人は割引後の金額が基準になるので、
 * 「20%OFF」と「紹介の無料月」が二重取りにならない。
 */
export function monthlyEquivalentYen(plan: Plan, cycle: BillingCycle) {
  return cycle === 'year' ? Math.round(yearlyYen(plan) / 12) : planCatalog[plan].monthlyYen;
}

export function planPrice(plan: Plan, cycle: BillingCycle = 'month') {
  const yen = cycle === 'year' ? yearlyYen(plan) : planCatalog[plan].monthlyYen;
  if (yen === 0) return '無料';
  return cycle === 'year' ? `年額 ${yen.toLocaleString('ja-JP')}円` : `月額 ${yen.toLocaleString('ja-JP')}円`;
}

/** 年払いの「月あたり」表示。高く見えないようにするため。 */
export function planPerMonthNote(plan: Plan) {
  if (planCatalog[plan].monthlyYen === 0) return '';
  return `月あたり ${monthlyEquivalentYen(plan, 'year').toLocaleString('ja-JP')}円・${Math.round(YEARLY_DISCOUNT * 100)}%OFF`;
}

/** トップバナーの出稿枠。1枠・1ヶ月ぶんの税込価格。 */
export const AD_SLOT_YEN = 10000;

export function adSlotPrice() {
  return `${AD_SLOT_YEN.toLocaleString('ja-JP')}円`;
}

export function planPostLimit(plan: Plan) {
  const cap = planLimits[plan].requestsPerMonth;
  return cap === UNLIMITED ? '何件でも' : `月${cap}件まで`;
}
