import { getAdmin } from '@/app/admin-auth';
import { env } from 'cloudflare:workers';
import { flushLineNotifications } from '@/db/line-notifications';
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expected = env.LINE_NOTIFY_CRON_TOKEN || '';
  let difference = supplied.length ^ expected.length;
  for (let i = 0; i < Math.max(supplied.length, expected.length); i++) difference |= (supplied.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  const automation = expected.length >= 32 && difference === 0;
  if (!automation && (request.headers.get('origin') !== new URL(request.url).origin || !await getAdmin())) return new Response('Not found', { status: 404 });
  return Response.json(await flushLineNotifications(), { headers: { 'Cache-Control': 'no-store' } });
}
