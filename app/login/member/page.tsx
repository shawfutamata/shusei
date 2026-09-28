import LoginForm from '../LoginForm';
import { loginMessage } from '../login-errors';
import { safeReturnPath } from '@/app/auth-return';

export const metadata = {
  title: '会員ログイン｜TASUKI',
  robots: { index: false, follow: false },
};

export default async function MemberLoginPage({ searchParams }: { searchParams: Promise<{ login?: string; return_to?: string }> }) {
  const { login = '', return_to: requestedReturn = '' } = await searchParams;
  const returnTo = safeReturnPath(requestedReturn) || '/';
  return <LoginForm initialMessage={loginMessage(login)} standalone returnTo={returnTo} purpose={returnTo === '/admin' || returnTo.startsWith('/admin/') ? 'admin' : 'member'} />;
}
