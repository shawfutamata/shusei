import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminAnalytics } from '@/db/admin';

export async function GET(request: Request) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const days = Number(new URL(request.url).searchParams.get('days') ?? 90);
  return NextResponse.json(await adminAnalytics(Number.isFinite(days) ? days : 90));
}
