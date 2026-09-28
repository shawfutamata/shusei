import LoginForm from '../LoginForm';
import { loginMessage } from '../login-errors';

export const metadata = {
  title: '会員ログイン｜TASUKI',
  robots: { index: false, follow: false },
};

export default async function MemberLoginPage({ searchParams }: { searchParams: Promise<{ login?: string; return_to?: string }> }) {
  const { login = '', return_to: requestedReturn = '' } = await searchParams;
  const returnTo = requestedReturn === '/?tab=survey' ? requestedReturn : '/';
  return <LoginForm initialMessage={loginMessage(login)} standalone returnTo={returnTo} />;
}
