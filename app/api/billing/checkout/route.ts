import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { plans, toBillingCycle, type BillingCycle, type Plan } from '@/app/entitlements';
import { priceIdFor, stripeClient, stripeConfigured } from '@/app/stripe';
import { getStripeLink, saveStripeCustomer } from '@/db/data';
import { applyReferralCreditsToStripe } from '@/app/billing-credits';

// **Web専用**。支払い画面へ送るだけで、金額はStripeが持つ。
// アプリからは呼ばない（App Store 3.1.1／docs/billing-architecture.md）。
export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'お支払いの準備がまだ整っていません。運営窓口へお問い合わせください。' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { plan?: string; cycle?: string };
  const plan = body.plan as Plan;
  const cycle = toBillingCycle(body.cycle);
  if (!plans.includes(plan) || plan === 'free') {
    return NextResponse.json({ error: 'プランの指定が正しくありません。' }, { status: 400 });
  }
  const price = priceIdFor(plan, cycle);
  if (!price) return NextResponse.json({ error: 'このプランはまだお申し込みいただけません。' }, { status: 503 });

  try {
    return await createCheckout(gate.user.userId, gate.user.email, gate.user.displayName, plan, cycle, price, new URL(request.url).origin);
  } catch (error) {
    // 鍵の設定ミスやStripe側の不調で、画面が真っ白にならないようにする。
    console.error('stripe checkout failed', error);
    return NextResponse.json({ error: 'お支払い画面を開けませんでした。時間をおいてお試しいただくか、運営窓口へお問い合わせください。' }, { status: 502 });
  }
}

async function createCheckout(memberId: string, userEmail: string, userName: string, plan: Plan, cycle: BillingCycle, price: string, origin: string) {
  const stripe = stripeClient();
  const link = await getStripeLink(memberId);

  // 顧客は1人1つ。作り直すと過去の請求とつながらなくなる。
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

  // 無料のうちにためた無料月があれば、契約と同時に残高へ入れる。
  // 継続課金になってからのぶんは、確定した時点で入る（app/billing-credits.ts）。
  await applyReferralCreditsToStripe(memberId).catch(() => 0);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    locale: 'ja',
    success_url: `${origin}/?billing=done`,
    cancel_url: `${origin}/?billing=cancel`,
    subscription_data: { metadata: { memberId, plan, cycle } },
    metadata: { memberId, plan, cycle },
  });

  return NextResponse.json({ url: session.url });
}
