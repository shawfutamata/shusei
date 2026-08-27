import { NextResponse } from 'next/server';
import { getAppUser } from '@/app/app-auth';
import { createRequest, getBoardData } from '@/db/data';
import { isIndustry } from '@/app/industry-options';

export async function GET() {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  return NextResponse.json(await getBoardData(user));
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const category = clean(body.category, 32);
  const title = clean(body.title, 90);
  const description = clean(body.description, 600);
  const budgetLabel = clean(body.budgetLabel, 60);
  const area = clean(body.area, 60);
  const industryTags = cleanIndustries(body.industryTags, 3);
  const deadline = clean(body.deadline, 10);
  if (!['project', 'collaboration', 'consultation'].includes(category) || !title || !description || !budgetLabel || !area || !industryTags.length || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 });
  }
  try {
    const id = await createRequest(user, { category, title, description, budgetLabel, area, industryTags, deadline });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '投稿できませんでした。' }, { status: 400 });
  }
}

function cleanIndustries(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && isIndustry(item)))].slice(0, max);
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
