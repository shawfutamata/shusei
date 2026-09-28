import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminSetRequestReportDone } from '@/db/admin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  const { done } = await request.json() as { done?: boolean };
  await adminSetRequestReportDone(id, done === true);
  return NextResponse.json({ ok: true });
}
