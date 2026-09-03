// 案件の予算の帯。**ここが唯一の定義**で、投稿の入力も掲示板の絞り込みも
// ここを読む。
//
// 会社の年商ではなく、**その案件にいくら出せるか**で持つ。年商が大きくても
// 案件の予算が小さければ意味がないし、逆もある。相手が探しているのは
// 「規模の合う会社」ではなく「予算の合う仕事」なので、物差しは予算にする。
//
// 金額の帯であって金額そのものではないので（買うものではない）、
// アプリに出しても差し支えない。

export const budgetBands = {
  under50: '〜50万円',
  m50to100: '50〜100万円',
  m100to300: '100〜300万円',
  m300to1000: '300〜1,000万円',
  over1000: '1,000万円以上',
  // 月々いくらで続けて頼みたい、という募集。金額の大小とは別の軸なので
  // 帯を分けている。「継続で組める相手を探したい」人がここだけ見られる。
  monthly: '月額・継続',
  negotiable: '応相談',
} as const;

export type BudgetBand = keyof typeof budgetBands;

export function toBudgetBand(value: unknown): BudgetBand | '' {
  return typeof value === 'string' && value in budgetBands ? value as BudgetBand : '';
}

/** 画面に出す帯の名前。決めていない古い投稿は空で返す。 */
export function budgetBandLabel(value: string) {
  return value in budgetBands ? budgetBands[value as BudgetBand] : '';
}
