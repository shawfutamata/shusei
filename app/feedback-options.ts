// 機能改善の受け口で使う選択肢。画面（クライアント）とサーバーの両方から読む。
// db/data.ts は Workers 専用のモジュールを読み込むので、ここに分けてある。
export const feedbackCategories = [
  { value: 'feature', label: 'ほしい機能' },
  { value: 'usability', label: '使いにくいところ' },
  { value: 'bug', label: 'うまく動かない' },
  { value: 'other', label: 'その他' },
] as const;

export type FeedbackCategory = (typeof feedbackCategories)[number]['value'];

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return feedbackCategories.some((category) => category.value === value);
}

/** 1日に送れる件数。荒らし対策の歯止めで、ふつうに使うぶんには当たらない。 */
export const FEEDBACK_PER_DAY = 5;
