import { NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';
import Stripe from 'stripe';
import { planForPrice, stripeClient } from '@/app/stripe';
import { applyStripeSubscription, findMemberByStripeCustomer } from '@/db/data';

// Stripeからの通知だけを受ける。署名を必ず確かめる。
// ログインは通さない（Stripeは会員ではない）ので、署名が唯一の身元確認。
export async function POST(request: Request) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature') ?? '';
  if (!secret || !signature) return NextResponse.json({ error: 'signature required' }, { status: 400 });

  const body = await request.text();
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    // Workersには同期のcryptoが無いので、非同期の検証を使う。
    event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return NextResponse.json({ error: 'signature verification failed' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const memberId = session.metadata?.memberId ?? '';
      if (memberId && typeof session.subscription === 'string') {
        await syncSubscription(await stripe.subscriptions.retrieve(session.subscription), memberId);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await syncSubscription(event.data.object);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

// 契約が生きているとみなす状態。past_due は支払い直し待ちなので、まだ使えるままにする。
const liveStatuses = new Set(['active', 'trialing', 'past_due']);

async function syncSubscription(subscription: Stripe.Subscription, knownMemberId = '') {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const memberId = knownMemberId || subscription.metadata?.memberId || await findMemberByStripeCustomer(customerId);
  if (!memberId) return;

  const item = subscription.items.data[0];
  const plan = planForPrice(item?.price?.id ?? '');
  if (!plan) return;

  // 期間の終わりは item が持つ（サブスク直下の current_period_end は無くなった）。
  const endSeconds = item?.current_period_end ?? 0;
  const periodEnd = endSeconds ? new Date(endSeconds * 1000).toISOString().slice(0, 10) : '';
  await applyStripeSubscription({
    memberId, plan, subscriptionId: subscription.id, periodEnd,
    active: liveStatuses.has(subscription.status),
  });
}
