import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { plans, type Plan } from '@/app/entitlements';
import { priceIdFor, stripeClient, stripeConfigured } from '@/app/stripe';
import {
  getPlanState, getStripeLink, markReferralCreditsApplied, saveStripeCustomer, unappliedReferralCredits,
} from '@/db/data';
import { planCatalog } from '@/app/plan-catalog';

// **Web専用**。支払い画面へ送るだけで、金額はStripeが持つ。
// アプリからは呼ばない（App Store 3.1.1／docs/billing-architecture.md）。
export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'お支払いの準備がまだ整っていません。運営窓口へお問い合わせください。' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { plan?: string };
  const plan = body.plan as Plan;
  if (!plans.includes(plan) || plan === 'free') {
    return NextResponse.json({ error: 'プランの指定が正しくありません。' }, { status: 400 });
  }
  const price = priceIdFor(plan);
  if (!price) return NextResponse.json({ error: 'このプランはまだお申し込みいただけません。' }, { status: 503 });

  try {
    return await createCheckout(gate.user.userId, gate.user.email, gate.user.displayName, plan, price, new URL(request.url).origin);
  } catch (error) {
    // 鍵の設定ミスやStripe側の不調で、画面が真っ白にならないようにする。
    console.error('stripe checkout failed', error);
    return NextResponse.json({ error: 'お支払い画面を開けませんでした。時間をおいてお試しいただくか、運営窓口へお問い合わせください。' }, { status: 502 });
  }
}

async function createCheckout(memberId: string, userEmail: string, userName: string, plan: Plan, price: string, origin: string) {
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

  // 紹介でたまった無料月を、ここで顧客の残高に入れる。次回以降の請求から自動で引かれる。
  const credits = await unappliedReferralCredits(memberId);
  if (credits.length) {
    const state = await getPlanState(memberId);
    // 値引きは「これから契約するプラン」の月額で数える。
    const yenPerMonth = planCatalog[plan].monthlyYen;
    const amount = yenPerMonth * credits.length;
    if (amount > 0) {
      await stripe.customers.createBalanceTransaction(customerId, {
        amount: -amount, currency: 'jpy',
        description: `紹介 ${credits.length}人ぶんの無料月（${state.plan === 'free' ? '新規' : '継続'}）`,
      });
      await markReferralCreditsApplied(credits, new Date().toISOString().slice(0, 7));
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    locale: 'ja',
    success_url: `${origin}/?billing=done`,
    cancel_url: `${origin}/?billing=cancel`,
    subscription_data: { metadata: { memberId, plan } },
    metadata: { memberId, plan },
  });

  return NextResponse.json({ url: session.url });
}
