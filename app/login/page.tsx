import LoginForm from './LoginForm';
import { loginMessage } from './login-errors';

export const metadata = { alternates: { canonical: 'https://tasuki.club/login' } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
  const { login = '' } = await searchParams;
  return <LoginForm initialMessage={loginMessage(login)} />;
}
