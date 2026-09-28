import LoginForm from '../LoginForm';
import { loginMessage } from '../login-errors';

export const metadata = {
  title: '会員ログイン｜TASUKI',
  robots: { index: false, follow: false },
};

export default async function MemberLoginPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const { login = '' } = await searchParams;
  return <LoginForm initialMessage={loginMessage(login)} standalone />;
}
