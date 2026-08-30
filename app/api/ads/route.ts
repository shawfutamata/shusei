import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adCalendar, canBuyAdSlot, getMemberRank, listMemberAds } from '@/db/data';
import { AD_DESCRIPTION_MAX, AD_TITLE_MAX, adPlacements } from '@/app/ad-options';
import { AD_DAYS_AHEAD_ALL, AD_MAX_DAYS_ALL, adDiscountRate } from '@/app/rank-perks';
import { adSlotConfigured } from '@/app/stripe';

// **Web専用**。掲載できる日のカレンダーと、自分が持っている枠を返す。
// 金額は返さない（画面が app/plan-catalog.ts から出す）。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;

  const { rank, level } = await getMemberRank(gate.user.userId);
  const eligible = canBuyAdSlot();
  // 買えない会員にカレンダーを数えさせない。D1の読み出しを増やさないため。
  const daysAhead = AD_DAYS_AHEAD_ALL;
  // 空きは場所ごとに違う（バナー5枠・一覧3枠）。2つぶんまとめて返す。
  const calendars = eligible
    ? Object.fromEntries(await Promise.all(adPlacements.map(async (item) =>
        [item.key, await adCalendar(daysAhead, item.key)] as const)))
    : {};

  return NextResponse.json({
    ready: adSlotConfigured(),
    eligible,
    level,
    rank,
    discountRate: adDiscountRate(level),
    titleMax: AD_TITLE_MAX,
    descriptionMax: AD_DESCRIPTION_MAX,
    // 出せる場所と、それぞれの枠数。
    placements: adPlacements,
    maxDays: AD_MAX_DAYS_ALL,
    daysAhead,
    calendars,
    slots: await listMemberAds(gate.user.userId),
  });
}
