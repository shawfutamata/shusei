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
  // **商品IDと価格IDの取り違えは、いちばん起きやすい設定ミス。**
  // Stripeの画面では商品（prod_…）が目立つところにあり、価格（price_…）は
  // その中にある。prod_ を入れてもStripeは「そんな価格は無い」としか言わない
  // ので、ここで先に見て、何を直せばよいかまで伝える。
  if (!price.startsWith('price_')) {
    console.error('stripe price id looks wrong', { plan, cycle, prefix: price.slice(0, 6) });
    return NextResponse.json({
      error: price.startsWith('prod_')
        ? 'お支払いの設定に商品IDが入っています。価格ID（price_ で始まるもの）に入れ替えてください。'
        : 'お支払いの設定にある価格IDの形が正しくありません。price_ で始まるIDを入れてください。',
      stripeCode: 'price_id_looks_wrong',
    }, { status: 503 });
  }

  try {
    return await createCheckout(gate.user.userId, gate.user.email, gate.user.displayName, plan, cycle, price, new URL(request.url).origin);
  } catch (error) {
    // 鍵の設定ミスやStripe側の不調で、画面が真っ白にならないようにする。
    console.error('stripe checkout failed', error);
    // **何が悪いのかを持ち帰れるようにする。** 文言だけだと、鍵の取り違えなのか
    // 価格IDの間違いなのか外からは分からず、毎回ログを見に行くことになる。
    // 返すのはStripeが付ける短い識別子（code / param）だけで、鍵も本文も出さない。
    return NextResponse.json({
      error: 'お支払い画面を開けませんでした。時間をおいてお試しいただくか、運営窓口へお問い合わせください。',
      ...stripeHint(error),
    }, { status: 502 });
  }
}

/** Stripeのエラーから、原因あてに使える短い印だけを取り出す。 */
function stripeHint(error: unknown) {
  const e = error as { type?: string; code?: string; param?: string };
  if (!e || typeof e !== 'object') return {};
  const hint: Record<string, string> = {};
  if (typeof e.type === 'string') hint.stripeType = e.type;
  if (typeof e.code === 'string') hint.stripeCode = e.code;
  if (typeof e.param === 'string') hint.stripeParam = e.param;
  return hint;
}

async function createCheckout(memberId: string, userEmail: string, userName: string, plan: Plan, cycle: BillingCycle, price: string, origin: string) {
  const stripe = stripeClient();
  const link = await getStripeLink(memberId);

  // 顧客は1人1つ。作り直すと過去の請求とつながらなくなる。
  let customerId = link.customerId || await newCustomer(stripe, memberId, link.email || userEmail, link.displayName || userName);

  // 無料のうちにためた無料月があれば、契約と同時に残高へ入れる。
  // 継続課金になってからのぶんは、確定した時点で入る（app/billing-credits.ts）。
  await applyReferralCreditsToStripe(memberId).catch(() => 0);

  try {
    return await openCheckout(stripe, customerId, price, plan, cycle, memberId, origin);
  } catch (error) {
    // **保存してある顧客が、いまの鍵のStripeに無いことがある。** テスト用と
    // 本番用の鍵を入れ替えたときや、Stripeのアカウントを作り直したときで、
    // D1に残ったIDだけが古いまま。作り直して1回だけやり直す。
    // 顧客を作り直すのは、こうなったときは過去の請求とつなぎようがないため。
    if (!isMissingCustomer(error)) throw error;
    console.warn('stripe customer missing, creating a new one', { memberId });
    customerId = await newCustomer(stripe, memberId, link.email || userEmail, link.displayName || userName);
    return await openCheckout(stripe, customerId, price, plan, cycle, memberId, origin);
  }
}

async function newCustomer(stripe: ReturnType<typeof stripeClient>, memberId: string, email: string, name: string) {
  const customer = await stripe.customers.create({ email, name, metadata: { memberId } });
  await saveStripeCustomer(memberId, customer.id);
  return customer.id;
}

async function openCheckout(stripe: ReturnType<typeof stripeClient>, customerId: string, price: string,
  plan: Plan, cycle: BillingCycle, memberId: string, origin: string) {
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

/** 「その顧客はいません」かどうか。価格IDの間違いなど、他の resource_missing と混ぜない。 */
function isMissingCustomer(error: unknown) {
  const e = error as { code?: string; param?: string };
  return Boolean(e && typeof e === 'object' && e.code === 'resource_missing' && e.param === 'customer');
}
