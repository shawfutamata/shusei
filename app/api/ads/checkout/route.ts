import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adSlotConfigured, adSlotPriceId, stripeClient } from '@/app/stripe';
import { availableAdMonths, canBuyAdSlot, getMemberRank, getStripeLink, releaseAdSlot, reserveAdSlot, saveAdSlotSession, saveStripeCustomer } from '@/db/data';
import { adMonthsAhead } from '@/app/rank-perks';

// **Web専用**。トップバナーの出稿枠を1ヶ月ぶん買う。
// 購読ではなく1回きりの支払いなので mode は 'payment'。
// アプリからは呼ばない（App Store 3.1.1／docs/billing-architecture.md）。
export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  if (!adSlotConfigured()) {
    return NextResponse.json({ error: '出稿枠のお申し込みはまだ受け付けていません。運営窓口へお問い合わせください。' }, { status: 503 });
  }

  const { level } = await getMemberRank(gate.user.userId);
  if (!canBuyAdSlot(level)) {
    return NextResponse.json({ error: '出稿枠は上位ランクの方の特典です。紹介を重ねてランクが上がるとお申し込みいただけます。' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { month?: string };
  const month = typeof body.month === 'string' && /^\d{4}-\d{2}$/.test(body.month) ? body.month : '';
  if (!month) return NextResponse.json({ error: '掲載する月の指定が正しくありません。' }, { status: 400 });
  // 過ぎた月や、ずっと先の月を押さえられないようにする。
  const offered = await availableAdMonths(adMonthsAhead(level));
  if (!offered.some((entry) => entry.month === month)) {
    return NextResponse.json({ error: 'その月はお申し込みいただけません。表示されている月からお選びください。' }, { status: 400 });
  }

  // 先に枠を押さえる。早い者勝ちなので、決済画面を開く前に取り合いを終わらせる。
  let slotId: string;
  try {
    slotId = await reserveAdSlot(gate.user.userId, month);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '枠を押さえられませんでした。' }, { status: 409 });
  }

  try {
    return await createCheckout(gate.user.userId, gate.user.email, gate.user.displayName, slotId, month, new URL(request.url).origin);
  } catch (error) {
    // 決済画面を開けなかったのに枠を押さえたままにしない。次の人がすぐ買える。
    await releaseAdSlot(slotId).catch(() => undefined);
    console.error('ad slot checkout failed', error);
    return NextResponse.json({ error: 'お支払い画面を開けませんでした。時間をおいてお試しいただくか、運営窓口へお問い合わせください。' }, { status: 502 });
  }
}

async function createCheckout(memberId: string, userEmail: string, userName: string, slotId: string, month: string, origin: string) {
  const stripe = stripeClient();
  const link = await getStripeLink(memberId);

  // 顧客は会費と同じものを使う。請求の履歴が1人分にまとまる。
  let customerId = link.customerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: link.email || userEmail,
      name: link.displayName || userName,
      metadata: { memberId },
    });
    customerId = customer.id;
    await saveStripeCustomer(memberId, customerId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: adSlotPriceId(), quantity: 1 }],
    locale: 'ja',
    success_url: `${origin}/?ad=done`,
    cancel_url: `${origin}/?ad=cancel`,
    // webhookはこのslotIdだけを見て掲載中にする。
    metadata: { memberId, adSlotId: slotId, month },
  });

  await saveAdSlotSession(slotId, session.id);
  return NextResponse.json({ url: session.url });
}
