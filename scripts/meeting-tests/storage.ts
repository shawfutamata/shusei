import { env } from 'cloudflare:workers';
import {analyzeNext,meeting,createMeeting,submitAnswer,ownResult,attendees,publishMeeting} from '../../db/meetings';
import { person } from './fixtures';
export async function storageTest() {
 const checks:string[]=[];
 function ok(value:unknown,name:string){if(!value)throw new Error(name);checks.push(name);}
 async function rejects(fn:()=>Promise<unknown>,name:string){let failed=false;try{await fn();}catch{failed=true;}ok(failed,name);}
 const id=await createMeeting({title:'検証専用',venue:'架空会場',closesAt:Date.now()+600000});
 const other=await createMeeting({title:'別会場検証専用',venue:'架空会場2',closesAt:Date.now()+600000});
 const token=crypto.randomUUID().replaceAll('-','').repeat(2),answer=person('not-used');
 try {
  await rejects(()=>submitAnswer(id,{token,answer,consent:false}),'consent required');
  await submitAnswer(id,{token,answer,consent:true});
  await submitAnswer(id,{token,answer:{...answer,name:'修正名'},consent:true});
  const rows=await attendees(id);ok(rows.length===1,'retry does not duplicate');
  const own=await ownResult(id,token);ok(own?.answer.name==='修正名','receipt retrieves updated answer');
  ok(!await ownResult(other,token),'receipt isolated by event');
  ok(!await ownResult(id,'b'.repeat(64)),'wrong receipt denied');
  ok(own?.matches.length===0,'unpublished candidates hidden');
  await env.DB.prepare("UPDATE meeting_events SET closes_at=? WHERE id=?").bind(Date.now()-100,id).run();
  await rejects(()=>submitAnswer(id,{token,answer,consent:true}),'deadline enforced on update');
  await rejects(()=>submitAnswer(id,{token:'c'.repeat(64),answer,consent:true}),'deadline enforced on insert');
  await env.DB.prepare("UPDATE meeting_events SET state='analyzing' WHERE id=?").bind(id).run();
  await rejects(()=>publishMeeting(id),'unfinished analysis cannot publish');
  await env.DB.prepare("UPDATE meeting_events SET state='review' WHERE id=?").bind(id).run();await env.DB.prepare('UPDATE meeting_answers SET analyzed=1 WHERE event_id=?').bind(id).run();await publishMeeting(id);
  ok((await ownResult(id,token))?.event.state==='published','publication visible to owner');
  return {pass:true,checks};
 } finally {
  await env.DB.prepare('DELETE FROM meeting_answers WHERE event_id IN (?,?)').bind(id,other).run();
  await env.DB.prepare('DELETE FROM meeting_events WHERE id IN (?,?)').bind(id,other).run();
 }
}

export async function pipelineTest(){
 const id=await createMeeting({title:'AI一貫検証専用',venue:'架空会場',closesAt:Date.now()+600000});
 const token=crypto.randomUUID().replaceAll('-','').repeat(2),providerToken=crypto.randomUUID().replaceAll('-','').repeat(2);
 try {
  await submitAnswer(id,{token,consent:true,answer:person('unused',{name:'検証依頼者',need:'目黒区の飲食店の給排水工事を頼める方を探しています。'})});
  await submitAnswer(id,{token:providerToken,consent:true,answer:person('unused2',{name:'検証設備業者',services:'東京都内全域で飲食店の給排水工事を施工できます。'})});
  await env.DB.prepare('UPDATE meeting_events SET closes_at=? WHERE id=?').bind(Date.now()-100,id).run();
  await analyzeNext(id);await analyzeNext(id);
  if((await meeting(id))?.state!=='review')throw new Error('not ready for review');
  if((await ownResult(id,token))?.matches.length!==0)throw new Error('leaked before publication');
  await publishMeeting(id);
  const result=await ownResult(id,token);
  if(result?.matches.length!==1||result.matches[0].name!=='検証設備業者')throw new Error('wrong final match');
  return {pass:true,steps:['anonymous submission','deadline','AI analysis','review','publish','private result'],match:result.matches[0]};
 }finally{
  await env.DB.prepare('DELETE FROM meeting_answers WHERE event_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM meeting_events WHERE id=?').bind(id).run();
 }
}
