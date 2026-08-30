import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminAds, adminFeedback, adminMembers, adminRequests, adminSummary } from '@/db/admin';

// 管理画面の中身をまとめて返す。**入口はここで一度だけ確かめる。**
export async function GET(request: Request) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const keyword = new URL(request.url).searchParams.get('q') ?? '';
  const [summary, members, requests, ads, feedback] = await Promise.all([
    adminSummary(), adminMembers(keyword), adminRequests(keyword), adminAds(), adminFeedback(),
  ]);
  return NextResponse.json({ summary, members, requests, ads, feedback });
}
