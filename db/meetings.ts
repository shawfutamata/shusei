import { matchAttendee } from '@/app/meeting/matching';
import { env } from 'cloudflare:workers';
import { validateAnswer, type Answer, type Attendee, type Candidate, type Meeting } from '@/app/meeting/types';

let ready: Promise<unknown> | undefined;
export function ensureMeetings() {
  return ready ??= env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, venue TEXT NOT NULL, closes_at INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, lock_until INTEGER NOT NULL DEFAULT 0, lock_id TEXT NOT NULL DEFAULT '')`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_answers (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES meeting_events(id), token_hash TEXT NOT NULL UNIQUE,
      answer TEXT NOT NULL, present INTEGER NOT NULL DEFAULT 0, analyzed INTEGER NOT NULL DEFAULT 0,
      candidates TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS meeting_answers_event ON meeting_answers(event_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_submit_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)'),
  ]).catch(error => { ready = undefined; throw error; });
}
const selectEvent = 'SELECT id,title,venue,closes_at AS closesAt,state,created_at AS createdAt FROM meeting_events';
export async function meeting(id: string) {
  await ensureMeetings();
  return env.DB.prepare(`${selectEvent} WHERE id=?`).bind(id).first<Meeting>();
}
export async function attendees(id: string): Promise<Attendee[]> {
  await ensureMeetings();
  const rows = await env.DB.prepare('SELECT id,answer,present,analyzed,candidates FROM meeting_answers WHERE event_id=? ORDER BY created_at,id').bind(id)
    .all<{id:string;answer:string;present:number;analyzed:number;candidates:string}>();
  return rows.results.map(row => ({...JSON.parse(row.answer) as Answer,id:row.id,present:row.present,analyzed:row.analyzed,candidates:JSON.parse(row.candidates) as Candidate[]}));
}
export async function listMeetings() {
  await ensureMeetings();
  return (await env.DB.prepare(`${selectEvent} ORDER BY created_at DESC LIMIT 50`).all<Meeting>()).results;
}
export async function createMeeting(body: Record<string,unknown>) {
  await ensureMeetings();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
  const closesAt = Number(body.closesAt);
  if (!title || !venue || title.length>120 || venue.length>120 || !Number.isFinite(closesAt) || closesAt <= Date.now() || closesAt > Date.now()+90*86400000) throw new Error('例会名・会場と、90日以内の未来の締切時刻を入力してください。');
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO meeting_events(id,title,venue,closes_at,created_at) VALUES(?,?,?,?,?)').bind(id,title,venue,closesAt,Date.now()).run();
  return id;
}
async function hash(token:string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function submitAnswer(id:string,body:Record<string,unknown>) {
  const event = await meeting(id);
  if (!event) throw new Error('アンケートが見つかりません。');
  if (body.consent !== true) throw new Error('回答内容の利用への同意が必要です。');
  if (body.website) throw new Error('送信できませんでした。');
  const answer = validateAnswer(body.answer);
  const token = typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) ? body.token : '';
  if (!token) throw new Error('回答用キーを確認してください。');
  const digest = await hash(token);
  // One answer per receipt; retry safely updates it, but never crosses the deadline or analysis freeze.
  const prior = await env.DB.prepare('SELECT id FROM meeting_answers WHERE event_id=? AND token_hash=?').bind(id,digest).first<{id:string}>();
  const result = prior ? await env.DB.prepare(`UPDATE meeting_answers SET answer=? WHERE id=? AND event_id IN
    (SELECT id FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)`).bind(JSON.stringify(answer),prior.id,id,Date.now()).run()
    : await env.DB.prepare(`INSERT INTO meeting_answers(id,event_id,token_hash,answer,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)
      AND (SELECT COUNT(*) FROM meeting_answers WHERE event_id=?)<100`).bind(crypto.randomUUID(),id,digest,JSON.stringify(answer),Date.now(),id,Date.now(),id).run();
  if (!result.meta.changes) throw new Error('受付を締め切りました。または上限100人に達しました。受付係にお声がけください。');
}
export async function ownResult(id:string,token:string) {
  const event = await meeting(id);
  if (!event) return null;
  const row = await env.DB.prepare('SELECT id,answer,present,candidates FROM meeting_answers WHERE event_id=? AND token_hash=?').bind(id,await hash(token)).first<{id:string;answer:string;present:number;candidates:string}>();
  if (!row) return null;
  const people = event.state === 'published' ? await attendees(id) : [];
  const matches = event.state === 'published' && row.present === 1 ? (JSON.parse(row.candidates) as Candidate[]).flatMap(c=> {
    const p = people.find(p=>p.id===c.id && p.present === 1);
    return p ? [{...c,name:p.name,company:p.company,table:p.table,industry:p.industry}] : [];
  }) : [];
  return {event,answer:JSON.parse(row.answer) as Answer,present:row.present,matches};
}
export async function confirmAttendance(id:string,personId:string,present:boolean) {
  const result = await env.DB.prepare(`UPDATE meeting_answers SET present=? WHERE event_id=? AND id=? AND EXISTS
    (SELECT 1 FROM meeting_events WHERE id=? AND state='open')`).bind(present?1:0,id,personId,id).run();
  if (!result.meta.changes) throw new Error('集計開始後は出席者を変更できません。');
}

export async function analyzeNext(id:string) {
  const event = await meeting(id);
  if (!event || event.closesAt > Date.now()) throw new Error('締切時刻になってから集計できます。');
  if (event.state==='review' || event.state==='published') return;
  const lock = crypto.randomUUID();
  const acquired = await env.DB.prepare(`UPDATE meeting_events SET state='analyzing',lock_until=?,lock_id=?
    WHERE id=? AND state IN ('open','analyzing') AND lock_until<?`).bind(Date.now()+600000,lock,id,Date.now()).run();
  if (!acquired.meta.changes) throw new Error('別の集計処理が実行中です。しばらくして再試行してください。');
  try {
    const all = (await attendees(id)).filter(p=>p.present===1);
    const pending = all.filter(p=>!p.analyzed).slice(0,3);
    if (!pending.length) {
      await env.DB.prepare("UPDATE meeting_events SET state='review' WHERE id=? AND lock_id=?").bind(id,lock).run();
      return;
    }
    let active=0;
    const queue:(()=>void)[]=[];
    const client={async run(model:string,inputs:Parameters<typeof env.MEETING_AI.run>[1]){
      if(active>=4) await new Promise<void>(resolve=>queue.push(resolve));
      else active++;
      try {
        const lease=await env.DB.prepare("UPDATE meeting_events SET lock_until=? WHERE id=? AND lock_id=? AND state='analyzing'").bind(Date.now()+600000,id,lock).run();
        if(!lease.meta.changes) throw new Error('集計の担当が切り替わりました。再読み込みしてください。');
        return await env.MEETING_AI.run(model,inputs);
      } finally {const next=queue.shift();if(next)next();else active--;}
    }};
    const results=await Promise.allSettled(pending.map(async seeker=>{
      const choices=await matchAttendee(client,seeker,all);
      await env.DB.prepare(`UPDATE meeting_answers SET candidates=?,analyzed=1 WHERE id=? AND event_id=? AND EXISTS
        (SELECT 1 FROM meeting_events WHERE id=? AND lock_id=?)`).bind(JSON.stringify(choices),seeker.id,id,id,lock).run();
    }));
    const failed=results.find(r=>r.status==='rejected');
    if(failed?.status==='rejected')throw failed.reason;

  } finally {
    await env.DB.prepare('UPDATE meeting_events SET lock_until=0,lock_id=\'\' WHERE id=? AND lock_id=?').bind(id,lock).run();
  }
}
export async function removeCandidate(id:string,answerId:string,candidateId:string) {
  const event=await meeting(id);
  if(event?.state!=='review') throw new Error('候補確認中のみ編集できます。');
  const person=(await attendees(id)).find(p=>p.id===answerId);
  if(!person) throw new Error('回答が見つかりません。');
  await env.DB.prepare("UPDATE meeting_answers SET candidates=? WHERE id=? AND event_id=? AND EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='review')")
    .bind(JSON.stringify(person.candidates.filter(c=>c.id!==candidateId)),answerId,id,id).run();
}
export async function publishMeeting(id:string) {
  const result=await env.DB.prepare("UPDATE meeting_events SET state='published' WHERE id=? AND state='review'").bind(id).run();
  if(!result.meta.changes) throw new Error('全員分の集計を終えてから公開してください。');
}

export async function checkSubmissionLimit(eventId:string,ip:string) {
  await ensureMeetings();
  const bucket=Math.floor(Date.now()/600000);
  const key=await hash(eventId+':'+ip+':'+bucket);
  const row=await env.DB.prepare(`INSERT INTO meeting_submit_limits(id,count,expires) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count`).bind(key,(bucket+1)*600000).first<{count:number}>();
  await env.DB.prepare('DELETE FROM meeting_submit_limits WHERE expires<?').bind(Date.now()-600000).run();
  // Shared venue Wi-Fi can serve every attendee. No raw IP address is retained.
  return !!row && row.count<=200;
}
