import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createRequest, getBoardData } from '@/db/data';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  return NextResponse.json(await getBoardData(user));
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const category = clean(body.category, 32);
  const title = clean(body.title, 90);
  const description = clean(body.description, 600);
  const budgetLabel = clean(body.budgetLabel, 60);
  const area = clean(body.area, 60);
  const deadline = clean(body.deadline, 10);
  if (!['project', 'collaboration', 'consultation'].includes(category) || !title || !description || !budgetLabel || !area || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 });
  }
  const id = await createRequest(user, { category, title, description, budgetLabel, area, deadline });
  return NextResponse.json({ id }, { status: 201 });
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
