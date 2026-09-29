import {env} from 'cloudflare:workers';
import {createMeeting,importRoster,roster,rosterOptions,selectedRoster,submitAnswer,ownResult,attendees,meeting,analyzeNext,publishMeeting} from '../../db/meetings';
export async function guestTest(){
 const checks:string[]=[];
 const ok=(v:unknown,label:string)=>{if(!v)throw new Error(label);checks.push(label);};
 const rejects=async(fn:()=>Promise<unknown>,label:string)=>{let failed=false;try{await fn();}catch{failed=true;}ok(failed,label);};
 const token=()=>crypto.randomUUID().replaceAll('-','').repeat(2);
 const receipt=token(),other=token(),third=token();
 const id=await createMeeting({title:'当日参加テスト',venue:'架空会場',closesAt:Date.now()+600000});
 const second=await createMeeting({title:'別例会テスト',venue:'架空会場',closesAt:Date.now()+600000});
 const profile={name:'名簿 太郎',company:'架空建築',industry:'建築',services:'内装工事を施工します。',table:'',area:''};
 const answer={name:'当日 花子',company:'架空歯科',services:'歯科医院を運営しています。',need:'',industry:'偽の業種',table:'偽の席',referrals:'偽の紹介能力'};
 try {
  await importRoster(id,[profile],true);const person=(await roster(id))[0];
  const options=await rosterOptions(id);ok(options.length===1&&Object.keys(options[0]).sort().join(',')==='company,id,name','selector exposes only name company id');
  ok((await selectedRoster(id,person.id))?.services===profile.services,'selected person has canonical business');
  ok(await selectedRoster(second,person.id)===null,'selection isolated by event');
  await rejects(()=>submitAnswer(id,{walkIn:true,answer,token:receipt,consent:false}),'walk-in consent required');
  await rejects(()=>submitAnswer(id,{walkIn:true,answer:{...answer,services:''},token:receipt,consent:true}),'walk-in business required');
  await rejects(()=>submitAnswer(id,{walkIn:true,answer:profile,token:receipt,consent:true}),'rostered person cannot bypass selection');
  await submitAnswer(id,{walkIn:true,answer,token:receipt,consent:true});
  const saved=await ownResult(id,receipt);ok(saved?.walkIn===true&&!saved.rosterId&&saved.present===1,'walk-in saved without attendance confirmation');
  ok(saved?.answer.services===answer.services&&saved.answer.industry===''&&saved.answer.table===''&&saved.answer.referrals==='','walk-in only trusts self-entered permitted fields');
  ok((await attendees(id))[0].walkIn===true,'operator can identify self-entered participant');
  await rejects(()=>submitAnswer(id,{walkIn:true,answer:{...answer,name:'当日　花子'},token:other,consent:true}),'normalized duplicate walk-in blocked');
  await rejects(()=>submitAnswer(id,{walkIn:true,answer:{...answer,name:'別 人'},token:receipt,consent:true}),'receipt cannot change identity');
  await rejects(()=>submitAnswer(id,{rosterId:person.id,need:'建築',token:receipt,consent:true}),'walk-in receipt cannot switch to roster');
  await submitAnswer(id,{walkIn:true,answer:{...answer,services:'歯科医院の経営と診療'},token:receipt,consent:true});
  ok((await ownResult(id,receipt))?.answer.services==='歯科医院の経営と診療','walk-in can correct business before deadline');
  const concurrent=await Promise.allSettled([other,third].map(t=>submitAnswer(id,{walkIn:true,answer:{...answer,name:'同時 参加',company:'架空商店'},token:t,consent:true})));
  ok(concurrent.filter(r=>r.status==='fulfilled').length===1&&(await attendees(id)).length===2,'concurrent guest claims atomic');
  await submitAnswer(second,{walkIn:true,answer,token:token(),consent:true});ok((await attendees(second)).length===1,'walk-in allowed without roster and separate event identity');
  await env.DB.prepare('UPDATE meeting_events SET closes_at=? WHERE id=?').bind(Date.now()-1,id).run();
  ok((await rosterOptions(id)).length===0&&await selectedRoster(id,person.id)===null,'selector closes at deadline');
  await rejects(()=>submitAnswer(id,{walkIn:true,answer,token:receipt,consent:true}),'walk-in update deadline enforced');
  await rejects(()=>submitAnswer(id,{walkIn:true,answer:{...answer,name:'遅刻 者'},token:token(),consent:true}),'late walk-in submission rejected');
  await analyzeNext(id);await analyzeNext(id);ok((await meeting(id))?.state==='review','walk-in follows analysis workflow');
  await publishMeeting(id);ok((await ownResult(id,receipt))?.event.state==='published','walk-in receipt retrieves published result');
  return {pass:true,checks};
 }finally{
  for(const eventId of [id,second]){
   await env.DB.prepare('DELETE FROM meeting_guest_claims WHERE event_id=?').bind(eventId).run();
   await env.DB.prepare('DELETE FROM meeting_roster_claims WHERE roster_id IN (SELECT id FROM meeting_roster WHERE event_id=?)').bind(eventId).run();
   await env.DB.prepare('DELETE FROM meeting_roster WHERE event_id=?').bind(eventId).run();
   await env.DB.prepare('DELETE FROM meeting_answers WHERE event_id=?').bind(eventId).run();
   await env.DB.prepare('DELETE FROM meeting_events WHERE id=?').bind(eventId).run();
  }
 }
}
