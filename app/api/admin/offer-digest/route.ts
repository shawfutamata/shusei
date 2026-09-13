import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAdmin } from '@/app/admin-auth';
import { isAutomationToken } from '@/app/automation-auth';
import { sendPendingOfferDigest } from '@/db/data';

/**
 * 夜（21時ごろ）に、その日の2件目以降のオファーをまとめて送る。
 *
 * 入れるのは backup と同じ2通りだけ。**管理者としてログインしているか、
 * 合言葉（BACKUP_TOKEN）を持っているか。** 合言葉は毎日の自動実行
 * （GitHub Actions）のためのもの。どちらでもなければ、この道があること
 * 自体を伏せる（401ではなく404を返す）。
 */
async function allowed() {
  if (await getAdmin()) return true;
  const authorization = (await headers()).get('authorization') ?? '';
  return authorization.startsWith('Bearer ') && isAutomationToken(authorization.slice(7).trim());
}

export async function POST() {
  if (!await allowed()) return new Response('Not found', { status: 404 });
  const result = await sendPendingOfferDigest();
  return NextResponse.json(result);
}
