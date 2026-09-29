import { matchAttendee } from '@/app/meeting/matching';
import { env } from 'cloudflare:workers';
import { validateAnswer, type Answer, type Attendee, type Candidate, type Meeting, type RosterPerson } from '@/app/meeting/types';
import { DEFAULT_MEETING_VENUE,MAX_MEETING_PEOPLE } from '@/app/meeting/venue-types';
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
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_venues(id TEXT PRIMARY KEY,name TEXT NOT NULL,website TEXT NOT NULL DEFAULT '',legacy_slug TEXT NOT NULL DEFAULT '',start_time TEXT NOT NULL DEFAULT '11:30',enabled INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL)`),
    env.DB.prepare("INSERT OR IGNORE INTO meeting_venues(id,name,website,legacy_slug,created_at) VALUES('hirunomeguro','ひるのめぐろ','https://colourjam.wixstudio.com/hirumeguro','hirunomeguro',0)"),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_event_venues(event_id TEXT PRIMARY KEY,venue_id TEXT NOT NULL REFERENCES meeting_venues(id))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS meeting_event_venue_index ON meeting_event_venues(venue_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_operators(email TEXT NOT NULL,venue_id TEXT NOT NULL REFERENCES meeting_venues(id),created_at INTEGER NOT NULL,PRIMARY KEY(email,venue_id))'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_trash(event_id TEXT PRIMARY KEY,venue_id TEXT NOT NULL,previous_state TEXT NOT NULL,deleted_at INTEGER NOT NULL,preparations TEXT NOT NULL DEFAULT '[]')`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS meeting_trash_venue ON meeting_trash(venue_id,deleted_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS meeting_answers_event ON meeting_answers(event_id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_member_links (event_id TEXT NOT NULL,member_id TEXT NOT NULL,roster_id TEXT NOT NULL DEFAULT '',profile TEXT NOT NULL,walk_in INTEGER NOT NULL DEFAULT 0,answer_id TEXT NOT NULL DEFAULT '',PRIMARY KEY(event_id,member_id))`),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS meeting_link_roster ON meeting_member_links(event_id,roster_id) WHERE roster_id!=''"),
    env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS meeting_link_answer ON meeting_member_links(answer_id) WHERE answer_id!=''"),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_wish_shares (answer_id TEXT PRIMARY KEY,shared INTEGER NOT NULL DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_submit_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_roster (id TEXT PRIMARY KEY,event_id TEXT NOT NULL,profile TEXT NOT NULL,name_key TEXT NOT NULL)`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS meeting_roster_event ON meeting_roster(event_id)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_roster_claims (roster_id TEXT PRIMARY KEY,answer_id TEXT NOT NULL UNIQUE)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_guest_claims (event_id TEXT NOT NULL,identity_key TEXT NOT NULL,answer_id TEXT NOT NULL UNIQUE,PRIMARY KEY(event_id,identity_key))'),
  ]).catch(error => { ready = undefined; throw error; });
}
const selectEvent = `SELECT id,title,venue,COALESCE((SELECT venue_id FROM meeting_event_venues WHERE event_id=meeting_events.id),'hirunomeguro') AS venueId,closes_at AS closesAt,state,created_at AS createdAt,(SELECT COUNT(*) FROM meeting_roster WHERE event_id=meeting_events.id) AS rosterCount FROM meeting_events`;
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
// The participant selector exposes names and companies only, while受付 is open.
export async function rosterOptions(id:string,registration=false) {
  const event=await meeting(id);
  if(!event||(!registration&&(event.state!=='open'||event.closesAt<=Date.now())))return [];
  return (await roster(id)).map(p=>({id:p.id,name:p.name,company:p.company}));
}
export async function selectedRoster(id:string,personId:string,registration=false) {
  const event=await meeting(id);
  if(!event||(!registration&&(event.state!=='open'||event.closesAt<=Date.now())))return null;
  return (await roster(id)).find(p=>p.id===personId)??null;
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
  return env.DB.prepare(`${selectEvent} WHERE id=? AND state NOT IN ('trashed','deleting')`).bind(id).first<Meeting>();
}
export async function attendees(id: string): Promise<Attendee[]> {
  await ensureMeetings();
  const rows = await env.DB.prepare('SELECT id,answer,present,analyzed,candidates,EXISTS(SELECT 1 FROM meeting_guest_claims WHERE answer_id=meeting_answers.id) AS walkIn FROM meeting_answers WHERE event_id=? ORDER BY created_at,id').bind(id)
    .all<{id:string;answer:string;present:number;analyzed:number;candidates:string;walkIn:number}>();
  return rows.results.map(row => ({...JSON.parse(row.answer) as Answer,id:row.id,present:row.present,analyzed:row.analyzed,candidates:JSON.parse(row.candidates) as Candidate[],walkIn:!!row.walkIn}));
}
export async function listMeetings(venueId?:string) {
  await ensureMeetings();
  return (await env.DB.prepare(`${selectEvent} WHERE state NOT IN ('trashed','deleting')${venueId?" AND COALESCE((SELECT venue_id FROM meeting_event_venues WHERE event_id=meeting_events.id),'hirunomeguro')=?":""} ORDER BY created_at DESC LIMIT 100`).bind(...(venueId?[venueId]:[])).all<Meeting>()).results;
}
export type MeetingSummary = Meeting & { answerCount:number; presentCount:number; registeredCount:number; matchedCount:number; analyzedCount:number; needCount:number };
export async function adminMeetingSummaries(venueId?:string):Promise<MeetingSummary[]> {
  await ensureMeetings();
  return (await env.DB.prepare(`${selectEvent.replace(' FROM meeting_events','')},
    (SELECT COUNT(*) FROM meeting_answers WHERE event_id=meeting_events.id) AS answerCount,
    (SELECT COUNT(*) FROM meeting_answers WHERE event_id=meeting_events.id AND present=1) AS presentCount,
    (SELECT COUNT(*) FROM meeting_member_links WHERE event_id=meeting_events.id) AS registeredCount,
    (SELECT COUNT(*) FROM meeting_answers WHERE event_id=meeting_events.id AND present=1 AND analyzed=1 AND json_array_length(candidates)>0) AS matchedCount,
    (SELECT COUNT(*) FROM meeting_answers WHERE event_id=meeting_events.id AND present=1 AND analyzed=1) AS analyzedCount,
    (SELECT COUNT(*) FROM meeting_answers WHERE event_id=meeting_events.id AND present=1 AND length(trim(json_extract(answer,'$.need')))>0) AS needCount
    FROM meeting_events WHERE state NOT IN ('trashed','deleting')${venueId?" AND COALESCE((SELECT venue_id FROM meeting_event_venues WHERE event_id=meeting_events.id),'hirunomeguro')=?":""} ORDER BY created_at DESC`).bind(...(venueId?[venueId]:[])).all<MeetingSummary>()).results;
}
export async function createMeeting(body: Record<string,unknown>, venueId=DEFAULT_MEETING_VENUE) {
  await ensureMeetings();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
  const closesAt = Number(body.closesAt);
  if (!title || !venue || title.length>120 || venue.length>120 || !Number.isFinite(closesAt) || closesAt <= Date.now() || closesAt > Date.now()+90*86400000) throw new Error('例会名・会場と、90日以内の未来の締切時刻を入力してください。');
  const id = crypto.randomUUID();
  const configured=await env.DB.prepare('SELECT id FROM meeting_venues WHERE id=? AND enabled=1').bind(venueId).first();if(!configured)throw new Error('利用できる会場を選んでください。');
  await env.DB.batch([env.DB.prepare('INSERT INTO meeting_events(id,title,venue,closes_at,created_at) VALUES(?,?,?,?,?)').bind(id,title,venue,closesAt,Date.now()),env.DB.prepare('INSERT INTO meeting_event_venues(event_id,venue_id) VALUES(?,?)').bind(id,venueId)]);
  return id;
}
async function hash(token:string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function setMeetingDeadline(id:string,value:unknown) {
  await ensureMeetings();
  const closesAt=typeof value==='number'?value:NaN;
  if(!Number.isSafeInteger(closesAt)||closesAt<=0||closesAt>Date.now()+90*86400000)throw new Error('90日以内の締切日時を指定してください。');
  // A past time intentionally closes reception. Analysis/publication cannot be
  // reopened by moving the deadline; frozen answers must remain frozen.
  const result=await env.DB.prepare("UPDATE meeting_events SET closes_at=? WHERE id=? AND state='open'").bind(closesAt,id).run();
  if(result.meta.changes!==1)throw new Error('集計を始めた例会の締切は変更できません。');
}
export async function submitAnswer(id:string,body:Record<string,unknown>,memberId?:string) {
  await ensureMeetings();
  const linked=memberId?await env.DB.prepare('SELECT roster_id AS rosterId,profile,walk_in AS walkIn,answer_id AS answerId FROM meeting_member_links WHERE event_id=? AND member_id=?').bind(id,memberId).first<{rosterId:string;profile:string;walkIn:number;answerId:string}>():null;
  if(memberId&&!linked)throw new Error('先にご自身の会社情報を確認してください。');
  if(linked){
    if(typeof body.rosterId==='string'&&body.rosterId!==linked.rosterId)throw new Error('登録したご本人のお名前で回答してください。');
    const saved=JSON.parse(linked.profile);
    const need=typeof body.need==='string'?body.need:typeof (body.answer as Record<string,unknown>)?.need==='string'?(body.answer as Record<string,unknown>).need:'';
    body={...body,rosterId:linked.rosterId||undefined,walkIn:linked.walkIn===1,answer:{...saved,need},need};

  }
  const event = await meeting(id);
  if (!event) throw new Error('アンケートが見つかりません。');
  if (body.consent !== true) throw new Error('回答内容の利用への同意が必要です。');
  if (body.website) throw new Error('送信できませんでした。');
  let answer:Answer;
  let rosterId='';
  const walkIn=body.walkIn===true;
  let identity='';
  if(walkIn) {
    if(body.rosterId)throw new Error('参加方法を選び直してください。');
    const raw=body.answer as Record<string,unknown>|undefined;
    if(!raw||typeof raw!=='object')throw new Error('お名前・会社名・事業内容を入力してください。');
    answer=validateAnswer(rosterAnswer({name:typeof raw.name==='string'?raw.name:'',company:typeof raw.company==='string'?raw.company:'',services:typeof raw.services==='string'?raw.services:'',industry:linked?String(raw.industry||''):'',table:'',area:linked?String(raw.area||''):''},typeof raw.need==='string'?raw.need:''),true);
    if(answer.services.length<2)throw new Error('できる仕事・事業内容をひと言入力してください。');
    identity=normalizedName(answer.name)+'|'+normalizedName(answer.company);
    if((await roster(id)).some(p=>normalizedName(p.name)+'|'+normalizedName(p.company)===identity))throw new Error('名簿にお名前があります。名簿から選んでください。');
  } else if(event.rosterCount) {
    rosterId=typeof body.rosterId==='string'?body.rosterId:'';
    const profile=(await roster(id)).find(p=>p.id===rosterId);
    if(!profile)throw new Error('名簿からご本人を選んでください。');
    const need=typeof body.need==='string'?body.need:'';
    answer=validateAnswer(rosterAnswer(linked?{...profile,...JSON.parse(linked.profile)}:profile,need),true);
  }else {
    if(body.rosterId!==undefined)throw new Error('名簿の準備中です。受付係にお声がけください。');
    answer=validateAnswer(body.answer);
  }
  const token = typeof body.token === 'string' && /^[a-f0-9]{64}$/.test(body.token) ? body.token : '';
  if (!token) throw new Error('回答用キーを確認してください。');
  const storedHash=linked?.answerId?await env.DB.prepare('SELECT token_hash FROM meeting_answers WHERE id=? AND event_id=?').bind(linked.answerId,id).first<{token_hash:string}>():null;
  const digest = storedHash?.token_hash || await hash(token);
  // One answer per receipt; retry safely updates it, but never crosses the deadline or analysis freeze.
  const prior = await env.DB.prepare('SELECT id FROM meeting_answers WHERE event_id=? AND token_hash=?').bind(id,digest).first<{id:string}>();
  if(!walkIn&&!rosterId&&prior&&await env.DB.prepare('SELECT answer_id FROM meeting_guest_claims WHERE answer_id=?').bind(prior.id).first())throw new Error('回答済みの参加方法は変更できません。');
  if(walkIn) {
    const claim=await env.DB.prepare('SELECT answer_id FROM meeting_guest_claims WHERE event_id=? AND identity_key=?').bind(id,identity).first<{answer_id:string}>();
    if(claim&&claim.answer_id!==prior?.id)throw new Error('このお名前・会社名の回答は受け付け済みです。回答した端末でご確認ください。');
    if(prior) {
      const ownClaim=await env.DB.prepare('SELECT identity_key FROM meeting_guest_claims WHERE event_id=? AND answer_id=?').bind(id,prior.id).first<{identity_key:string}>();
      if(ownClaim?.identity_key!==identity)throw new Error('回答済みのお名前・参加方法は変更できません。受付係にご相談ください。');
    } else {
      const answerId=crypto.randomUUID(),submittedAt=Date.now();
      try {
        const inserted=await env.DB.batch([
          env.DB.prepare(`INSERT INTO meeting_answers(id,event_id,token_hash,answer,created_at) SELECT ?,?,?,?,?
            WHERE EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)
            AND (SELECT COUNT(*) FROM meeting_answers WHERE event_id=?)<${MAX_MEETING_PEOPLE}
            AND NOT EXISTS(SELECT 1 FROM meeting_roster WHERE event_id=? AND name_key=? AND json_extract(profile,'$.company')=?)`)
            .bind(answerId,id,digest,JSON.stringify(answer),submittedAt,id,submittedAt,id,id,normalizedName(answer.name),answer.company),
          env.DB.prepare('INSERT INTO meeting_guest_claims(event_id,identity_key,answer_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM meeting_answers WHERE id=?)').bind(id,identity,answerId,answerId),
        ]);
        if(!inserted[0].meta.changes)throw new Error('締切・人数上限・名簿を確認してください。');
      }catch(error){if(String(error).includes('UNIQUE'))throw new Error('回答は受け付け済みです。回答した端末でご確認ください。');throw error;}
      return;
    }
  }
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
          AND (SELECT COUNT(*) FROM meeting_answers WHERE event_id=?)<${MAX_MEETING_PEOPLE}`)
          .bind(answerId,id,digest,JSON.stringify(answer),Date.now(),id,Date.now(),id),
        env.DB.prepare('INSERT INTO meeting_roster_claims(roster_id,answer_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM meeting_answers WHERE id=?)').bind(rosterId,answerId,answerId),
      ]);
      if(!inserted[0].meta.changes)throw new Error('受付を締め切りました。または上限300人に達しました。');
    }catch(error){if(String(error).includes('UNIQUE'))throw new Error('回答は受け付け済みです。回答した端末で確認してください。');throw error;}
    return;
  }
  const result = prior ? await env.DB.prepare(`UPDATE meeting_answers SET answer=? WHERE id=? AND event_id IN
    (SELECT id FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)`).bind(JSON.stringify(answer),prior.id,id,Date.now()).run()
    : await env.DB.prepare(`INSERT INTO meeting_answers(id,event_id,token_hash,answer,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='open' AND closes_at>?)
      AND (SELECT COUNT(*) FROM meeting_answers WHERE event_id=?)<${MAX_MEETING_PEOPLE}
      AND NOT EXISTS(SELECT 1 FROM meeting_roster WHERE event_id=?)`).bind(crypto.randomUUID(),id,digest,JSON.stringify(answer),Date.now(),id,Date.now(),id,id).run();
  if (!result.meta.changes) throw new Error('受付を締め切りました。または上限300人に達しました。受付係にお声がけください。');
}
export async function ownResult(id:string,token:string,memberId?:string) {
  const event = await meeting(id);
  if (!event) return null;
  const owned=memberId?await env.DB.prepare('SELECT answer_id FROM meeting_member_links WHERE event_id=? AND member_id=?').bind(id,memberId).first<{answer_id:string}>():null;
  const row = owned?.answer_id?await env.DB.prepare('SELECT id,answer,present,candidates FROM meeting_answers WHERE event_id=? AND id=?').bind(id,owned.answer_id).first<{id:string;answer:string;present:number;candidates:string}>():await env.DB.prepare('SELECT id,answer,present,candidates FROM meeting_answers WHERE event_id=? AND token_hash=?').bind(id,await hash(token)).first<{id:string;answer:string;present:number;candidates:string}>();
  if (!row) return null;
  if(memberId){
    const link=await env.DB.prepare('SELECT roster_id AS rosterId,answer_id AS answerId,profile FROM meeting_member_links WHERE event_id=? AND member_id=?').bind(id,memberId).first<{rosterId:string;answerId:string;profile:string}>();
    if(!link)return null;
    if(link.answerId&&link.answerId!==row.id)return null;
    if(!link.answerId){
      const claim=await env.DB.prepare('SELECT roster_id FROM meeting_roster_claims WHERE answer_id=?').bind(row.id).first<{roster_id:string}>();
      const answer=JSON.parse(row.answer),profile=JSON.parse(link.profile);
      if(claim?claim.roster_id!==link.rosterId:normalizedName(answer.name)!==normalizedName(profile.name)||normalizedName(answer.company)!==normalizedName(profile.company))return null;
      const saved=await env.DB.prepare("UPDATE meeting_member_links SET answer_id=? WHERE event_id=? AND member_id=? AND answer_id='' ").bind(row.id,id,memberId).run();
      if(!saved.meta.changes)return null;
      if(row.present===1)await (await import('./meeting-accounts')).activateMeetingMember(memberId,id);
    }
  }
  const people = event.state === 'published' ? await attendees(id) : [];
  const matches = event.state === 'published' && row.present === 1 ? (JSON.parse(row.candidates) as Candidate[]).flatMap(c=> {
    const p = people.find(p=>p.id===c.id && p.present === 1);
    return p ? [{...c,name:p.name,company:p.company,table:p.table,industry:p.industry}] : [];
  }) : [];
  const claim=await env.DB.prepare('SELECT roster_id FROM meeting_roster_claims WHERE answer_id=?').bind(row.id).first<{roster_id:string}>();
  const guest=await env.DB.prepare('SELECT answer_id FROM meeting_guest_claims WHERE event_id=? AND answer_id=?').bind(id,row.id).first();
  const share=await env.DB.prepare('SELECT shared FROM meeting_wish_shares WHERE answer_id=?').bind(row.id).first<{shared:number}>();
  return {event,shareWish:share?.shared===1,answer:JSON.parse(row.answer) as Answer,rosterId:claim?.roster_id??'',walkIn:!!guest,present:row.present,matches};
}
export async function confirmAttendance(id:string,personId:string,present:boolean) {
  const result = await env.DB.prepare(`UPDATE meeting_answers SET present=? WHERE event_id=? AND id=? AND EXISTS
    (SELECT 1 FROM meeting_events WHERE id=? AND state='open')`).bind(present?1:0,id,personId,id).run();
  if (!result.meta.changes) throw new Error('集計開始後は出席者を変更できません。');
  if(present){const link=await env.DB.prepare('SELECT member_id FROM meeting_member_links WHERE event_id=? AND answer_id=?').bind(id,personId).first<{member_id:string}>();if(link)await (await import('./meeting-accounts')).activateMeetingMember(link.member_id,id);}
}

// Read persisted completions while an AI batch is still running.
export async function meetingAnalysisProgress(id:string) {
  await ensureMeetings();
  const row=await env.DB.prepare(`SELECT e.state,e.lock_until,
    (SELECT COUNT(*) FROM meeting_answers a WHERE a.event_id=e.id AND a.present=1) AS total,
    (SELECT COUNT(*) FROM meeting_answers a WHERE a.event_id=e.id AND a.present=1 AND a.analyzed=1) AS completed
    FROM meeting_events e WHERE e.id=? AND e.state IN ('open','analyzing','review','published')`)
    .bind(id).first<{state:Meeting['state'];lock_until:number;total:number;completed:number}>();
  if(!row)throw new Error('例会が見つかりません。');
  return {state:row.state,total:row.total,completed:row.completed,active:row.state==='analyzing'&&row.lock_until>Date.now()};
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

export async function checkSubmissionLimit(eventId:string,ip:string,kind:'read'|'submit'='submit') {
  await ensureMeetings();
  const bucket=Math.floor(Date.now()/600000);
  const key=await hash(eventId+':'+kind+':'+ip+':'+bucket);
  const row=await env.DB.prepare(`INSERT INTO meeting_submit_limits(id,count,expires) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count`).bind(key,(bucket+1)*600000).first<{count:number}>();
  await env.DB.prepare('DELETE FROM meeting_submit_limits WHERE expires<?').bind(Date.now()-600000).run();
  // Shared venue Wi-Fi can serve every attendee. No raw IP address is retained.
  return !!row && row.count<=(kind==='read'?MAX_MEETING_PEOPLE*60:MAX_MEETING_PEOPLE*4);
}

export async function setWishSharing(id:string,token:string,shared:boolean,memberId?:string) {
  if((!memberId&&!/^[a-f0-9]{64}$/.test(token))||typeof shared!=='boolean')throw new Error('回答用キーと掲載設定を確認してください。');
  await ensureMeetings();
  const row=memberId?await env.DB.prepare('SELECT a.id FROM meeting_answers a JOIN meeting_member_links l ON l.answer_id=a.id WHERE a.event_id=? AND l.event_id=? AND l.member_id=?').bind(id,id,memberId).first<{id:string}>():await env.DB.prepare('SELECT id FROM meeting_answers WHERE event_id=? AND token_hash=?').bind(id,await hash(token)).first<{id:string}>();
  if(!row)throw new Error('回答が見つかりません。');
  await env.DB.prepare('INSERT INTO meeting_wish_shares (answer_id,shared) VALUES (?,?) ON CONFLICT(answer_id) DO UPDATE SET shared=excluded.shared').bind(row.id,shared?1:0).run();
}
export async function wishBoard(id:string,token:string,memberId?:string) {
  if(!memberId&&!/^[a-f0-9]{64}$/.test(token))throw new Error('回答した端末で、結果ページから開いてください。');
  const event=await meeting(id);
  const own=memberId?await env.DB.prepare('SELECT a.id,a.present FROM meeting_answers a JOIN meeting_member_links l ON l.answer_id=a.id WHERE a.event_id=? AND l.event_id=? AND l.member_id=?').bind(id,id,memberId).first<{id:string;present:number}>():await env.DB.prepare('SELECT id,present FROM meeting_answers WHERE event_id=? AND token_hash=?').bind(id,await hash(token)).first<{id:string;present:number}>();
  if(!event||!own)throw new Error('回答した端末で、結果ページから開いてください。');
  if(event.state!=='published')throw new Error('結果の公開後に見られます。');
  if(own.present!==1)throw new Error('受付係に出席確認をお願いしてください。');
  const rows=await env.DB.prepare(`SELECT a.id,a.answer FROM meeting_answers a JOIN meeting_wish_shares s ON s.answer_id=a.id
    WHERE a.event_id=? AND a.present=1 AND s.shared=1 AND a.id<>? ORDER BY a.created_at,a.id`).bind(id,own.id).all<{id:string;answer:string}>();
  return {people:rows.results.flatMap(row=>{const a=JSON.parse(row.answer) as Answer;return a.need.trim()?[{id:row.id,name:a.name,company:a.company,need:a.need}]:[];})};
}
