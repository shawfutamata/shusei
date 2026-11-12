import { env } from 'cloudflare:workers';
import { lineMessagingReady, validLineSignature } from '@/app/line-auth';
import { processLineWebhook, type LineWebhookEvent } from '@/db/line-notifications';
export async function POST(request: Request) {
  if (!lineMessagingReady()) return new Response('Not configured', { status: 503 });
  const raw = await request.text(); if (raw.length > 262144) return new Response('Too large', { status: 413 });
  if (!await validLineSignature(raw, request.headers.get('x-line-signature') || '')) return new Response('Invalid signature', { status: 401 });
  try {
    const body = JSON.parse(raw) as { destination?: string; events?: LineWebhookEvent[] };
    if (body.destination !== env.LINE_BOT_USER_ID || !Array.isArray(body.events) || body.events.length > 100) return new Response('Invalid event', { status: 400 });
    await processLineWebhook(body.events); return Response.json({ ok: true });
  } catch { return new Response('Unable to process', { status: 500 }); }
}
