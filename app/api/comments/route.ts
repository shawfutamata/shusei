import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { addRequestComment, deleteRequestComment, getRequestComments } from '@/db/data';

export async function GET(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const requestId = new URL(request.url).searchParams.get('requestId') ?? '';
  if (!requestId) return NextResponse.json({ error: '探しごとが指定されていません。' }, { status: 400 });
  return NextResponse.json({ comments: await getRequestComments(requestId) });
}

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  try {
    const { requestId, body } = await request.json() as { requestId?: string; body?: string };
    if (!requestId) throw new Error('探しごとが指定されていません。');
    return NextResponse.json({ comments: await addRequestComment(gate.user, requestId, body ?? '') }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'コメントを送れませんでした。' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  try {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    await deleteRequestComment(gate.user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'コメントを削除できませんでした。' }, { status: 400 });
  }
}
