// 金額と表示名。**Web専用**。
// アプリ内に価格・割引を出せないため（App Store 3.1.1 / docs/billing-architecture.md）、
// このファイルはアプリ側（mobile/）からは絶対に参照しない。
import { UNLIMITED, planLimits, type Plan } from './entitlements';

export const planCatalog: Record<Plan, { name: string; monthlyYen: number; summary: string }> = {
  free: { name: '無料', monthlyYen: 0, summary: '探しごとは月1件まで' },
  standard: { name: 'スタンダード', monthlyYen: 1000, summary: '探しごとは月2件まで' },
  premium: { name: 'プレミアム', monthlyYen: 5000, summary: '探しごとは何件でも' },
};

export function planPrice(plan: Plan) {
  const yen = planCatalog[plan].monthlyYen;
  return yen === 0 ? '無料' : `月額 ${yen.toLocaleString('ja-JP')}円`;
}

export function planPostLimit(plan: Plan) {
  const cap = planLimits[plan].requestsPerMonth;
  return cap === UNLIMITED ? '何件でも' : `月${cap}件まで`;
}

export function planCardLimit(plan: Plan) {
  const cap = planLimits[plan].businessCards;
  return cap === UNLIMITED ? '無制限' : `${cap}枚まで`;
}
