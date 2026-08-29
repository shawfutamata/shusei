import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getReferralSummary, getStripeLink } from '@/db/data';
import { stripeConfigured } from '@/app/stripe';

// Web専用。無料月の残高とお支払いの状態を含むので、アプリからは呼ばない
// （アプリは /api/invite と /api/entitlements を使う）。
export async function GET(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const [summary, link] = await Promise.all([
    getReferralSummary(gate.user.userId),
    getStripeLink(gate.user.userId),
  ]);
  return NextResponse.json({
    ...summary,
    url: `${new URL(request.url).origin}/join/${summary.code}`,
    billing: { ready: stripeConfigured(), hasCustomer: Boolean(link.customerId) },
  });
}
