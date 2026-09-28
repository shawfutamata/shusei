import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { isRequestReportReason } from '@/app/request-policy';
import { createRequestReport } from '@/db/data';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  const body = await request.json() as { reason?: unknown; details?: unknown };
  if (!isRequestReportReason(body.reason)) {
    return NextResponse.json({ error: '異議申し立ての理由を選んでください。' }, { status: 400 });
  }
  try {
    await createRequestReport(gate.user, id, {
      reason: body.reason,
      details: typeof body.details === 'string' ? body.details : '',
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '異議申し立てを送れませんでした。' }, { status: 400 });
  }
}
