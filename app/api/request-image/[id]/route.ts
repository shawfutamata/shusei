import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getRequestImage } from '@/db/data';

// 一覧用（thumb）と詳細用（full）を1つの経路で返す。
// URLに版番号が入るので1年キャッシュしてよい。R2の読み出し回数を抑えるため。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const size = params.get('size') === 'full' ? 'full' : 'thumb';
  // 2枚目以降は ?n= で指定する。1枚目は番号なし（以前の投稿と同じ場所）。
  const index = Math.max(0, Math.min(9, Number(params.get('n') ?? 0) || 0));
  const object = await getRequestImage(id, size, index);
  if (!object) return NextResponse.json({ error: '画像が見つかりません。' }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}
