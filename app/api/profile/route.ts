import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { updateMemberProfile } from '@/db/data';

const allowedBands = ['', 'revenue_10_30', 'revenue_30_70', 'revenue_70_100', 'revenue_100_plus'];

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const company = clean(body.company, 80);
  const venue = clean(body.venue, 60);
  const positionTitle = clean(body.positionTitle, 60);
  const badge = clean(body.badge, 40);
  const businessArea = clean(body.businessArea, 60);
  const annualRevenueBand = clean(body.annualRevenueBand, 30);
  if (!company || !venue) {
    return NextResponse.json({ error: '会社名と所属会場を入力してください。' }, { status: 400 });
  }
  if (!allowedBands.includes(annualRevenueBand)) {
    return NextResponse.json({ error: '年商の選択内容を確認してください。' }, { status: 400 });
  }
  await updateMemberProfile(user, { company, venue, positionTitle, badge, businessArea, annualRevenueBand });
  return NextResponse.json({ company, venue, positionTitle, badge, businessArea, annualRevenueBand });
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
