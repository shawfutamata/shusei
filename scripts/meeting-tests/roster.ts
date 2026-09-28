import { env } from 'cloudflare:workers';
import {createMeeting,importRoster,roster,findRoster,attendees,submitAnswer,ownResult,confirmAttendance,analyzeNext,meeting,publishMeeting} from '../../db/meetings';
export async function rosterTest(){
 const checks:string[]=[];
 const receipt=Object.fromEntries(['a','b','c','d'].map(key=>[key,crypto.randomUUID().replaceAll('-','').repeat(2)]));
 const ok=(value:unknown,name:string)=>{if(!value)throw new Error(name);checks.push(name);};
 async function rejects(fn:()=>Promise<unknown>,name:string){let failed=false;try{await fn();}catch{failed=true;}ok(failed,name);}
 const id=await createMeeting({title:'名簿検証専用',venue:'架空会場',closesAt:Date.now()+600000});
 const second=await createMeeting({title:'別名簿検証専用',venue:'架空会場2',closesAt:Date.now()+600000});
 const profiles=[{name:'名簿 太郎',company:'架空建築',industry:'建築',services:'内装工事を施工します。',table:'3',area:'東京都'},{name:'名簿 花子',company:'架空歯科',industry:'歯科',services:'',table:'2',area:''}];
 try{
  await rejects(()=>importRoster(id,profiles,false),'import permission required');
  await importRoster(id,profiles,true);
  const people=await roster(id);ok(people.length===2,'roster imported');ok((await attendees(id)).length===0,'unconsented roster excluded from matching');
  ok((await findRoster(id,'名簿　太郎')).length===1,'name spaces normalized');ok((await findRoster(id,'名簿')).length===0,'partial name does not expose directory');
  ok(people.find(p=>p.industry==='歯科')?.services==='歯科','short industry preserved without invented capabilities');
  const first=people.find(p=>p.name==='名簿 太郎')!,another=people.find(p=>p.id!==first.id)!;
  await rejects(()=>submitAnswer(second,{token:receipt.a,rosterId:first.id,need:'歯科',consent:true}),'roster isolated by meeting');
  await rejects(()=>submitAnswer(id,{token:receipt.a,rosterId:first.id,need:'歯科',consent:false}),'participant consent required');
  await submitAnswer(id,{token:receipt.a,rosterId:first.id,need:'歯科',consent:true,answer:{name:'改ざん',services:'資格を創作'}});
  const own=await ownResult(id,receipt.a);ok(own?.answer.name==='名簿 太郎'&&own.answer.services===first.services,'profile always comes from server roster');ok(own?.rosterId===first.id,'receipt retains roster identity');
  ok(own?.matches.length===0&&own.present===0,'results hidden until confirmation and publication');
  await rejects(()=>importRoster(id,profiles,true),'roster fixed after import');
  await rejects(()=>submitAnswer(id,{token:receipt.b,rosterId:first.id,need:'歯科',consent:true}),'duplicate roster response blocked');
  await rejects(()=>submitAnswer(id,{token:receipt.a,rosterId:another.id,need:'建築',consent:true}),'receipt cannot switch identity');
  await submitAnswer(id,{token:receipt.a,rosterId:first.id,need:'飲食店',consent:true});ok((await attendees(id)).length===1&&(await ownResult(id,receipt.a))?.answer.need==='飲食店','owner can update before deadline');
  const concurrent=await Promise.allSettled(['c','d'].map(c=>submitAnswer(id,{token:receipt[c],rosterId:another.id,need:'建築',consent:true})));
  ok(concurrent.filter(r=>r.status==='fulfilled').length===1&&(await attendees(id)).length===2,'concurrent claims produce exactly one answer');
  await submitAnswer(id,{token:receipt.a,rosterId:first.id,need:'歯科',consent:true});
  for(const row of await attendees(id))await confirmAttendance(id,row.id,true);
  await env.DB.prepare('UPDATE meeting_events SET closes_at=? WHERE id=?').bind(Date.now()-100,id).run();
  await rejects(()=>submitAnswer(id,{token:receipt.a,rosterId:first.id,need:'飲食店',consent:true}),'deadline enforced for roster response');
  ok((await findRoster(id,'名簿 太郎')).length===0,'name search closes at deadline');
  await analyzeNext(id);await analyzeNext(id);ok((await meeting(id))?.state==='review','roster responses reach operator review');
  ok((await ownResult(id,receipt.a))?.matches.length===0,'roster matches hidden before publication');
  await publishMeeting(id);ok((await ownResult(id,receipt.a))?.matches[0]?.name==='名簿 花子','roster import through private published result');
  return {pass:true,checks};
 }finally{
  await env.DB.prepare('DELETE FROM meeting_roster_claims WHERE roster_id IN (SELECT id FROM meeting_roster WHERE event_id IN (?,?))').bind(id,second).run();
  await env.DB.prepare('DELETE FROM meeting_roster WHERE event_id IN (?,?)').bind(id,second).run();
  await env.DB.prepare('DELETE FROM meeting_answers WHERE event_id IN (?,?)').bind(id,second).run();
  await env.DB.prepare('DELETE FROM meeting_events WHERE id IN (?,?)').bind(id,second).run();
 }
}
