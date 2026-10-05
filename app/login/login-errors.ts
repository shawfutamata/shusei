const loginErrors: Record<string, string> = {
  notmember: 'そのGoogleアカウントのメールアドレスは、会員として登録されていません。初めての方は「無料アカウントを作成」から登録してください。登録済みの方は、ご登録のメールアドレスでログインしてください。',
  denied: '現在、このアカウントでTASUKIを利用できません。登録済みの場合は運営確認待ち、または利用状態の確認が必要な場合があります。登録したメールアドレスを添えて運営窓口へお問い合わせください。',
  failed: 'ログインを完了できませんでした。お手数ですが、もう一度お試しください。',
  unconfigured: 'ただいまログインをご利用いただけません。運営窓口へお問い合わせください。',
  pending: 'アカウント登録を受け付けました。運営確認が完了すると、TASUKIをご利用いただけます。',
};

export function loginMessage(value = '') {
  return value ? loginErrors[value] ?? loginErrors.failed : '';
}
