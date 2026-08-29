import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getMemberAvatar } from '@/db/data';

export async function GET(_request: Request, context: { params: Promise<{ memberId: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { memberId } = await context.params;
  const avatar = await getMemberAvatar(memberId);
  if (!avatar) return NextResponse.json({ error: '顔写真が見つかりません。' }, { status: 404 });
  const headers = new Headers();
  avatar.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=31536000, immutable');
  headers.set('etag', avatar.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(avatar.body, { headers });
}
