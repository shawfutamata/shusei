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
  const diagnosticMessages: Record<string, string> = {
    line_check_used: 'このLINEは既に別のTASUKI会員に連携済みです。既存の連携は変更していません。',
    line_check_storage: 'LINE連携の保存を完了できませんでした。別の会員との連携が原因とは判定していません。設定を変更せず、運営で確認してください。',
  };
  const message = query.line === 'linked' ? '本人のLINEとの連携を確認しました。通知は送っていません。' : diagnosticMessages[query.line || ''] || lineMessages[query.line || ''] || '';
  return <LinkCheck email={owner.email} linked={status.linked} initialMessage={message} />;
}
