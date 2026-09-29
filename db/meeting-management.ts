import { env } from 'cloudflare:workers';
import { ensureMeetings,meeting } from './meetings';
import { ensureMeetingAutomation } from './meeting-automation';

export async function updateMeeting(id:string,body:Record<string,unknown>) {
 await ensureMeetings();
 const title=typeof body.title==='string'?body.title.trim():'',venue=typeof body.venue==='string'?body.venue.trim():'';
 if(!title||!venue||title.length>120||venue.length>120)throw new Error('例会名と会場を120文字以内で入力してください。');
 const closesAt=body.closesAt===undefined?null:body.closesAt;
 if(closesAt!==null&&(typeof closesAt!=='number'||!Number.isSafeInteger(closesAt)||closesAt<=0||closesAt>Date.now()+90*86400000))throw new Error('90日以内の締切日時を指定してください。');
 // A deadline change must not reopen frozen responses, including a concurrent analysis start.
 const result=await env.DB.prepare("UPDATE meeting_events SET title=?,venue=?,closes_at=COALESCE(?,closes_at) WHERE id=? AND state NOT IN ('trashed','deleting') AND (? IS NULL OR state='open')").bind(title,venue,closesAt,id,closesAt).run();
 if(result.meta.changes!==1)throw new Error('イベントが見つからないか、集計が始まっています。再読み込みしてください。');
}


export type TrashedMeeting={id:string;title:string;venue:string;venueId:string;closesAt:number;deletedAt:number;previousState:string;rosterCount:number;answerCount:number};
export async function meetingTrash(venueId:string):Promise<TrashedMeeting[]>{
 await ensureMeetings();return(await env.DB.prepare(`SELECT e.id,e.title,e.venue,t.venue_id AS venueId,e.closes_at AS closesAt,t.deleted_at AS deletedAt,t.previous_state AS previousState,
 (SELECT COUNT(*) FROM meeting_roster WHERE event_id=e.id) AS rosterCount,(SELECT COUNT(*) FROM meeting_answers WHERE event_id=e.id) AS answerCount
 FROM meeting_trash t JOIN meeting_events e ON e.id=t.event_id WHERE t.venue_id=? AND e.state='trashed' ORDER BY t.deleted_at DESC,e.id`).bind(venueId).all<TrashedMeeting>()).results;
}
export async function trashedMeeting(id:string){await ensureMeetings();const row=await env.DB.prepare('SELECT venue_id FROM meeting_trash WHERE event_id=?').bind(id).first<{venue_id:string}>();return row?(await meetingTrash(row.venue_id)).find(e=>e.id===id)??null:null;}
export async function deleteMeeting(id:string,confirmation:unknown) {
 await ensureMeetingAutomation();const event=await meeting(id);if(!event)throw new Error('イベントが見つかりません。');if(confirmation!==event.title)throw new Error('削除するイベント名を確認してください。');
 const now=Date.now(),guard="EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='trashed')";
 const results=await env.DB.batch([
 env.DB.prepare(`INSERT INTO meeting_trash(event_id,venue_id,previous_state,deleted_at,preparations)
 SELECT id,COALESCE((SELECT venue_id FROM meeting_event_venues WHERE event_id=meeting_events.id),'hirunomeguro'),state,?,
 (SELECT COALESCE(json_group_array(json_object('key',source_key,'status',status,'error',error)),'[]') FROM meeting_preparations WHERE meeting_id=meeting_events.id)
 FROM meeting_events WHERE id=? AND title=? AND state IN ('open','review','published') AND NOT EXISTS(SELECT 1 FROM meeting_preparations WHERE meeting_id=? AND lock_until>?)`).bind(now,id,event.title,id,now),
 env.DB.prepare("UPDATE meeting_events SET state='trashed',lock_until=0,lock_id='' WHERE id=? AND EXISTS(SELECT 1 FROM meeting_trash WHERE event_id=? AND deleted_at=?)").bind(id,id,now),
 env.DB.prepare(`UPDATE meeting_preparations SET status='trashed',error='',lock_until=0 WHERE meeting_id=? AND ${guard}`).bind(id,id),
 ]);
 if(results[0].meta.changes!==1||results[1].meta.changes!==1)throw new Error('集計・名簿準備中は削除できません。処理が終わってからお試しください。');
}
export async function restoreMeeting(id:string){
 await ensureMeetingAutomation();const event=await trashedMeeting(id);if(!event)throw new Error('ゴミ箱のイベントを選んでください。');
 const guard="EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='trashed')";
 const result=await env.DB.batch([
 env.DB.prepare(`UPDATE meeting_preparations SET status=COALESCE((SELECT json_extract(j.value,'$.status') FROM meeting_trash t,json_each(t.preparations) j WHERE t.event_id=? AND json_extract(j.value,'$.key')=source_key),'roster_pending'),error=COALESCE((SELECT json_extract(j.value,'$.error') FROM meeting_trash t,json_each(t.preparations) j WHERE t.event_id=? AND json_extract(j.value,'$.key')=source_key),'') WHERE meeting_id=? AND ${guard}`).bind(id,id,id,id),
 env.DB.prepare("UPDATE meeting_events SET state=(SELECT previous_state FROM meeting_trash WHERE event_id=?),lock_until=0,lock_id='' WHERE id=? AND state='trashed' AND EXISTS(SELECT 1 FROM meeting_trash WHERE event_id=? AND previous_state IN ('open','review','published'))").bind(id,id,id),
 env.DB.prepare("DELETE FROM meeting_trash WHERE event_id=? AND EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state!='trashed')").bind(id,id),
 ]);if(result[1].meta.changes!==1)throw new Error('復元できませんでした。再読み込みしてください。');
}
// Purge only the selected venue's trash as one transaction. Newer trash entries are excluded.
export async function emptyMeetingTrash(venueId:string,confirmation:unknown){
 if(confirmation!=='ゴミ箱を空にする')throw new Error('完全削除の確認が必要です。');await ensureMeetingAutomation();const cutoff=Date.now();
 const ids="SELECT e.id FROM meeting_events e JOIN meeting_trash t ON t.event_id=e.id WHERE t.venue_id=? AND t.deleted_at<=? AND e.state='deleting'";
 const tables=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>()).results.map(r=>r.name);
 const statements=[env.DB.prepare("UPDATE meeting_events SET state='deleting' WHERE state='trashed' AND id IN (SELECT event_id FROM meeting_trash WHERE venue_id=? AND deleted_at<=?)").bind(venueId,cutoff)];
 for(const [table,where] of [
 ['meeting_analysis_cache',`job_id IN (SELECT event_id||':'||id FROM meeting_answers WHERE event_id IN (${ids}))`],
 ['meeting_analysis_jobs',`event_id IN (${ids})`],
 ['meeting_preanalysis_jobs',`event_id IN (${ids})`],['meeting_preanalysis_events',`event_id IN (${ids})`],
 ['meeting_wish_shares',`answer_id IN (SELECT id FROM meeting_answers WHERE event_id IN (${ids}))`],
 ['meeting_roster_claims',`roster_id IN (SELECT id FROM meeting_roster WHERE event_id IN (${ids}))`],
 ['meeting_guest_claims',`event_id IN (${ids})`],['meeting_member_links',`event_id IN (${ids})`],
 ['meeting_network_cache',`event_id IN (${ids})`],['meeting_registration_codes',`event_id IN (${ids})`],['meeting_signup_drafts',`event_id IN (${ids})`],
 ['meeting_event_venues',`event_id IN (${ids})`],['meeting_answers',`event_id IN (${ids})`],['meeting_roster',`event_id IN (${ids})`],['meeting_qr_settings',`meeting_id IN (${ids})`],
 ] as const)if(tables.includes(table))statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(venueId,cutoff));
 statements.push(env.DB.prepare(`UPDATE meeting_preparations SET meeting_id=NULL,status='cancelled',error='',lock_until=0 WHERE meeting_id IN (${ids})`).bind(venueId,cutoff));
 statements.push(env.DB.prepare(`DELETE FROM meeting_events WHERE id IN (${ids})`).bind(venueId,cutoff));
 statements.push(env.DB.prepare('DELETE FROM meeting_trash WHERE venue_id=? AND deleted_at<=? AND NOT EXISTS(SELECT 1 FROM meeting_events WHERE id=meeting_trash.event_id)').bind(venueId,cutoff));
 const result=await env.DB.batch(statements);return result[0].meta.changes;
}
