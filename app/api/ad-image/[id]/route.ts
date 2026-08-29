import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getAdImage } from '@/db/data';

// URLに版番号が入るので1年キャッシュしてよい。R2の読み出し回数を抑えるため。
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  const object = await getAdImage(id);
  if (!object) return NextResponse.json({ error: '画像が見つかりません。' }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}
