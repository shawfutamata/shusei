import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { adGacha, findPrize, gachaMonthDay, gachaSeason, jstDate, nextSeason, wheelSegments } from '@/app/gacha';
import { drawGacha, getGachaState } from '@/db/data';

// **Web専用**。1日1回のガチャ。
// 引くのはサーバー。画面は結果を受け取って出すだけで、当たりを決めない。

function view(state: Awaited<ReturnType<typeof getGachaState>>) {
  const season = gachaSeason();
  const coming = nextSeason();
  const prize = state.drawnToday ? findPrize(state.prizeKey) : null;
  return {
    key: adGacha.key,
    // 日本時間の今日。画面が「今日はもう自動で開いたか」を覚えるのに使う。
    // **ブラウザ側で日付を作らない。** 端末の時計や時間帯がずれていると、
    // 1日に何度も開いたり、まる1日開かなかったりする。
    today: jstDate(),
    // 今日の回。見た目（テーマ）と当たりの名前はここで変わる。
    season: season && {
      key: season.key, name: season.name, theme: season.theme,
      action: season.action, motion: season.motion, image: season.image, machine: season.machine,
      video: season.video, videoStopAt: season.videoStopAt, lead: season.lead,
      // ルーレット盤のコマの並び。**サーバーで作って渡す。**
      // 画面側で並べ直すと、サーバーが作ったHTMLと食い違う。
      segments: wheelSegments(season),
      // 何が当たるかは先に見せる。中身を伏せたまま引かせない。
      prizes: season.prizes.map((item) => ({ key: item.key, tier: item.tier, label: item.label, short: item.short, days: item.days })),
    },
    // 次の季節の回。「12月20日からクリスマス」と先に知らせる。
    coming: coming && { name: coming.name, from: gachaMonthDay(coming.from) },
    drawnToday: state.drawnToday,
    // 運営は何度でも回せる。2回目以降は「お試し」で、記録も券も増えない。
    master: state.master,
    practice: state.practice,
    prize: prize && { key: prize.key, tier: prize.tier, label: prize.label, days: prize.days, note: prize.note },
    streak: state.streak,
    monthDays: state.monthDays,
    memberCapDaysPerMonth: adGacha.memberCapDaysPerMonth,
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
    return NextResponse.json({ error: 'ただいまガチャはお休みしています。' }, { status: 409 });
  }
  // 運営のアカウントだけ、今日ぶんを引いたあとも回せる（見た目の確認用）。
  if (before.drawnToday && !before.master) {
    return NextResponse.json({ error: '今日のぶんはもうお引きになりました。また明日どうぞ。', ...view(before) }, { status: 409 });
  }
  return NextResponse.json(view(await drawGacha(gate.user.userId)));
}
