const loginErrors: Record<string, string> = {
  notmember: 'そのGoogleアカウントのメールアドレスは、会員として登録されていません。ご登録のメールアドレスでログインするか、運営窓口へお問い合わせください。',
  denied: 'このアカウントには現在利用権限がありません。運営窓口へお問い合わせください。',
  failed: 'ログインを完了できませんでした。お手数ですが、もう一度お試しください。',
  unconfigured: 'ただいまログインをご利用いただけません。運営窓口へお問い合わせください。',
  pending: 'アカウント登録を受け付けました。運営確認が完了すると、TASUKIをご利用いただけます。',
};

export function loginMessage(value = '') {
  return value ? loginErrors[value] ?? loginErrors.failed : '';
}
