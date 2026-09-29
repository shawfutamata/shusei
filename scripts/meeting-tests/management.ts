import { env } from 'cloudflare:workers';
import { createMeeting,meeting,attendees,importRoster,submitAnswer } from '../../db/meetings';
import {updateMeeting,deleteMeeting,restoreMeeting,meetingTrash,emptyMeetingTrash} from '../../db/meeting-management';
import {ensureMeetingAutomation,prepareScheduled} from '../../db/meeting-automation';
import {person} from './fixtures';
export async function managementTest(){
 const checks:string[]=[];function ok(value:unknown,name:string){if(!value)throw new Error(name);checks.push(name);}async function rejects(fn:()=>Promise<unknown>,name:string){let failed=false;try{await fn();}catch{failed=true;}ok(failed,name);}
 const id=await createMeeting({title:'削除検証',venue:'検証会場',closesAt:Date.now()+600000}),other=await createMeeting({title:'保持検証',venue:'別会場',closesAt:Date.now()+600000});
 await ensureMeetingAutomation();
 await updateMeeting(id,{title:'編集検証',venue:'編集会場',closesAt:Date.now()+700000});ok((await meeting(id))?.venue==='編集会場','name, venue and deadline editable');
 await rejects(()=>updateMeeting(id,{title:'',venue:'x'}),'empty name rejected');
 await rejects(()=>updateMeeting(id,{title:'x',venue:'x',closesAt:Date.now()+100*86400000}),'deadline beyond 90 days rejected');
 const token=crypto.randomUUID().replaceAll('-','').repeat(2);await submitAnswer(id,{token,answer:person('fixture'),consent:true});const answer=(await attendees(id))[0];
 await importRoster(other,[{...person('other'),name:'別の参加者',company:'別の会社'}],true);
 await env.DB.prepare("UPDATE meeting_events SET state='published' WHERE id=?").bind(id).run();
 await rejects(()=>updateMeeting(id,{title:'x',venue:'x',closesAt:Date.now()+100000}),'published deadline frozen');await updateMeeting(id,{title:'編集検証',venue:'公開後も名称変更可'});ok((await meeting(id))?.state==='published','metadata edit does not reopen publication');
 await rejects(()=>deleteMeeting(id,'別のタイトル'),'deletion requires correct event confirmation');
 await env.DB.prepare("UPDATE meeting_events SET state='analyzing' WHERE id=?").bind(id).run();await rejects(()=>deleteMeeting(id,'編集検証'),'analysis blocks deletion');ok((await attendees(id)).length===1,'blocked deletion preserves answers');
 await env.DB.prepare("UPDATE meeting_events SET state='published' WHERE id=?").bind(id).run();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO meeting_wish_shares VALUES(?,1)').bind(answer.id),
  env.DB.prepare("INSERT INTO meeting_roster VALUES(?,?,?,?)").bind('r-'+id,id,'{}','検証'),
  env.DB.prepare('INSERT INTO meeting_roster_claims VALUES(?,?)').bind('r-'+id,answer.id),
  env.DB.prepare("INSERT INTO meeting_member_links(event_id,member_id,profile) VALUES(?,?,'{}')").bind(id,'keep-account'),
  env.DB.prepare("INSERT INTO meeting_preparations(source_key,schedule,meeting_id,status,lock_until) VALUES(?,'{}',?,'ready',?)").bind('hirunomeguro:test-'+id,id,Date.now()+600000),
  env.DB.prepare('INSERT INTO meeting_qr_settings VALUES(?,3)').bind(id),
 ]);
 await rejects(()=>deleteMeeting(id,'編集検証'),'active roster preparation blocks deletion');
 await env.DB.prepare('UPDATE meeting_preparations SET lock_until=0 WHERE meeting_id=?').bind(id).run();
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY)').run();await env.DB.prepare("INSERT OR IGNORE INTO members(id) VALUES('keep-account')").run();
 for(const table of ['meeting_network_cache','meeting_registration_codes','meeting_signup_drafts']){await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY,event_id TEXT NOT NULL)`).run();await env.DB.prepare(`INSERT INTO ${table}(id,event_id) VALUES(?,?)`).bind(id,id).run();await env.DB.prepare(`INSERT INTO ${table}(id,event_id) VALUES(?,?)`).bind(other,other).run();}
 await env.DB.prepare(`CREATE TRIGGER management_rollback BEFORE UPDATE OF state ON meeting_events WHEN OLD.id='${id}' AND NEW.state='trashed' BEGIN SELECT RAISE(ABORT,'test rollback');END`).run();
 await rejects(()=>deleteMeeting(id,'編集検証'),'transaction failure reported');ok((await meeting(id))?.state==='published'&&(await attendees(id)).length===1,'failed batch rolls back all deletion changes');await env.DB.prepare('DROP TRIGGER management_rollback').run();
 await deleteMeeting(id,'編集検証');ok(!await meeting(id),'trashed event unavailable to participants');ok((await meetingTrash('hirunomeguro')).some(e=>e.id===id&&e.answerCount===1),'trash lists retained answer count');ok((await attendees(id)).length===1,'trash preserves answer');ok(!!await env.DB.prepare('SELECT 1 FROM meeting_roster_claims WHERE answer_id=?').bind(answer.id).first(),'trash preserves receipt claims');await prepareScheduled('hirunomeguro:test-'+id);ok(!await meeting(id),'automatic preparation does not resurrect trash');await rejects(()=>prepareScheduled('hirunomeguro:test-'+id,true),'manual preparation requires restore');
 await restoreMeeting(id);ok((await meeting(id))?.state==='published'&&(await attendees(id)).length===1,'restore returns original publication and answers');ok(!(await meetingTrash('hirunomeguro')).some(e=>e.id===id),'restore removes trash entry');ok((await env.DB.prepare('SELECT status FROM meeting_preparations WHERE meeting_id=?').bind(id).first<{status:string}>())?.status==='ready','restore preserves automation status');
 await deleteMeeting(id,'編集検証');await rejects(()=>emptyMeetingTrash('hirunomeguro','wrong'),'empty trash requires confirmation');
 await env.DB.prepare(`CREATE TRIGGER purge_rollback BEFORE DELETE ON meeting_events WHEN OLD.id='${id}' BEGIN SELECT RAISE(ABORT,'test rollback');END`).run();await rejects(()=>emptyMeetingTrash('hirunomeguro','ゴミ箱を空にする'),'failed purge reported');ok((await meetingTrash('hirunomeguro')).some(e=>e.id===id)&&(await attendees(id)).length===1,'failed purge rolls back children and trash');await env.DB.prepare('DROP TRIGGER purge_rollback').run();
 await emptyMeetingTrash('hirunomeguro','ゴミ箱を空にする');ok(!await meeting(id)&&!(await meetingTrash('hirunomeguro')).some(e=>e.id===id),'purged event removed from trash');ok(!!await meeting(other),'other event preserved');ok((await attendees(other)).length===0,'other answers unchanged');ok(!!await env.DB.prepare('SELECT 1 FROM meeting_roster WHERE event_id=?').bind(other).first(),'other roster preserved');
 for(const table of ['meeting_answers','meeting_roster','meeting_member_links','meeting_network_cache','meeting_registration_codes','meeting_signup_drafts'])ok(!(await env.DB.prepare(`SELECT 1 FROM ${table} WHERE event_id=?`).bind(id).first()),table+' cleaned');
 ok(!(await env.DB.prepare('SELECT 1 FROM meeting_wish_shares WHERE answer_id=?').bind(answer.id).first()),'shared wish removed');ok(!(await env.DB.prepare('SELECT 1 FROM meeting_roster_claims WHERE answer_id=?').bind(answer.id).first()),'roster claim removed');ok(!!await env.DB.prepare("SELECT 1 FROM members WHERE id='keep-account'").first(),'TASUKI account preserved');
 const prep=await env.DB.prepare('SELECT status,meeting_id FROM meeting_preparations WHERE source_key=?').bind('hirunomeguro:test-'+id).first<{status:string;meeting_id:string|null}>();ok(prep?.status==='cancelled'&&prep.meeting_id===null,'scheduled event cancellation retained');await prepareScheduled('hirunomeguro:test-'+id);ok(!await meeting(id),'automation does not recreate deleted event');
 return {pass:true,checks};
}
