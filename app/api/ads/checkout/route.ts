import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adSlotConfigured, stripeClient } from '@/app/stripe';
import { AD_MIN_DAYS, DEFAULT_PLACEMENT, isAdPlacement, placementName } from '@/app/ad-options';
import { adSlotTotalYen } from '@/app/plan-catalog';
import { canBuyAdSlot, getMemberRank, getStripeLink, releaseAdSlot, reserveAdSlot, saveAdSlotSession, saveStripeCustomer, shiftDate } from '@/db/data';
import { adDaysAhead, adMaxDays } from '@/app/rank-perks';
import { readAdContent } from '@/app/ad-upload';

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

  // タイトル・説明文・リンク・画像・期間を1回で受け取る。買ってから
  // 「まだ何も出ていない枠」を作らないため。
  const form = await request.formData();
  const parsed = await readAdContent(form);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const raw = String(form.get('startDate') ?? '');
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  const days = Number(form.get('days'));
  // どこに出すか。知らない値が来たらバナー扱いにせず、はっきり断る。
  const placement = String(form.get('placement') ?? DEFAULT_PLACEMENT);
  if (!isAdPlacement(placement)) return NextResponse.json({ error: '掲載する場所をお選びください。' }, { status: 400 });
  const maxDays = adMaxDays(level);
  if (!startDate) return NextResponse.json({ error: '掲載を始める日をお選びください。' }, { status: 400 });
  if (!Number.isInteger(days) || days < AD_MIN_DAYS || days > maxDays) {
    return NextResponse.json({ error: `掲載できるのは${AD_MIN_DAYS}日から${maxDays}日までです。` }, { status: 400 });
  }
  // 過ぎた日や、ずっと先の日を押さえられないようにする。
  const today = new Date().toISOString().slice(0, 10);
  if (startDate < today) return NextResponse.json({ error: '過ぎた日は選べません。' }, { status: 400 });
  if (startDate > shiftDate(today, adDaysAhead(level) - 1)) {
    return NextResponse.json({ error: 'その日はまだお申し込みいただけません。カレンダーに出ている日からお選びください。' }, { status: 400 });
  }

  // 先に枠を押さえる。早い者勝ちなので、決済画面を開く前に取り合いを終わらせる。
  let reserved: { id: string; endDate: string };
  try {
    reserved = await reserveAdSlot(gate.user.userId, startDate, days, parsed.content, placement);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '枠を押さえられませんでした。' }, { status: 409 });
  }

  try {
    return await createCheckout(gate.user.userId, gate.user.email, gate.user.displayName, reserved.id, startDate, reserved.endDate, placement, days, new URL(request.url).origin);
  } catch (error) {
    // 決済画面を開けなかったのに枠を押さえたままにしない。次の人がすぐ買える。
    await releaseAdSlot(reserved.id).catch(() => undefined);
    console.error('ad slot checkout failed', error);
    return NextResponse.json({ error: 'お支払い画面を開けませんでした。時間をおいてお試しいただくか、運営窓口へお問い合わせください。' }, { status: 502 });
  }
}

async function createCheckout(memberId: string, userEmail: string, userName: string, slotId: string, startDate: string, endDate: string, placement: string, days: number, origin: string) {
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
    // 金額は日数×単価。**画面から受け取った額は使わない**（書き換えられるため）。
    // Stripeに価格を作り置きせず、その場の金額を price_data で渡す。
    line_items: [{
      price_data: {
        currency: 'jpy',
        unit_amount: adSlotTotalYen(placement, days),
        product_data: {
          name: `TASUKI ${placementName(placement)} ${days}日間`,
          description: `${startDate} 〜 ${endDate}`,
        },
      },
      quantity: 1,
    }],
    locale: 'ja',
    success_url: `${origin}/?ad=done`,
    cancel_url: `${origin}/?ad=cancel`,
    // webhookはこのslotIdだけを見て掲載中にする。
    metadata: { memberId, adSlotId: slotId, startDate, endDate },
  });

  await saveAdSlotSession(slotId, session.id);
  return NextResponse.json({ url: session.url });
}
