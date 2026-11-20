import { notFound } from 'next/navigation';
import { getOneNoticeOwner, ONE_NOTICE_TEXT } from '@/app/line-one-notice';
import { getOneNoticeStatus } from '@/db/line-one-notice';
import Notice from './Notice';
export const dynamic = 'force-dynamic';
export const metadata = { title: '本人限定1通テスト', robots: { index: false, follow: false } };
export default async function Page() {
  const owner = await getOneNoticeOwner();
  if (!owner) notFound();
  const status = await getOneNoticeStatus(owner.userId);
  return <Notice email={owner.email} text={ONE_NOTICE_TEXT} initial={status} />;
}
