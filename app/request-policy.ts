export const requestReportReasons = [
  { value: 'external_community', label: '外部コミュニティ・オンラインサロン等への勧誘' },
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
 * TASUKIの案件欄を、別サービスや会員制コミュニティの集客に使わせない。
 * 単に「Slack導入支援」などと書いた正当な案件までは止めないよう、
 * コミュニティを示す語と参加を促す語が近くにある場合だけ止める。
 */
export function hasExternalCommunitySolicitation(value: string) {
  const text = value.replace(/\s+/g, ' ');
  const community = '(?:外部コミュニティ|オンラインサロン|コミュニティ|交流会|LINE(?:の)?オープンチャット|Discord(?:の)?サーバー|Facebook(?:の)?グループ)';
  const invitation = '(?:参加|入会|加入|招待|誘導|会員募集|メンバー募集)';
  return new RegExp(`${community}.{0,24}${invitation}|${invitation}.{0,24}${community}`, 'i').test(text);
}

export const requestPostingRule = '外部コミュニティ・オンラインサロン・交流会などへの勧誘や会員募集には利用できません。';
