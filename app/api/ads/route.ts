import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { availableAdMonths, canBuyAdSlot, getMemberRank, listMemberAds } from '@/db/data';
import { AD_MIN_RANK_LEVEL, AD_TITLE_MAX } from '@/app/ad-options';
import { adMonthsAhead } from '@/app/rank-perks';
import { adSlotConfigured } from '@/app/stripe';

// **Web専用**。出稿枠の空きと、自分が持っている枠を返す。
// 金額は返さない（画面が app/plan-catalog.ts から出す）。
export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;

  const { rank, level } = await getMemberRank(gate.user.userId);
  const eligible = canBuyAdSlot(level);
  // 買えない会員に空き枠を数えさせない。D1の読み出しを増やさないため。
  // DIAMONDは先の月まで押さえられる（ランクの特典）。
  const months = eligible ? await availableAdMonths(adMonthsAhead(level)) : [];

  return NextResponse.json({
    ready: adSlotConfigured(),
    eligible,
    level,
    rank,
    minRankLevel: AD_MIN_RANK_LEVEL,
    titleMax: AD_TITLE_MAX,
    months,
    slots: await listMemberAds(gate.user.userId),
  });
}
