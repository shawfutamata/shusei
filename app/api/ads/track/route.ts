import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { recordAdClick, recordAdViews } from '@/db/data';
import { AD_SLOTS_PER_MONTH } from '@/app/ad-options';

// 掲載の成果を数える。出稿した人に「何人に見られて、何回押されたか」を返すため。
//
// 見られた数の間引きは端末側でやっている（同じ広告は1日1回まで）。ここは
// 送られてきたぶんを足すだけ。1回の呼び出しで足せる件数を枠数までに抑えて、
// 書き込みが増えすぎないようにしている。
export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;

  const body = await request.json().catch(() => ({})) as { views?: unknown; clicks?: unknown };
  const views = idList(body.views);
  const clicks = idList(body.clicks);
  if (!views.length && !clicks.length) return NextResponse.json({ ok: true });

  await recordAdViews(views).catch(() => undefined);
  for (const id of clicks) await recordAdClick(id).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

function idList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 64)
    .slice(0, AD_SLOTS_PER_MONTH);
}
