import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { updateMemberRevenueBand } from '@/db/data';

const allowedBands = ['', 'revenue_10_30', 'revenue_30_70', 'revenue_70_100', 'revenue_100_plus'];

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const annualRevenueBand = typeof body.annualRevenueBand === 'string' ? body.annualRevenueBand : '';
  if (!allowedBands.includes(annualRevenueBand)) {
    return NextResponse.json({ error: '年商の選択内容を確認してください。' }, { status: 400 });
  }
  await updateMemberRevenueBand(user, annualRevenueBand);
  return NextResponse.json({ annualRevenueBand });
}
