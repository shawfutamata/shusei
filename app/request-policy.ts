export const requestReportReasons = [
  { value: 'external_community', label: '外部コミュニティ・オンラインサロン等への勧誘' },
  { value: 'religious_solicitation', label: '宗教・宗教団体への勧誘' },
  { value: 'network_marketing', label: 'ネットワークビジネス・マルチ商法への勧誘' },
  { value: 'sales_solicitation', label: '案件と関係のない営業・勧誘' },
  { value: 'misleading', label: '虚偽・誤解を招く内容' },
  { value: 'inappropriate', label: '不適切・迷惑な内容' },
  { value: 'other', label: 'その他' },
] as const;

export type RequestReportReason = (typeof requestReportReasons)[number]['value'];

export function isRequestReportReason(value: unknown): value is RequestReportReason {
  return typeof value === 'string' && requestReportReasons.some((reason) => reason.value === value);
}

export function requestReportReasonLabel(value: string) {
  return requestReportReasons.find((reason) => reason.value === value)?.label ?? value;
}

/**
 * TASUKIの案件欄を、外部コミュニティ、宗教、ネットワークビジネスの
 * 勧誘に使わせない。単に「Slack導入支援」「ネットワーク構築」などと
 * 書いた正当な案件までは止めないよう、対象を示す語と勧誘語が近い場合に止める。
 */
export function hasExternalCommunitySolicitation(value: string) {
  const text = value.replace(/\s+/g, ' ');
  const community = '(?:外部コミュニティ|オンラインサロン|コミュニティ|交流会|LINE(?:の)?オープンチャット|Discord(?:の)?サーバー|Facebook(?:の)?グループ)';
  const religion = '(?:宗教|宗教団体|信仰|布教)';
  const networkMarketing = '(?:ネットワークビジネス|MLM|マルチ商法|連鎖販売取引)';
  const invitation = '(?:勧誘|参加|入会|加入|招待|誘導|会員募集|メンバー募集|説明会)';
  const target = `(?:${community}|${religion}|${networkMarketing})`;
  return new RegExp(`${target}.{0,24}${invitation}|${invitation}.{0,24}${target}`, 'i').test(text)
    || new RegExp(networkMarketing, 'i').test(text);
}

export const requestPostingRule = '皆さまが安心して利用できる場を守るため、宗教・ネットワークビジネスへの勧誘、外部コミュニティへの誘導、ほかの会員を不安・不快にさせる行為は禁止です。';
