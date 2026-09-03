import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adGacha, gachaPeriodLabel, gachaPrize } from '@/app/gacha';
import { drawGacha, getGachaState } from '@/db/data';

// **Web専用**。広告の無料ガチャ。
// 引くのはサーバー。画面は結果を受け取って出すだけで、当たりを決めない。
// 金額には触れないので、アプリから呼んでも審査の線は越えないが、
// いまはWebだけで出している。

function view(state: Awaited<ReturnType<typeof getGachaState>>) {
  const prize = state.drawn ? gachaPrize(state.prizeKey) : null;
  return {
    key: adGacha.key,
    name: adGacha.name,
    period: gachaPeriodLabel(),
    open: state.open,
    drawn: state.drawn,
    prize: prize && { key: prize.key, label: prize.label, days: prize.days, note: prize.note },
    giftDays: state.giftDays,
    giftExpiresOn: state.giftExpiresOn,
    // 何が当たるかは先に見せる。中身を伏せたまま引かせない。
    prizes: adGacha.prizes.map((item) => ({ key: item.key, label: item.label, days: item.days })),
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
  if (!before.open) {
    return NextResponse.json({ error: `ガチャは${gachaPeriodLabel()}のあいだだけお引きいただけます。` }, { status: 409 });
  }
  if (before.drawn) {
    return NextResponse.json({ error: 'ガチャはお一人さま1回までです。', ...view(before) }, { status: 409 });
  }
  return NextResponse.json(view(await drawGacha(gate.user.userId)));
}
