import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getRequestVideo } from '@/db/data';

// 探しごとに付いた動画。URLに版番号が入るので1年キャッシュしてよい。
//
// 動画は途中から再生されることがあるので、Rangeリクエストに応える。
// 応えないと、iOSのSafariでシークができない（そもそも再生が始まらないことがある）。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;

  const object = await getRequestVideo(id);
  if (!object) return NextResponse.json({ error: '動画が見つかりません。' }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'private, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('accept-ranges', 'bytes');

  const range = request.headers.get('range');
  const total = object.size;
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
    }
    // 欲しい範囲だけ取り直す。全部読んでから切ると、その分だけ転送量を無駄にする。
    const part = await getRequestVideo(id);
    if (!part) return NextResponse.json({ error: '動画が見つかりません。' }, { status: 404 });
    const bytes = new Uint8Array(await part.arrayBuffer()).slice(start, end + 1);
    headers.set('content-range', `bytes ${start}-${end}/${total}`);
    headers.set('content-length', String(bytes.byteLength));
    return new Response(bytes, { status: 206, headers });
  }

  headers.set('content-length', String(total));
  return new Response(object.body, { headers });
}
