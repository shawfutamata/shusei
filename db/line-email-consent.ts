import { env } from 'cloudflare:workers';
/** 取得メールでの任意通知は、LINE由来の場合だけ専用同意も必要。既存会員の独立した設定は変えない。 */
export async function lineEmailNoticeAllowed(memberId: string) {
  const origin = await env.DB.prepare(`SELECT m.membership_source,l.email_from_line,l.email_notice_consent FROM members m
    LEFT JOIN line_data_origins l ON l.member_id=m.id WHERE m.id=?`).bind(memberId).first<{ membership_source: string; email_from_line: number | null; email_notice_consent: number | null }>();
  // バックアップ復元等で同意証跡が欠けても、LINE登録者を同意済みと推定しない。
  return Boolean(origin) && (origin!.email_from_line === 1 || origin!.membership_source === 'line_signup' ? origin!.email_notice_consent === 1 : true);
}
