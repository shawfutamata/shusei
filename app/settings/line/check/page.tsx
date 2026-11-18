import { notFound } from 'next/navigation';
import { getLineLinkCheckOwner } from '@/app/line-link-check';
import { getSessionCookieToken } from '@/app/app-auth';
import { lineAccountStatus } from '@/db/line-accounts';
import { lineMessages } from '@/app/line-messages';
import LinkCheck from './LinkCheck';

export const dynamic = 'force-dynamic';
export const metadata = { title: '本人限定LINE接続確認', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const owner = await getLineLinkCheckOwner();
  if (!owner) notFound();
  const token = await getSessionCookieToken();
  if (!token) notFound();
  const status = await lineAccountStatus(owner.userId, token);
  const query = await searchParams;
  const message = query.line === 'linked' ? '本人のLINEとの連携を確認しました。通知は送っていません。' : lineMessages[query.line || ''] || '';
  return <LinkCheck email={owner.email} linked={status.linked} initialMessage={message} />;
}
