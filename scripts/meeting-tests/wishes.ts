import {env} from 'cloudflare:workers';
import {createMeeting,submitAnswer,setWishSharing,wishBoard,ownResult} from '../../db/meetings';
export async function wishesTest(){
 const checks:string[]=[];const ok=(v:unknown,label:string)=>{if(!v)throw new Error(label);checks.push(label);};
 const rejects=async(fn:()=>Promise<unknown>,label:string)=>{let failed=false;try{await fn();}catch{failed=true;}ok(failed,label);};
 const tokens=Array.from({length:5},()=>crypto.randomUUID().replaceAll('-','').repeat(2));
 const id=await createMeeting({title:'希望一覧テスト',venue:'架空会場',closesAt:Date.now()+600000});
 const other=await createMeeting({title:'別会場',venue:'架空会場',closesAt:Date.now()+600000});
 try{
  for(let i=0;i<5;i++)await submitAnswer(id,{walkIn:true,answer:{name:`参加者${i}`,company:`架空会社${i}`,services:'店舗の内装工事',need:i===4?'':'建築業者とつながりたい'},token:tokens[i],consent:true});
  ok((await ownResult(id,tokens[1]))?.shareWish===false,'existing answers are private by default');
  await setWishSharing(id,tokens[0],true);await setWishSharing(id,tokens[1],true);await setWishSharing(id,tokens[3],true);await setWishSharing(id,tokens[4],true);
  await rejects(()=>wishBoard(id,tokens[0]),'board inaccessible before publication');
  await rejects(()=>setWishSharing(other,tokens[0],true),'sharing cannot cross event boundary');
  await rejects(()=>setWishSharing(id,'bad',true),'invalid receipt rejected');
  await rejects(()=>setWishSharing(id,tokens[0],'yes' as unknown as boolean),'nonboolean sharing rejected');
  await env.DB.prepare("UPDATE meeting_events SET state='published',closes_at=? WHERE id=?").bind(Date.now()-1,id).run();
  await rejects(()=>wishBoard(id,'0'.repeat(64)),'unknown receipt cannot view board');
  await rejects(()=>wishBoard(other,tokens[0]),'viewer cannot cross event boundary');
  ok((await wishBoard(id,tokens[3])).people.length>=1,'submitted participant can view board without attendance check');
  const board=await wishBoard(id,tokens[0]);ok(board.people.length===2&&board.people.some(p=>p.name==='参加者1')&&board.people.some(p=>p.name==='参加者3'),'only opted in nonblank others visible');
  ok(Object.keys(board.people[0]).sort().join(',')==='company,id,name,need','no business contact seat or receipt leaked');
  await setWishSharing(id,tokens[1],false);ok((await wishBoard(id,tokens[0])).people.length===1,'opt out takes effect after deadline');
  ok((await ownResult(id,tokens[1]))?.shareWish===false,'own result restores sharing state');
  await setWishSharing(id,tokens[2],true);ok((await wishBoard(id,tokens[1])).people.length===3,'participants may view without sharing their own wish');
  return {pass:true,checks};
 }finally{
  await env.DB.prepare('DELETE FROM meeting_wish_shares WHERE answer_id IN (SELECT id FROM meeting_answers WHERE event_id=?)').bind(id).run();
  await env.DB.prepare('DELETE FROM meeting_guest_claims WHERE event_id=?').bind(id).run();
  await env.DB.prepare('DELETE FROM meeting_answers WHERE event_id=?').bind(id).run();
  for(const eventId of [id,other])await env.DB.prepare('DELETE FROM meeting_events WHERE id=?').bind(eventId).run();
 }
}
