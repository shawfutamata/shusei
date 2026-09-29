import {meetingVenue,listMeetingVenues} from './meeting-venues';
import {DEFAULT_MEETING_VENUE,MAX_MEETING_TABLES} from '@/app/meeting/venue-types';
import { env } from 'cloudflare:workers';
import { ensureMeetings, importRoster, meeting } from './meetings';
import { parseSchedule, type ScheduledMeeting } from '@/app/meeting/schedule';
import { parseDelimited,prepareRosterRows,validateRoster } from '@/app/meeting/roster';
import {parseLegacyBusiness,legacyBusinessLinks,enrichLegacyBusiness,type LegacyBusiness} from '@/app/meeting/legacy-business';

type Settings={enabled:boolean;minutes:number;tables:number;connection:string};
export type Preparation=ScheduledMeeting & {meetingId:string|null;tables:number;status:string;error:string;};
let ready:Promise<unknown>|undefined;
async function ensure(){await ensureMeetings();await(ready??=env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_automation_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1,minutes INTEGER NOT NULL DEFAULT 15,tables INTEGER NOT NULL DEFAULT 8,connection TEXT NOT NULL DEFAULT '',checked_at INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '')`),
  env.DB.prepare('INSERT OR IGNORE INTO meeting_automation_settings(id) VALUES(1)'),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_preparations(source_key TEXT PRIMARY KEY,schedule TEXT NOT NULL,meeting_id TEXT,tables INTEGER NOT NULL DEFAULT 8,status TEXT NOT NULL DEFAULT 'scheduled',error TEXT NOT NULL DEFAULT '',lock_until INTEGER NOT NULL DEFAULT 0)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_venue_automation(venue_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,minutes INTEGER NOT NULL DEFAULT 15,tables INTEGER NOT NULL DEFAULT 8,connection TEXT NOT NULL DEFAULT '',checked_at INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '')`),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS meeting_qr_settings(meeting_id TEXT PRIMARY KEY,tables INTEGER NOT NULL)'),
]).catch(e=>{ready=undefined;throw e;}));}
function integrationKey(){const key=(env as unknown as {MEETING_CONNECTION_KEY?:string}).MEETING_CONNECTION_KEY;if(!key)throw new Error('接続情報の暗号化設定が必要です。');return crypto.subtle.importKey('raw',Uint8Array.from(atob(key),c=>c.charCodeAt(0)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function seal(text:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await integrationKey(),new TextEncoder().encode(text));return btoa(String.fromCharCode(...iv,...new Uint8Array(data)));}
async function unseal(text:string){const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await integrationKey(),bytes.slice(12)));}
async function settings(venueId=DEFAULT_MEETING_VENUE):Promise<Settings>{await ensure();if(venueId!==DEFAULT_MEETING_VENUE)await env.DB.prepare('INSERT OR IGNORE INTO meeting_venue_automation(venue_id) VALUES(?)').bind(venueId).run();const row=await env.DB.prepare(venueId===DEFAULT_MEETING_VENUE?'SELECT enabled,minutes,tables,connection FROM meeting_automation_settings WHERE id=1':'SELECT enabled,minutes,tables,connection FROM meeting_venue_automation WHERE venue_id=?').bind(...(venueId===DEFAULT_MEETING_VENUE?[]:[venueId])).first<{enabled:number;minutes:number;tables:number;connection:string}>();return {...row!,enabled:!!row!.enabled};}
function settingsUpdate(venueId:string,columns:string){return env.DB.prepare(`UPDATE ${venueId===DEFAULT_MEETING_VENUE?'meeting_automation_settings':'meeting_venue_automation'} SET ${columns} WHERE ${venueId===DEFAULT_MEETING_VENUE?'id=1':'venue_id=?'}`);}
export async function automationStatus(venueId=DEFAULT_MEETING_VENUE){await ensure();const s=await settings(venueId),v=await meetingVenue(venueId);const rows=await env.DB.prepare('SELECT * FROM meeting_preparations WHERE source_key LIKE ? ORDER BY source_key').bind(venueId+':%').all<{source_key:string;schedule:string;meeting_id:string|null;tables:number;status:string;error:string}>();const state=await env.DB.prepare(venueId===DEFAULT_MEETING_VENUE?'SELECT checked_at AS checkedAt,error FROM meeting_automation_settings WHERE id=1':'SELECT checked_at AS checkedAt,error FROM meeting_venue_automation WHERE venue_id=?').bind(...(venueId===DEFAULT_MEETING_VENUE?[]:[venueId])).first();return {venueName:v?.name,website:v?.website,startTime:v?.startTime,enabled:s.enabled,minutes:s.minutes,tables:s.tables,connected:!!s.connection,...state,plans:rows.results.map(r=>({...JSON.parse(r.schedule),meetingId:r.meeting_id,tables:r.tables,status:r.status,error:r.error} as Preparation)).sort((a,b)=>a.startAt-b.startAt)};}
export async function saveAutomation(body:Record<string,unknown>,venueId=DEFAULT_MEETING_VENUE){const s=await settings(venueId),v=await meetingVenue(venueId);if(!v)throw new Error('会場を選んでください。');let connection=s.connection;
 if(typeof body.loginUrl==='string'&&body.loginUrl.trim()){let u:URL;try{u=new URL(body.loginUrl.trim());}catch{throw new Error('簡単ログインURLの形式を確認してください。');}if(!v.legacySlug||u.origin!=='https://www.shuseiclub.jp'||u.pathname!==`/${v.legacySlug}/___STAFF___/onetime.php`||!u.searchParams.get('id')||u.username||u.password)throw new Error('この会場のとみざわ簡単ログインURLを入力してください。');connection=await seal(u.toString());}
 const minutes=Number(body.minutes??s.minutes),tables=Number(body.tables??s.tables);if(!Number.isInteger(minutes)||minutes<0||minutes>180||!Number.isInteger(tables)||tables<1||tables>MAX_MEETING_TABLES)throw new Error('締切とテーブル数を確認してください。');
 await settingsUpdate(venueId,'enabled=?,minutes=?,tables=?,connection=?').bind(body.enabled===false?0:1,minutes,tables,connection,...(venueId===DEFAULT_MEETING_VENUE?[]:[venueId])).run();
}
export async function syncSchedule(now=Date.now(),venueId=DEFAULT_MEETING_VENUE){
 await ensure();try{
  const v=await meetingVenue(venueId);if(!v?.website||!v.legacySlug)throw new Error('会場のホームページURLととみざわ識別子を設定してください。');const response=await fetch(v.website,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('開催日の取得に失敗しました。');
  const plans=parseSchedule(await response.text(),now,v),s=await settings(venueId);
  await env.DB.batch(plans.map(p=>env.DB.prepare(`INSERT INTO meeting_preparations(source_key,schedule,tables) VALUES(?,?,?) ON CONFLICT(source_key) DO UPDATE SET schedule=excluded.schedule WHERE meeting_id IS NULL`).bind(p.key,JSON.stringify(p),s.tables)));
  // Removed or unconfirmed dates cannot silently run from a stale stored schedule.
  const keys=plans.map(p=>p.key);await env.DB.prepare(`UPDATE meeting_preparations SET status='schedule_changed',error='ホームページの開催日を確認してください。' WHERE source_key LIKE ? AND meeting_id IS NULL AND status!='cancelled' AND source_key NOT IN (${keys.map(()=>'?').join(',')})`).bind(venueId+':%',...keys).run();
  await env.DB.prepare("UPDATE meeting_preparations SET status='scheduled',error='' WHERE status='schedule_changed' AND source_key IN ("+keys.map(()=>'?').join(',')+")").bind(...keys).run();
  await settingsUpdate(venueId,"checked_at=?,error=''").bind(now,...(venueId===DEFAULT_MEETING_VENUE?[]:[venueId])).run();return plans;
 }catch(e){await settingsUpdate(venueId,'error=?').bind(e instanceof Error?e.message:'開催日を取得できませんでした。',...(venueId===DEFAULT_MEETING_VENUE?[]:[venueId])).run();throw e;}
}
// A fresh session for each run. Never stores browser cookies or logs login URLs.
async function legacyRoster(sourceId:string,connection:string,legacySlug:string){
  const base='https://www.shuseiclub.jp';let cookie='';
  async function get(url:string,filter?:number){for(let i=0;i<8;i++){
    const u=new URL(url);if(u.origin!==base||!u.pathname.startsWith(`/${legacySlug}/___STAFF___/`))throw new Error('名簿取得先を確認できません。');
    const response=await fetch(url,{redirect:'manual',method:filter?'POST':'GET',body:filter?new URLSearchParams({sel_key:String(filter)}):undefined,headers:{...(cookie?{Cookie:cookie}:{}),...(filter?{'Content-Type':'application/x-www-form-urlencoded'}:{})},signal:AbortSignal.timeout(20000)});
    const set=response.headers.getSetCookie();if(set.length){const jar=new Map(cookie.split('; ').filter(Boolean).map(c=>[c.split('=')[0],c]));for(const c of set){const value=c.split(';')[0];jar.set(value.split('=')[0],value);}cookie=[...jar.values()].join('; ');}
    if(response.status>=300&&response.status<400&&response.headers.get('location')){url=new URL(response.headers.get('location')!,url).href;filter=undefined;continue;}
    if(!response.ok)throw new Error('名簿取得に失敗しました。再接続してください。');return response;
  }throw new Error('とみざわシステムへの接続を確認してください。');}
  await get(await unseal(connection));
  const info=await(await get(base+`/${legacySlug}/___STAFF___/list/set_info.php?id=`+sourceId)).text();
  if(!info.includes('list_download-MS.php'))throw new Error('とみざわシステムで名簿が未作成、またはログインURLが無効です。名簿作成後に再実行してください。');
  const plain=info.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');const match=plain.match(/最終名簿テーブル数\s*(\d+)/);if(!match)throw new Error('名簿のテーブル数を確認できません。');
  const tables=Number(match[1]);if(tables<1||tables>MAX_MEETING_TABLES)throw new Error('テーブル数を確認してください。');
  const file=await get(base+`/${legacySlug}/___STAFF___/list/list_download-MS.php?id=`+sourceId+'&cd=U');
  const prepared=prepareRosterRows(parseDelimited(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())));
  if(prepared.format!=='meeting-export')throw new Error('まちださがみ形式の名簿を確認できません。');
  const profiles=validateRoster(prepared.rows.slice(1).map(r=>({name:r[7],company:r[5],table:'',industry:'',services:r[8],area:''})));
  const links=new Set<string>();
  for(const category of [1,2,3]){
    const html=await(await get(base+`/${legacySlug}/___STAFF___/member/index.php`,category)).text();
    if(!html.includes('会員一覧'))throw new Error('会員一覧の取得に失敗しました。再接続してください。');
    for(const link of legacyBusinessLinks(html,profiles.map(p=>p.name),legacySlug))links.add(link);
  }
  const details:LegacyBusiness[]=[];
  for(const link of links)details.push(parseLegacyBusiness(await(await get(link)).text()));
  return {profiles:validateRoster(profiles.map(p=>enrichLegacyBusiness(p,details))),tables};
}
export async function prepareScheduled(key:string,force=false,now=Date.now(),venueId=key.split(':')[0]){
 if(!key.startsWith(venueId+':'))throw new Error('会場の開催日を選んでください。');const v=await meetingVenue(venueId);if(!v?.enabled)throw new Error('利用できる会場を選んでください。');const s=await settings(venueId);const row=await env.DB.prepare('SELECT schedule,meeting_id,status FROM meeting_preparations WHERE source_key=?').bind(key).first<{schedule:string;meeting_id:string|null;status:string}>();if(!row)throw new Error('開催日を選んでください。');
 const p=JSON.parse(row.schedule) as ScheduledMeeting;if(row.status==='cancelled'){if(force)throw new Error('この例会は削除済みです。必要な場合は新しい例会を作成してください。');return;}if(row.status==='schedule_changed')throw new Error('開催日を再確認してください。');if(!force&&(!s.enabled||p.prepareAt>now||p.startAt<=now))return;
 const lock=await env.DB.prepare("UPDATE meeting_preparations SET lock_until=? WHERE source_key=? AND lock_until<? AND status!='cancelled'").bind(now+300000,key,now).run();if(!lock.meta.changes)return;
 try{
  // Re-read the mapping under the lock: concurrent retries must reuse the saved random URL.
  const current=await env.DB.prepare('SELECT meeting_id FROM meeting_preparations WHERE source_key=?').bind(key).first<{meeting_id:string|null}>();
  const id=current?.meeting_id??crypto.randomUUID();
  await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO meeting_events(id,title,venue,closes_at,state,created_at) VALUES(?,?,?,?,'open',?)").bind(id,p.title,v.name,p.startAt+s.minutes*60000,now),env.DB.prepare('INSERT OR IGNORE INTO meeting_event_venues(event_id,venue_id) VALUES(?,?)').bind(id,venueId),env.DB.prepare("UPDATE meeting_preparations SET meeting_id=?,status='roster_pending',error='' WHERE source_key=?").bind(id,key),env.DB.prepare('INSERT OR IGNORE INTO meeting_qr_settings(meeting_id,tables) VALUES(?,?)').bind(id,s.tables)]);
  const event=await meeting(id);if(!event)throw new Error('アンケートを確認できません。');
  if(!event.rosterCount){if(!s.connection)throw new Error('とみざわシステムの簡単ログインURLを接続してください。');const data=await legacyRoster(p.sourceId,s.connection,v.legacySlug);await importRoster(id,data.profiles,true);await env.DB.batch([env.DB.prepare('UPDATE meeting_qr_settings SET tables=? WHERE meeting_id=?').bind(data.tables,id),env.DB.prepare('UPDATE meeting_preparations SET tables=? WHERE source_key=?').bind(data.tables,key)]);}
  await env.DB.prepare("UPDATE meeting_preparations SET status='ready',error='' WHERE source_key=?").bind(key).run();
 }catch(e){await env.DB.prepare("UPDATE meeting_preparations SET status='roster_pending',error=? WHERE source_key=?").bind(e instanceof Error?e.message:'準備できませんでした。',key).run();}
 finally{await env.DB.prepare('UPDATE meeting_preparations SET lock_until=0 WHERE source_key=?').bind(key).run();}
}
export async function runMeetingAutomation(now=Date.now()){const venues=await listMeetingVenues();for(const v of venues){if(!v.enabled||!(await settings(v.id)).enabled)continue;try{const plans=await syncSchedule(now,v.id);for(const p of plans)await prepareScheduled(p.key,false,now,v.id);}catch{/* The venue-specific error is recorded. Other venues must still run. */}}}
export async function qrTableCount(id:string){await ensure();return (await env.DB.prepare('SELECT tables FROM meeting_qr_settings WHERE meeting_id=?').bind(id).first<{tables:number}>())?.tables??(await settings((await meeting(id))?.venueId||DEFAULT_MEETING_VENUE)).tables;}
export async function setQrTableCount(id:string,count:unknown){await ensure();const n=Number(count);if(!Number.isInteger(n)||n<1||n>MAX_MEETING_TABLES)throw new Error('テーブル数は1〜60にしてください。');await env.DB.prepare('INSERT INTO meeting_qr_settings(meeting_id,tables) VALUES(?,?) ON CONFLICT(meeting_id) DO UPDATE SET tables=excluded.tables').bind(id,n).run();}

export {ensure as ensureMeetingAutomation};
