import { redirect } from 'next/navigation';
import { getAppAccess } from '@/app/app-auth';
import { lineMessages } from '@/app/line-messages';
import LineSettings from './LineSettings';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'LINE連携・通知設定', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const access = await getAppAccess();
  if (!access) redirect('/login/member?return_to=%2Fsettings%2Fline');
  const query = await searchParams;
  return <LineSettings initialMessage={lineMessages[query.line || ''] || ''} />;
}
