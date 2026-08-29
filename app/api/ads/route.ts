import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adCalendar, canBuyAdSlot, getMemberRank, listMemberAds } from '@/db/data';
import { AD_CONCURRENT_SLOTS, AD_MIN_RANK_LEVEL, AD_TITLE_MAX } from '@/app/ad-options';
import { adDaysAhead, adMaxDays } from '@/app/rank-perks';
import { adSlotConfigured } from '@/app/stripe';

// **Web専用**。掲載できる日のカレンダーと、自分が持っている枠を返す。
// 金額は返さない（画面が app/plan-catalog.ts から出す）。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;

  const { rank, level } = await getMemberRank(gate.user.userId);
  const eligible = canBuyAdSlot(level);
  // 買えない会員にカレンダーを数えさせない。D1の読み出しを増やさないため。
  const calendar = eligible ? await adCalendar(adDaysAhead(level)) : [];

  return NextResponse.json({
    ready: adSlotConfigured(),
    eligible,
    level,
    rank,
    minRankLevel: AD_MIN_RANK_LEVEL,
    titleMax: AD_TITLE_MAX,
    // 同じ日に出せる本数と、この会員が選べる期間・先行きの上限。
    concurrent: AD_CONCURRENT_SLOTS,
    maxDays: adMaxDays(level),
    daysAhead: adDaysAhead(level),
    calendar,
    slots: await listMemberAds(gate.user.userId),
  });
}
