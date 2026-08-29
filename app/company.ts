// 特定商取引法に基づく表記に出す事業者情報。ここ1箇所にまとめてある。
//
// 空のままの項目があると、法務ページの先頭に赤い警告が出る。
// 住所と電話番号は通信販売では省略できないので、**公開前に必ず埋めること**。
// Stripeの審査でも同じ情報を求められる。
export const company = {
  /** 登記上の法人名 */
  name: '株式会社ColourJam',
  /** 代表取締役、または業務の責任者の氏名 */
  representative: '二俣 将',
  /** 登記上の所在地。番地・部屋番号まで */
  address: '〒153-0043 東京都目黒区東山2-2-5 日興パレス東山204',
  /** 連絡が取れる電話番号 */
  phone: '080-4053-2040',
  /** 問い合わせ窓口 */
  email: 'shaw_futamata@every-counts.com',
  /** 適格請求書発行事業者の登録番号（T＋13桁）。任意だが、経営者向けなので入れると喜ばれる */
  invoiceNumber: '',
  /** 電話・メールの受付時間 */
  hours: '平日 10:00〜18:00（土日祝日を除く）',
} as const;

/** まだ埋まっていない必須項目。公開前のチェックに使う。 */
export function missingCompanyFields() {
  const required: [keyof typeof company, string][] = [
    ['representative', '代表者の氏名'],
    ['address', '所在地'],
    ['phone', '電話番号'],
  ];
  return required.filter(([key]) => !company[key]).map(([, label]) => label);
}
