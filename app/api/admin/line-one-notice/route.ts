import { getOneNoticeOwner } from '@/app/line-one-notice';
import { closeOneNotice, getOneNoticeStatus, sendOneNotice } from '@/db/line-one-notice';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
export async function GET() {
  try { const owner = await getOneNoticeOwner(); return owner ? reply(await getOneNoticeStatus(owner.userId)) : reply({ error: 'not_found' }, 404); }
  catch { return reply({ error: '状態を確認できません。送信せず停止してください。' }, 503); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'origin' }, 403);
  try {
    const owner = await getOneNoticeOwner();
    if (!owner) return reply({ error: 'not_found' }, 404);
    const raw = await request.text();
    if (raw.length > 500) return reply({ error: 'input' }, 400);
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['action', 'confirm', 'window'].includes(key)) || body.confirm !== true) return reply({ error: 'input' }, 400);
    if (body.action === 'close') return reply(await closeOneNotice(owner.userId));
    if (body.action !== 'send' || typeof body.window !== 'string') return reply({ error: 'input' }, 400);
    return reply(await sendOneNotice(owner.userId, body.window));
  } catch { return reply({ error: '結果を確認できません。同じ操作を繰り返さず停止してください。' }, 503); }
}
