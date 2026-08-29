// 「何ができるか」を決める唯一の場所。
// 画面のあちこちに plan の判定を書くと必ずどこかで漏れるので、判断はここに集める。
// 画面は隠すだけ。実際に止めるのは必ずAPI側で行う。
//
// ここには金額を置かない。アプリ内に価格を出せないため（App Store 3.1.1）、
// 金額と表示名は Web だけが持つ app/plan-catalog.ts にある。
// 線引きは docs/pricing-plan-ja.md が正。

export const plans = ['free', 'standard', 'premium'] as const;

/** 支払いの周期。金額ではないのでここに置く（金額は app/plan-catalog.ts）。 */
export const billingCycles = ['month', 'year'] as const;
export type BillingCycle = (typeof billingCycles)[number];
export function toBillingCycle(value: unknown): BillingCycle {
  return value === 'year' ? 'year' : 'month';
}

export type Plan = (typeof plans)[number];
/**
 * プランは2本立てで持つ。
 * - plan / planPeriodEnd … 契約しているプラン（Stripeの購読、または運営が入れたもの）
 * - bonusPlan / bonusPeriodEnd … 招待特典で一時的に開いているプラン
 *
 * 別々に持つのは、契約すると特典が消える事故を防ぐため。実際に使えるのは
 * 「2つのうち上のほう」で、特典が切れたら契約しているプランに戻る。
 */
export type PlanState = {
  plan: Plan;
  planPeriodEnd: string;
  bonusPlan?: Plan;
  bonusPeriodEnd?: string;
};

/** 無制限は -1 で表す。JSONに載せるので Infinity は使わない。 */
export const UNLIMITED = -1;

export const planLimits: Record<Plan, { requestsPerMonth: number; businessCards: number }> = {
  free: { requestsPerMonth: 1, businessCards: 50 },
  standard: { requestsPerMonth: 2, businessCards: 300 },
  premium: { requestsPerMonth: UNLIMITED, businessCards: UNLIMITED },
};

export const features = [
  'view_board',           // 掲示板を見る
  'introduce',            // 人を紹介する（ギブ）
  'comment',              // 探しごとでやり取りする
  'receive_introductions',// 届いた紹介を見る
  'post_request',         // 探しごとを投稿する（プランごとの上限あり）
  'store_business_card',  // 名刺を保存する（プランごとの上限あり）
  'scan_business_card',   // 名刺をカメラで一括読み取り
  'member_search',        // 会員を業種・エリアで探す
  'export_introductions', // 届いた紹介の書き出し
] as const;
export type Feature = (typeof features)[number];

// どのプランから使えるか。ここに無いものは全プランで使える。
const requiredPlan: Partial<Record<Feature, Plan>> = {
  scan_business_card: 'premium',
  member_search: 'premium',
  export_introductions: 'premium',
};

export function toPlan(value: unknown): Plan {
  // 以前の 'pro' は最上位として扱う。
  if (value === 'pro') return 'premium';
  return plans.includes(value as Plan) ? value as Plan : 'free';
}

/** 期限切れなら無料に落とす。判定はすべてこれを通す。 */
/** 契約しているプラン。期限切れなら無料。特典は含めない。 */
export function contractedPlan(state: PlanState, today = new Date()): Plan {
  if (state.plan === 'free') return 'free';
  if (state.planPeriodEnd && state.planPeriodEnd < isoDate(today)) return 'free';
  return state.plan;
}

/** 招待特典で開いているプラン。期限切れなら無料。 */
export function bonusPlan(state: PlanState, today = new Date()): Plan {
  const plan = state.bonusPlan ?? 'free';
  if (plan === 'free') return 'free';
  if (!state.bonusPeriodEnd || state.bonusPeriodEnd < isoDate(today)) return 'free';
  return plan;
}

/** 実際に使えるプラン。契約と特典の、上のほう。 */
export function currentPlan(state: PlanState, today = new Date()): Plan {
  const contracted = contractedPlan(state, today);
  const bonus = bonusPlan(state, today);
  return rank(bonus) > rank(contracted) ? bonus : contracted;
}

/** 特典ではなく、自分で契約している有料プランがあるか。 */
export function hasPaidContract(state: PlanState, today = new Date()) {
  return contractedPlan(state, today) !== 'free';
}

export function isPaid(state: PlanState, today = new Date()) {
  return currentPlan(state, today) !== 'free';
}

export function can(state: PlanState, feature: Feature, today = new Date()) {
  const needed = requiredPlan[feature];
  if (!needed) return true;
  return rank(currentPlan(state, today)) >= rank(needed);
}

export function limits(state: PlanState, today = new Date()) {
  return planLimits[currentPlan(state, today)];
}

/** 今月あと何件投稿できるか。無制限なら UNLIMITED。 */
export function remainingRequests(state: PlanState, usedThisMonth: number, today = new Date()) {
  const cap = limits(state, today).requestsPerMonth;
  return cap === UNLIMITED ? UNLIMITED : Math.max(0, cap - usedThisMonth);
}

/** あと何枚の名刺を保存できるか。無制限なら UNLIMITED。 */
export function remainingBusinessCards(state: PlanState, stored: number, today = new Date()) {
  const cap = limits(state, today).businessCards;
  return cap === UNLIMITED ? UNLIMITED : Math.max(0, cap - stored);
}

function rank(plan: Plan) {
  return plans.indexOf(plan);
}

export function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** 1ヶ月ぶんのクレジットを当てたときの新しい期限。今日か既存の期限のうち遅い方から1ヶ月。 */
export function extendedPlanEnd(current: string, today = new Date()) {
  const from = current && current > isoDate(today) ? new Date(`${current}T00:00:00Z`) : today;
  const next = new Date(from.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return isoDate(next);
}
