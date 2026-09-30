import { env } from 'cloudflare:workers';
import { ensureDatabase } from './data';

/** One event per member and day; a page refresh never inflates unique-member conversion. */
export async function recordProductEvent(memberId: string, name: 'tasuki_opened' | 'profile_updated' | 'meeting_joined', context = '') {
  await ensureDatabase();
  const now = new Date().toISOString();
  const key = name === 'meeting_joined' ? context : now.slice(0, 10);
  if (!memberId || !key) return;
  await env.DB.prepare(`INSERT INTO member_product_events(member_id,event_name,context,occurred_at,last_occurred_at) VALUES(?,?,?,?,?)
    ON CONFLICT(member_id,event_name,context) DO UPDATE SET last_occurred_at=excluded.last_occurred_at`)
    .bind(memberId, name, key, now, now).run();
}
