import { isAdminEmail } from './admin-emails';
import { currentPlan, type Plan, type PlanState } from './entitlements';

/**
 * **実効プラン。** 画面も機能制限も、必ずここを通して決める。
 *
 * DBの `members.plan` を書き換えて運営を優遇する、という作りにはしていない。
 * 書き換えてしまうと、Stripeのwebhook（解約など）が上書きして特典が消えるし、
 * 「なぜこの人がスタンダードなのか」が列を見ても分からなくなる。
 * 契約の記録はそのまま残し、**読むときに重ねる**。
 *
 * この関数を通していれば、webhookが何度来ても運営の実効プランは落ちない。
 */
export function isPlanOverridden(email: string) {
  return isAdminEmail(email);
}

/** 運営なら、契約に関係なくスタンダードの状態を返す。期限は空＝無期限。 */
export function effectivePlanState(email: string, stored: PlanState): PlanState {
  if (!isPlanOverridden(email)) return stored;
  return { plan: 'standard', planPeriodEnd: '', bonusPlan: 'free', bonusPeriodEnd: '' };
}

/** いま実際に効いているプラン。管理画面の一覧もマイページもこれを出す。 */
export function effectivePlan(email: string, stored: PlanState, today = new Date()): Plan {
  return currentPlan(effectivePlanState(email, stored), today);
}
