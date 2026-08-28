// 「何ができるか」を決める唯一の場所。
// 画面のあちこちに plan の判定を書くと必ずどこかで漏れるので、判断はここに集める。
// 画面は隠すだけ。実際に止めるのは必ずAPI側で行う。
//
// 無料と有料の線引きは docs/pricing-plan-ja.md が正。

export type Plan = 'free' | 'pro';
export type PlanState = { plan: Plan; planPeriodEnd: string };

export const FREE_REQUESTS_PER_MONTH = 1;
export const FREE_BUSINESS_CARDS = 30;

export const features = [
  'view_board',           // 掲示板を見る
  'introduce',            // 人を紹介する（ギブ）
  'receive_introductions',// 届いた紹介を見る
  'post_request',         // 探しごとを投稿する（無料は月1件）
  'store_business_card',  // 名刺を保存する（無料は30枚）
  'scan_business_card',   // 名刺をカメラで一括読み取り
  'member_search',        // 会員を業種・エリアで探す
  'export_introductions', // 届いた紹介の書き出し
] as const;
export type Feature = (typeof features)[number];

// 無料会員でも使えるもの。ここに無いものは有料。
const freeFeatures = new Set<Feature>([
  'view_board', 'introduce', 'receive_introductions', 'post_request', 'store_business_card',
]);

export function isPro(state: PlanState, today = new Date()) {
  if (state.plan !== 'pro') return false;
  if (!state.planPeriodEnd) return true; // 期限なし（会場・法人契約）
  return state.planPeriodEnd >= isoDate(today);
}

export function can(state: PlanState, feature: Feature) {
  return freeFeatures.has(feature) || isPro(state);
}

/** 今月あと何件投稿できるか。有料は無制限（Infinity）。 */
export function remainingRequests(state: PlanState, usedThisMonth: number) {
  return isPro(state) ? Infinity : Math.max(0, FREE_REQUESTS_PER_MONTH - usedThisMonth);
}

/** あと何枚の名刺を保存できるか。有料は無制限（Infinity）。 */
export function remainingBusinessCards(state: PlanState, stored: number) {
  return isPro(state) ? Infinity : Math.max(0, FREE_BUSINESS_CARDS - stored);
}

export function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** 無料月クレジットを当てたときの、新しい有効期限。今日か既存の期限のうち遅い方から1ヶ月。 */
export function extendedPlanEnd(current: string, today = new Date()) {
  const from = current && current > isoDate(today) ? new Date(`${current}T00:00:00Z`) : today;
  const next = new Date(from.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return isoDate(next);
}
