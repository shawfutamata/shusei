export const industries = [
  'IT・システム',
  'Web・広告',
  '映像・写真',
  'デザイン・印刷',
  '建設・不動産',
  '製造・卸売',
  '小売・EC',
  '飲食・食品',
  '美容・健康',
  '医療・福祉',
  '士業・コンサル',
  '人材・教育',
  '金融・保険',
  '運輸・物流',
  'イベント・エンタメ',
  'その他',
] as const;

export type Industry = (typeof industries)[number];

export function isIndustry(value: string): value is Industry {
  return industries.includes(value as Industry);
}
