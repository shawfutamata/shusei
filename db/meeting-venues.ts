import {env} from 'cloudflare:workers';
import {ensureMeetings} from './meetings';
import {DEFAULT_MEETING_VENUE,type MeetingVenue,type MeetingOperator} from '@/app/meeting/venue-types';
const select="SELECT id,name,website,legacy_slug AS legacySlug,start_time AS startTime,enabled,created_at AS createdAt FROM meeting_venues";
export async function listMeetingVenues(email?:string):Promise<MeetingVenue[]>{await ensureMeetings();const rows=await env.DB.prepare(select+(email?' WHERE id IN (SELECT venue_id FROM meeting_operators WHERE email=?)':'')+' ORDER BY created_at,id').bind(...(email?[email.trim().toLowerCase()]:[])).all<MeetingVenue>();return rows.results.map(v=>({...v,enabled:!!v.enabled}));}
export async function meetingVenue(id=DEFAULT_MEETING_VENUE){await ensureMeetings();const row=await env.DB.prepare(select+' WHERE id=?').bind(id).first<MeetingVenue>();return row?{...row,enabled:!!row.enabled}:null;}
export async function meetingOperators(venueId:string):Promise<MeetingOperator[]>{await ensureMeetings();return(await env.DB.prepare('SELECT email,venue_id AS venueId,created_at AS createdAt FROM meeting_operators WHERE venue_id=? ORDER BY email').bind(venueId).all<MeetingOperator>()).results;}
export function venueInput(body:Record<string,unknown>){
 const name=typeof body.name==='string'?body.name.trim():'',website=typeof body.website==='string'?body.website.trim():'',legacySlug=typeof body.legacySlug==='string'?body.legacySlug.trim():'',startTime=typeof body.startTime==='string'?body.startTime:'11:30';
 if(!name||name.length>120)throw new Error('会場名を120文字以内で入力してください。');
 if(legacySlug&&!/^[a-z0-9_-]{1,60}$/.test(legacySlug))throw new Error('とみざわの会場識別子を確認してください。');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))throw new Error('開始時刻を確認してください。');
 if(website){let u:URL;try{u=new URL(website);}catch{throw new Error('ホームページURLを確認してください。');}if(u.protocol!=='https:'||u.username||u.password||u.port||!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||website.length>500)throw new Error('公開ホームページのhttps URLを入力してください。');}
 return {name,website,legacySlug,startTime};
}
export async function saveMeetingVenue(body:Record<string,unknown>){await ensureMeetings();const v=venueInput(body),id=typeof body.id==='string'&&body.id?body.id:crypto.randomUUID();
 if(body.id){if(!await meetingVenue(id))throw new Error('会場が見つかりません。');await env.DB.prepare('UPDATE meeting_venues SET name=?,website=?,legacy_slug=?,start_time=? WHERE id=?').bind(v.name,v.website,v.legacySlug,v.startTime,id).run();}
 else await env.DB.prepare('INSERT INTO meeting_venues(id,name,website,legacy_slug,start_time,created_at) VALUES(?,?,?,?,?,?)').bind(id,v.name,v.website,v.legacySlug,v.startTime,Date.now()).run();return id;
}
export async function setMeetingOperator(venueId:string,email:unknown,enabled:unknown){await ensureMeetings();if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email.trim())||email.length>254||typeof enabled!=='boolean')throw new Error('担当者のメールアドレスを確認してください。');if(!await meetingVenue(venueId))throw new Error('会場が見つかりません。');
 const normalized=email.trim().toLowerCase();if(enabled)await env.DB.prepare('INSERT OR IGNORE INTO meeting_operators(email,venue_id,created_at) VALUES(?,?,?)').bind(normalized,venueId,Date.now()).run();else await env.DB.prepare('DELETE FROM meeting_operators WHERE email=? AND venue_id=?').bind(normalized,venueId).run();
}
export async function canManageMeetingVenue(email:string,venueId:string,platform=false){if(platform)return !!await meetingVenue(venueId);return (await listMeetingVenues(email)).some(v=>v.id===venueId&&v.enabled);}
