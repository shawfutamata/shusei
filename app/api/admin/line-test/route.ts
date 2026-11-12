import { getLineTestOwner } from '@/app/line-test-auth';
import { lineTestReadyForMember } from '@/app/line-test-config';
import { closeLineTest, getLineTestStatus, sendLineTestNotice } from '@/db/line-test';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers });
export async function GET() {
  try {
    const owner = await getLineTestOwner();
    if (!owner || !lineTestReadyForMember(owner.userId)) return reply({ error: 'not_found' }, 404);
    return reply(await getLineTestStatus(owner.userId));
  } catch { return reply({ error: 'テスト状態を確認できませんでした。送信せず停止してください。' }, 503); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '送信元を確認してください。' }, 403);
  try {
    const owner = await getLineTestOwner();
    if (!owner || !lineTestReadyForMember(owner.userId)) return reply({ error: 'not_found' }, 404);
    const raw = await request.text();
    if (raw.length > 500) return reply({ error: '入力を確認してください。' }, 400);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: '入力を確認してください。' }, 400);
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !['action', 'slot', 'confirm'].includes(key)) || input.confirm !== true) return reply({ error: '操作を確認してください。' }, 400);
    if (input.action === 'close') return reply(await closeLineTest(owner.userId));
    if (input.action !== 'send' || (input.slot !== 1 && input.slot !== 2)) return reply({ error: '操作を確認してください。' }, 400);
    return reply(await sendLineTestNotice(owner.userId, input.slot));
  } catch {
    // 外部本文や秘密を返さず、結果不明時も再送を勧めない。
    return reply({ error: '送信結果を確認できませんでした。同じ操作を繰り返さず、状態を確認してください。' }, 503);
  }
}
