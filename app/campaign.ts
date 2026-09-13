// 開設キャンペーン。**期間中は、契約が無くても全員がスタンダードの機能を使える。**
//
// 会員が少ないうちは、有料の壁が「人がいない掲示板にお金を払う」形になってしまう。
// 先に人と案件を集めて、使ってよかったと思ってもらってから会費をいただく。
//
// **DBは書き換えない。** 会員の plan 列は契約したままの値で、キャンペーンは
// 読むときに重ねるだけ（app/effective-plan.ts）。そのため
//
//   - 期間が終われば、全員がそれぞれの契約に自動で戻る
//   - Stripeのwebhookとぶつからない
//   - 「なぜこの人がスタンダードなのか」が列を見て分からなくなることもない
//
// **期間を変えるのはこのファイルの `until` を書き替えるだけ。** 押した瞬間から
// 全員に効くので、終わらせる前に必ず会員へ知らせること。

import { isoDate, type Plan } from './entitlements';

export const freeCampaign = {
  /** 画面に出す名前。 */
  name: '開設キャンペーン',
  /** 期間中に開くプラン。 */
  plan: 'standard' as Plan,
  /**
   * この日まで無料（この日を含む）。**空文字にするとキャンペーンは終わる。**
   * 日付の形は YYYY-MM-DD。
   */
  until: '2026-12-31',
};

/** キャンペーンが動いているか。日付の判定は entitlements 側で行う。 */
export function campaignPlan(): Plan {
  return freeCampaign.until ? freeCampaign.plan : 'free';
}

/**
 * **期間中は広告の掲載料も無料。** 会費と同じ日まで。
 *
 * 空いた枠は売っても埋まらない。誰も出していないところに最初に出すのは
 * 決心が要るので、まず無料で埋めてしまう。次に買う人は「こう出るのか」を
 * 見てから決められる。
 *
 * **ガチャの無料券は使わせない**（app/api/ads/checkout）。どうせ無料なのに
 * 券が減ると、当たった意味が消える。券は期間が終わってから使ってもらう。
 *
 * 終わらせるときは `freeCampaign.until` を空にするか日付を過ぎさせるだけ。
 * 会費の無料と同時に終わる。**別々の日付にしない**（片方だけ終わって
 * 「聞いていない」となるのを避けるため）。
 */
export function adsFreeNow(now = new Date()) {
  return campaignRunning(now);
}

/**
 * キャンペーンの期間中か。**会費も広告も、数え方はここ1か所。**
 *
 * 会費のほうは `campaignPlan()` と `entitlements.currentPlan()` が期限を見て
 * 決めているので、機能そのものはこれを通さなくても正しく開く。これは
 * **画面の言い方を決めるため**のもの。「有料」と書いたまま無料で使えている、
 * という食い違いを防ぐ（実際にオファーの欄がそうなっていた）。
 */
export function campaignRunning(now = new Date()) {
  return Boolean(freeCampaign.until) && isoDate(now) <= freeCampaign.until;
}

/** 「2026年12月31日」の形。画面に出す用。 */
export function campaignUntilLabel(until = freeCampaign.until) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(until);
  if (!match) return '';
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}
