import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { stripeClient, stripeConfigured } from '@/app/stripe';
import { getStripeLink } from '@/db/data';

// **Web専用**。支払い方法の変更・解約・領収書はStripeの画面に任せる。
export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'お支払いの準備がまだ整っていません。' }, { status: 503 });
  }

  const link = await getStripeLink(gate.user.userId);
  if (!link.customerId) {
    return NextResponse.json({ error: 'お支払いの登録がありません。' }, { status: 400 });
  }

  try {
    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: link.customerId,
      return_url: new URL(request.url).origin,
      locale: 'ja',
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('stripe portal failed', error);
    return NextResponse.json({ error: 'お支払いの管理画面を開けませんでした。運営窓口へお問い合わせください。' }, { status: 502 });
  }
}
