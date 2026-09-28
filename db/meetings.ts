import { matchAttendee } from '@/app/meeting/matching';
import { env } from 'cloudflare:workers';
import { validateAnswer, type Answer, type Attendee, type Candidate, type Meeting, type RosterPerson } from '@/app/meeting/types';
import { normalizedName, rosterAnswer, validateRoster } from '@/app/meeting/roster';

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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_roster (id TEXT PRIMARY KEY,event_id TEXT NOT NULL,profile TEXT NOT NULL,name_key TEXT NOT NULL)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS meeting_roster_event ON meeting_roster(event_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_roster_claims (roster_id TEXT PRIMARY KEY,answer_id TEXT NOT NULL UNIQUE)'),
  ]).catch(error => { ready = undefined; throw error; });
}
const selectEvent = 'SELECT id,title,venue,closes_at AS closesAt,state,created_at AS createdAt,(SELECT COUNT(*) FROM meeting_roster WHERE event_id=meeting_events.id) AS rosterCount FROM meeting_events';
export async function roster(id:string):Promise<RosterPerson[]> {
  await ensureMeetings();
  const rows=await env.DB.prepare('SELECT id,profile FROM meeting_roster WHERE event_id=? ORDER BY name_key,id').bind(id).all<{id:string;profile:string}>();
  return rows.results.map(row=>({...JSON.parse(row.profile),id:row.id}));
}
export async function findRoster(id:string,name:string) {
  const key=normalizedName(name);
  if(key.length<2||key.length>120)return [];
  const event=await meeting(id);
  if(!event||event.state!=='open'||event.closesAt<=Date.now())return [];
  // No public full directory, contacts, or arbitrary prefix search.
  return (await roster(id)).filter(p=>normalizedName(p.name)===key).slice(0,10);
}
export async function importRoster(id:string,raw:unknown,consent:unknown) {
  if(consent!==true)throw new Error('名簿をこのアンケートに利用する許可を確認してください。');
  const profiles=validateRoster(raw),event=await meeting(id);
  if(!event||event.state!=='open'||event.closesAt<=Date.now())throw new Error('受付中の例会に取り込んでください。');
  if(event.rosterCount|| (await attendees(id)).length)throw new Error('名簿または回答が既にあります。新しい例会を作成して取り込んでください。');
  // The first insert acts as a transactional guard for simultaneous imports.
  const stamp=crypto.randomUUID(),importedAt=Date.now();
  const inserts=profiles.map((p,i)=>env.DB.prepare(`INSERT INTO meeting_roster(id,event_id,profile,name_key)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)
    AND NOT EXISTS(SELECT 1 FROM meeting_answers WHERE event_id=?)
    AND ${i===0?'NOT EXISTS(SELECT 1 FROM meeting_roster WHERE event_id=?)':'EXISTS(SELECT 1 FROM meeting_roster WHERE id=?)'}`)
    .bind(i===0?stamp:crypto.randomUUID(),id,JSON.stringify(p),normalizedName(p.name),id,importedAt,id,i===0?id:stamp));
  const results=await env.DB.batch(inserts);
  if(results.some(r=>r.meta.changes!==1))throw new Error('名簿を取り込めませんでした。例会の状態を再読み込みしてください。');
}
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
  let answer:Answer;
  let rosterId='';
  if(event.rosterCount) {
    rosterId=typeof body.rosterId==='string'?body.rosterId:'';
    const profile=(await roster(id)).find(p=>p.id===rosterId);
    if(!profile)throw new Error('名簿からご本人を選んでください。');
    const need=typeof body.need==='string'?body.need:'';
    answer=validateAnswer(rosterAnswer(profile,need),true);
  }else {
    if(body.rosterId!==undefined)throw new Error('名簿の準備中です。受付係にお声がけください。');
    answer=validateAnswer(body.answer);
  }
  const token = typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) ? body.token : '';
  if (!token) throw new Error('回答用キーを確認してください。');
  const digest = await hash(token);
  // One answer per receipt; retry safely updates it, but never crosses the deadline or analysis freeze.
  const prior = await env.DB.prepare('SELECT id FROM meeting_answers WHERE event_id=? AND token_hash=?').bind(id,digest).first<{id:string}>();
  if(rosterId) {
    const claim=await env.DB.prepare('SELECT answer_id FROM meeting_roster_claims WHERE roster_id=?').bind(rosterId).first<{answer_id:string}>();
    if(claim&&claim.answer_id!==prior?.id)throw new Error('この方の回答は受け付け済みです。修正は回答した端末で行うか、受付係にご相談ください。');
    if(prior){const ownClaim=await env.DB.prepare('SELECT roster_id FROM meeting_roster_claims WHERE answer_id=?').bind(prior.id).first<{roster_id:string}>();if(ownClaim?.roster_id!==rosterId)throw new Error('回答済みのお名前は変更できません。受付係にご相談ください。');}
  }
  if(rosterId&&!prior) {
    const answerId=crypto.randomUUID();
    try {
      const inserted=await env.DB.batch([
        env.DB.prepare(`INSERT INTO meeting_answers(id,event_id,token_hash,answer,created_at) SELECT ?,?,?,?,?
          WHERE EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)
          AND (SELECT COUNT(*) FROM meeting_answers WHERE event_id=?)<100`)
          .bind(answerId,id,digest,JSON.stringify(answer),Date.now(),id,Date.now(),id),
        env.DB.prepare('INSERT INTO meeting_roster_claims(roster_id,answer_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM meeting_answers WHERE id=?)').bind(rosterId,answerId,answerId),
      ]);
      if(!inserted[0].meta.changes)throw new Error('受付を締め切りました。または上限100人に達しました。');
    }catch(error){if(String(error).includes('UNIQUE'))throw new Error('回答は受け付け済みです。回答した端末で確認してください。');throw error;}
    return;
  }
  const result = prior ? await env.DB.prepare(`UPDATE meeting_answers SET answer=? WHERE id=? AND event_id IN
    (SELECT id FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)`).bind(JSON.stringify(answer),prior.id,id,Date.now()).run()
    : await env.DB.prepare(`INSERT INTO meeting_answers(id,event_id,token_hash,answer,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)
      AND (SELECT COUNT(*) FROM meeting_answers WHERE event_id=?)<100
      AND NOT EXISTS(SELECT 1 FROM meeting_roster WHERE event_id=?)`).bind(crypto.randomUUID(),id,digest,JSON.stringify(answer),Date.now(),id,Date.now(),id,id).run();
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
  const claim=await env.DB.prepare('SELECT roster_id FROM meeting_roster_claims WHERE answer_id=?').bind(row.id).first<{roster_id:string}>();
  return {event,answer:JSON.parse(row.answer) as Answer,rosterId:claim?.roster_id??'',present:row.present,matches};
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
