import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getStripeLink } from '@/db/data';
import { adSlotConfigured, listBillingHistory } from '@/app/stripe';

// **Web専用**。会員が自分の支払い履歴と領収書を取り出すところ。
// 領収書のPDFはStripeが持っているものをそのまま渡す。こちらでは作らない
// （金額や日付を作り直すと、実際に引き落とした額とずれる恐れがある）。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  // 決済がまだ繋がっていない環境では、空で返す。画面には「まだありません」と出る。
  if (!adSlotConfigured()) return NextResponse.json({ records: [], ready: false });

  const link = await getStripeLink(gate.user.userId);
  if (!link.customerId) return NextResponse.json({ records: [], ready: true });
  try {
    return NextResponse.json({ records: await listBillingHistory(link.customerId), ready: true });
  } catch (error) {
    console.error('billing history failed', error);
    return NextResponse.json({ error: '支払い履歴を読み込めませんでした。時間をおいてお試しください。' }, { status: 502 });
  }
}
