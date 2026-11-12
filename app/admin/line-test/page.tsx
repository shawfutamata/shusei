import { notFound } from 'next/navigation';
import { getLineTestOwner } from '@/app/line-test-auth';
import { lineTestReadyForMember } from '@/app/line-test-config';
import { lineFriendUrl } from '@/app/line-auth';
import { lineMessages } from '@/app/line-messages';
import { getLineTestStatus } from '@/db/line-test';
import LineTest from './LineTest';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'LINE本人限定テスト', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ line?: string }> }) {
  const owner = await getLineTestOwner();
  if (!owner || !lineTestReadyForMember(owner.userId)) notFound();
  const query = await searchParams;
  const message = query.line === 'linked' ? '本人のLINEと連携しました。一般向け機能や自動通知はOFFのままです。' : lineMessages[query.line || ''] || '';
  return <LineTest email={owner.email} initialStatus={await getLineTestStatus(owner.userId)} friendUrl={lineFriendUrl()} initialMessage={message} />;
}
