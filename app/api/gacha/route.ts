import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adGacha, findPrize, gachaSeason, gachaWholePeriod } from '@/app/gacha';
import { drawGacha, getGachaState } from '@/db/data';

// **Web専用**。1日1回のガチャ。
// 引くのはサーバー。画面は結果を受け取って出すだけで、当たりを決めない。

function view(state: Awaited<ReturnType<typeof getGachaState>>) {
  const season = gachaSeason();
  const prize = state.drawnToday ? findPrize(state.prizeKey) : null;
  const period = gachaWholePeriod();
  return {
    key: adGacha.key,
    period: period.label,
    // 今日開いている回。期間外なら null で、画面には何も出ない。
    season: season && {
      key: season.key, name: season.name, theme: season.theme,
      action: season.action, emoji: season.emoji, lead: season.lead,
      // 何が当たるかは先に見せる。中身を伏せたまま引かせない。
      prizes: season.prizes.map((item) => ({ key: item.key, label: item.label, days: item.days })),
    },
    drawnToday: state.drawnToday,
    prize: prize && { key: prize.key, label: prize.label, days: prize.days, note: prize.note },
    streak: state.streak,
    wonDays: state.wonDays,
    memberCapDays: adGacha.memberCapDays,
    giftDays: state.giftDays,
    giftExpiresOn: state.giftExpiresOn,
  };
}

export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  return NextResponse.json(view(await getGachaState(gate.user.userId)));
}

export async function POST() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const before = await getGachaState(gate.user.userId);
  if (!gachaSeason()) {
    return NextResponse.json({ error: `ガチャは${gachaWholePeriod().label}のあいだだけお引きいただけます。` }, { status: 409 });
  }
  if (before.drawnToday) {
    return NextResponse.json({ error: '今日のぶんはもうお引きになりました。また明日どうぞ。', ...view(before) }, { status: 409 });
  }
  return NextResponse.json(view(await drawGacha(gate.user.userId)));
}
