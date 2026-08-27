import { NextResponse } from 'next/server';
import { getAppUser } from '@/app/app-auth';
import { getMemberAvatar } from '@/db/data';

export async function GET(_request: Request, context: { params: Promise<{ memberId: string }> }) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const { memberId } = await context.params;
  const avatar = await getMemberAvatar(memberId);
  if (!avatar) return NextResponse.json({ error: '顔写真が見つかりません。' }, { status: 404 });
  const headers = new Headers();
  avatar.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=300');
  headers.set('etag', avatar.httpEtag);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(avatar.body, { headers });
}
