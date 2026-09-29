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
 const result=await env.DB.prepare("UPDATE meeting_events SET title=?,venue=?,closes_at=COALESCE(?,closes_at) WHERE id=? AND (? IS NULL OR state='open')").bind(title,venue,closesAt,id,closesAt).run();
 if(result.meta.changes!==1)throw new Error('イベントが見つからないか、集計が始まっています。再読み込みしてください。');
}

export async function deleteMeeting(id:string,confirmation:unknown) {
 await ensureMeetingAutomation();
 const event=await meeting(id);
 if(!event)throw new Error('イベントが見つかりません。');
 if(confirmation!==event.title)throw new Error('削除するイベント名を確認してください。');
 // The first statement acquires the deletion guard inside the same atomic D1 batch.
 const guard="EXISTS(SELECT 1 FROM meeting_events WHERE id=? AND state='deleting')";
 const tables=(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>()).results.map(r=>r.name);
 const statements=[env.DB.prepare("UPDATE meeting_events SET state='deleting' WHERE id=? AND title=? AND state!='analyzing' AND NOT EXISTS(SELECT 1 FROM meeting_preparations WHERE meeting_id=? AND lock_until>?)").bind(id,event.title,id,Date.now())];
 for(const [table,where] of [
  ['meeting_wish_shares','answer_id IN (SELECT id FROM meeting_answers WHERE event_id=?)'],
  ['meeting_roster_claims','roster_id IN (SELECT id FROM meeting_roster WHERE event_id=?)'],
  ['meeting_guest_claims','event_id=?'],['meeting_member_links','event_id=?'],
  ['meeting_network_cache','event_id=?'],['meeting_registration_codes','event_id=?'],['meeting_signup_drafts','event_id=?'],
  ['meeting_answers','event_id=?'],['meeting_roster','event_id=?'],['meeting_qr_settings','meeting_id=?'],
 ] as const)if(tables.includes(table))statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE ${where} AND ${guard}`).bind(id,id));
 statements.push(env.DB.prepare(`UPDATE meeting_preparations SET meeting_id=NULL,status='cancelled',error='',lock_until=0 WHERE meeting_id=? AND ${guard}`).bind(id,id));
 statements.push(env.DB.prepare("DELETE FROM meeting_events WHERE id=? AND state='deleting'").bind(id));
 const results=await env.DB.batch(statements);
 if(results[0].meta.changes!==1||results.at(-1)?.meta.changes!==1)throw new Error('集計・名簿準備中は削除できません。処理が終わってからお試しください。');
}
