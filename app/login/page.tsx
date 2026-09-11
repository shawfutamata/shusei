import LoginForm from './LoginForm';

export const metadata = { robots: { index: false, follow: false } };

const loginErrors: Record<string, string> = {
  notmember: 'そのGoogleアカウントのメールアドレスは、会員として登録されていません。ご登録のメールアドレスでログインするか、運営窓口へお問い合わせください。',
  denied: 'このアカウントには現在利用権限がありません。運営窓口へお問い合わせください。',
  failed: 'ログインを完了できませんでした。お手数ですが、もう一度お試しください。',
  unconfigured: 'ただいまログインをご利用いただけません。運営窓口へお問い合わせください。',
  pending: '登録を受け付けました。もう一度ログインしてください。うまくいかない場合は運営窓口へお知らせください。',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const { login = '' } = await searchParams;
  const initialMessage = login ? loginErrors[login] ?? loginErrors.failed : '';
  return <LoginForm initialMessage={initialMessage} />;
}
