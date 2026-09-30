import { env } from 'cloudflare:workers';
import { ensureDatabase } from './data';
import { ensureMeetings } from './meetings';

export type MeetingConversion = {
  includeTests: boolean;
  events: number;
  people: number;
  newAccounts: number;
  answered: number;
  opened: number;
  profileUpdated: number;
  used: number;
  byEvent: { id: string; title: string; venue: string; date: string; people: number; answered: number; opened: number; used: number }[];
};

type EventRow = { id: string; title: string; venue: string; closesAt: number };
type LinkRow = {
  eventId: string; memberId: string; eventCreatedAt: number; joinedAt: string | null;
  memberCreatedAt: string; source: string; answered: number;
  openedAt: string | null; profileUpdatedAt: string | null; usedAt: number;
};

export async function meetingConversion(days: number, includeTests: boolean): Promise<MeetingConversion> {
  await ensureDatabase();
  await ensureMeetings();
  const sinceMs = Date.now() - (days - 1) * 86400_000;
  const events = (await env.DB.prepare(`SELECT e.id,e.title,e.venue,e.closes_at AS closesAt
    FROM meeting_events e WHERE e.closes_at>=? AND e.state NOT IN ('trashed','deleting')
    AND (?=1 OR e.title NOT LIKE '%テスト%') ORDER BY e.closes_at DESC`)
    .bind(sinceMs, includeTests ? 1 : 0).all<EventRow>()).results;
  if (!events.length) return { includeTests, events: 0, people: 0, newAccounts: 0, answered: 0, opened: 0, profileUpdated: 0, used: 0, byEvent: [] };

  // Enrollment is the earliest meaningful event. Older links predate event tracking,
  // so their event creation time is an approximate lower bound, disclosed in the UI.
  const links = (await env.DB.prepare(`SELECT l.event_id AS eventId,l.member_id AS memberId,
      e.created_at AS eventCreatedAt,m.created_at AS memberCreatedAt,m.membership_source AS source,
      CASE WHEN l.answer_id!='' THEN 1 ELSE 0 END AS answered,
      (SELECT MIN(p.occurred_at) FROM member_product_events p WHERE p.member_id=l.member_id AND p.event_name='meeting_joined' AND p.context=l.event_id) AS joinedAt,
      (SELECT MAX(p.last_occurred_at) FROM member_product_events p WHERE p.member_id=l.member_id AND p.event_name='tasuki_opened'
        AND p.last_occurred_at>=COALESCE((SELECT MIN(j.occurred_at) FROM member_product_events j WHERE j.member_id=l.member_id AND j.event_name='meeting_joined' AND j.context=l.event_id),strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000,'unixepoch'))) AS openedAt,
      (SELECT MAX(p.last_occurred_at) FROM member_product_events p WHERE p.member_id=l.member_id AND p.event_name='profile_updated'
        AND p.last_occurred_at>=COALESCE((SELECT MIN(j.occurred_at) FROM member_product_events j WHERE j.member_id=l.member_id AND j.event_name='meeting_joined' AND j.context=l.event_id),strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000,'unixepoch'))) AS profileUpdatedAt,
      (EXISTS(SELECT 1 FROM requests r WHERE r.author_id=l.member_id AND r.created_at>=COALESCE((SELECT MIN(j.occurred_at) FROM member_product_events j WHERE j.member_id=l.member_id AND j.event_name='meeting_joined' AND j.context=l.event_id),strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000,'unixepoch')))
       OR EXISTS(SELECT 1 FROM introductions i WHERE i.introducer_id=l.member_id AND i.created_at>=COALESCE((SELECT MIN(j.occurred_at) FROM member_product_events j WHERE j.member_id=l.member_id AND j.event_name='meeting_joined' AND j.context=l.event_id),strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000,'unixepoch')))
       OR EXISTS(SELECT 1 FROM ad_introductions i WHERE i.introducer_id=l.member_id AND i.created_at>=COALESCE((SELECT MIN(j.occurred_at) FROM member_product_events j WHERE j.member_id=l.member_id AND j.event_name='meeting_joined' AND j.context=l.event_id),strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000,'unixepoch')))
       OR EXISTS(SELECT 1 FROM direct_messages d WHERE d.sender_id=l.member_id AND d.created_at>=COALESCE((SELECT MIN(j.occurred_at) FROM member_product_events j WHERE j.member_id=l.member_id AND j.event_name='meeting_joined' AND j.context=l.event_id),strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000,'unixepoch')))
       OR EXISTS(SELECT 1 FROM introduction_messages im WHERE im.sender_id=l.member_id AND im.created_at>=COALESCE((SELECT MIN(j.occurred_at) FROM member_product_events j WHERE j.member_id=l.member_id AND j.event_name='meeting_joined' AND j.context=l.event_id),strftime('%Y-%m-%dT%H:%M:%fZ',e.created_at/1000,'unixepoch')))) AS usedAt
    FROM meeting_member_links l JOIN meeting_events e ON e.id=l.event_id JOIN members m ON m.id=l.member_id
    WHERE e.closes_at>=? AND e.state NOT IN ('trashed','deleting') AND (?=1 OR e.title NOT LIKE '%テスト%')`)
    .bind(sinceMs, includeTests ? 1 : 0).all<LinkRow>()).results;

  const byEvent = events.map((event) => {
    const group = links.filter((link) => link.eventId === event.id);
    return {
      id: event.id, title: event.title, venue: event.venue,
      date: new Date(event.closesAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }),
      people: group.length, answered: group.filter((row) => row.answered).length,
      opened: group.filter((row) => row.openedAt).length,
      used: group.filter((row) => row.usedAt).length,
    };
  });
  // One person can attend several meetings. Headline conversion counts each member once.
  const unique = new Map<string, LinkRow>();
  for (const row of [...links].sort((a, b) => (a.joinedAt ?? new Date(a.eventCreatedAt).toISOString()).localeCompare(b.joinedAt ?? new Date(b.eventCreatedAt).toISOString()))) {
    const previous = unique.get(row.memberId);
    if (!previous) unique.set(row.memberId, row);
    else unique.set(row.memberId, {
      ...previous, answered: previous.answered || row.answered,
      openedAt: previous.openedAt || row.openedAt,
      profileUpdatedAt: previous.profileUpdatedAt || row.profileUpdatedAt,
      usedAt: previous.usedAt || row.usedAt,
    });
  }
  const people = [...unique.values()];
  return {
    includeTests, events: events.length, people: people.length,
    newAccounts: people.filter((row) => row.source === 'meeting_signup' && Date.parse(row.memberCreatedAt) >= row.eventCreatedAt).length,
    answered: people.filter((row) => row.answered).length,
    opened: people.filter((row) => row.openedAt).length,
    profileUpdated: people.filter((row) => row.profileUpdatedAt).length,
    used: people.filter((row) => row.usedAt).length,
    byEvent,
  };
}
