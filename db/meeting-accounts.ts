import {meeting,ensureMeetings,selectedRoster} from './meetings';
import {validateAnswer,type RosterPerson} from '@/app/meeting/types';
import {rosterAnswer} from '@/app/meeting/roster';
import { env } from 'cloudflare:workers';
import { ensureDatabase, registerDirectMember, getMobileSessionAccess, hashMobileSecret, registerInvitedMember, findInviterByCode } from './data';

const hash=hashMobileSecret;
function emailOf(raw:string) {
 const email=raw.trim().toLowerCase();
 if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('正しいメールアドレスを入力してください。');
 return email;
}
async function schema() {
 await ensureDatabase();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_registration_codes (
 email TEXT PRIMARY KEY,event_id TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,requested_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,draft_id TEXT NOT NULL DEFAULT '')`).run();
 const columns=await env.DB.prepare('PRAGMA table_info(meeting_registration_codes)').all<{name:string}>();
 if(!columns.results.some(c=>c.name==='draft_id')){try{await env.DB.prepare("ALTER TABLE meeting_registration_codes ADD COLUMN draft_id TEXT NOT NULL DEFAULT ''").run();}catch(e){if(!String(e).includes('duplicate column'))throw e;}}
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_signup_drafts(id TEXT PRIMARY KEY,event_id TEXT NOT NULL,roster_id TEXT NOT NULL,profile TEXT NOT NULL,walk_in INTEGER NOT NULL,expires_at TEXT NOT NULL)`).run();
}

export async function requestMeetingCode(eventId:string,rawEmail:string,draftId='') {
 await schema();const email=emailOf(rawEmail),now=new Date().toISOString();
 if(draftId&&!await signupDraft(eventId,draftId))throw new Error('会社情報を確認し直してください。');
 if(!env.RESEND_API_KEY||!env.AUTH_FROM_EMAIL)throw new Error('メールの送信設定を確認中です。Googleで進む方法をご利用ください。');
 const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,'0');
 const codeHash=await hash(`${eventId}:${email}:${code}`),expires=new Date(Date.now()+600_000).toISOString();
 const saved=await env.DB.prepare(`INSERT INTO meeting_registration_codes(email,event_id,code_hash,expires_at,requested_at,attempts,draft_id) VALUES (?,?,?,?,?,0,?)
 ON CONFLICT(email) DO UPDATE SET event_id=excluded.event_id,code_hash=excluded.code_hash,expires_at=excluded.expires_at,requested_at=excluded.requested_at,attempts=0,draft_id=excluded.draft_id
 WHERE meeting_registration_codes.requested_at < ?`).bind(email,eventId,codeHash,expires,now,draftId,new Date(Date.now()-60_000).toISOString()).run();
 if(!saved.meta.changes)throw new Error('認証コードは1分後に再送できます。');
 try {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.AUTH_FROM_EMAIL,to:[email],subject:eventId==='direct'?'TASUKI 登録認証コード':'例会アンケート・TASUKI 認証コード',html:`<h2>${eventId==='direct'?'TASUKIへ登録するため':'アンケートへ進むため'}の認証コード</h2><p>画面に次の6桁を入力してください。</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>有効期限は10分です。初めての方は、認証後にTASUKIの無料アカウントが作成されます。心当たりがない場合は破棄してください。</p>`})});
  if(!response.ok)throw new Error('認証メールを送信できませんでした。');
 }catch(error){await env.DB.prepare('DELETE FROM meeting_registration_codes WHERE email=? AND code_hash=?').bind(email,codeHash).run();throw error;}
}
/** Called only after Google or email ownership has been verified. Attendance controls event activation. */
export async function startMeetingAccount(rawEmail:string,name='',eventId='',draftId='') {
 await ensureDatabase();const email=emailOf(rawEmail);
 const draft=draftId?await signupDraft(eventId,draftId):null;
 if(draftId&&!draft)throw new Error('会社情報を確認し直してください。');
 const directProfile=eventId==='direct'&&draft?JSON.parse(draft.profile):null;
 if(draft?.rosterId&&eventId!=='direct'){await ensureMeetings();const owner=await env.DB.prepare('SELECT m.email FROM meeting_member_links l JOIN members m ON m.id=l.member_id WHERE l.event_id=? AND l.roster_id=?').bind(eventId,draft.rosterId).first<{email:string}>();if(owner&&owner.email!==email)throw new Error('この方は登録済みです。登録したアカウントでお進みください。');}
 if(directProfile?.invite&&!await findInviterByCode(directProfile.invite))throw new Error('紹介リンクを確認してください。');
 const invited=directProfile?.invite?await registerInvitedMember(email,name,directProfile.invite):null;
 const registered=invited&&!invited.alreadyMember?invited:await registerDirectMember(email,name);
 if(registered&&eventId&&eventId!=='direct')await env.DB.prepare("UPDATE members SET membership_source='meeting_signup' WHERE email=? AND membership_source='lp_signup'").bind(email).run();
 const member=await env.DB.prepare('SELECT id,membership_status AS status FROM members WHERE email=?').bind(email).first<{id:string;status:string}>();
 if(!member)throw new Error('登録できませんでした。もう一度お試しください。');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const expiresAt=new Date(Date.now()+30*86400_000).toISOString();
 // Reuse the normal session store without changing a suspended or canceled membership.
 await env.DB.prepare('INSERT INTO mobile_sessions (token_hash,member_id,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?)').bind(await hash(token),member.id,expiresAt,new Date().toISOString(),new Date().toISOString()).run();
 const access=await getMobileSessionAccess(token);
 if(!access||(!access.membership.canUseApp&&member.status!=='invited')) {
  await env.DB.prepare('DELETE FROM mobile_sessions WHERE token_hash=?').bind(await hash(token)).run();
  throw new Error('このアカウントは利用できません。運営へお問い合わせください。');
 }
 if(draftId){
  const draft=await signupDraft(eventId,draftId);
  if(!draft){await env.DB.prepare('DELETE FROM mobile_sessions WHERE token_hash=?').bind(await hash(token)).run();throw new Error('会社情報の確認期限が切れています。');}
  try{if(eventId==='direct'){
    // Existing members keep their established profiles and membership status.
    if(registered)await env.DB.prepare('UPDATE members SET display_name=?,company=?,primary_industry=?,company_pr=?,business_area=?,venue=? WHERE id=?').bind(directProfile.name,directProfile.company,directProfile.industry,directProfile.services,directProfile.area,directProfile.venue||'',member.id).run();
   }else await saveMeetingProfile(eventId,member.id,{rosterId:draft.rosterId,walkIn:draft.walkIn===1,profile:JSON.parse(draft.profile)},true);}
  catch(error){await env.DB.prepare('DELETE FROM mobile_sessions WHERE token_hash=?').bind(await hash(token)).run();throw error;}
 }
 return {token,expiresAt};
}
export async function verifyMeetingCode(eventId:string,rawEmail:string,code:string) {
 await schema();const email=emailOf(rawEmail);
 if(!/^\d{6}$/.test(code))throw new Error('6桁の認証コードを入力してください。');
 const now=new Date().toISOString(),codeHash=await hash(`${eventId}:${email}:${code}`);
 const consumed=await env.DB.prepare(`DELETE FROM meeting_registration_codes WHERE email=? AND event_id=? AND code_hash=? AND expires_at>? AND attempts<5 RETURNING email,draft_id AS draftId`).bind(email,eventId,codeHash,now).first<{email:string;draftId:string}>();
 if(!consumed){
  await env.DB.prepare('UPDATE meeting_registration_codes SET attempts=attempts+1 WHERE email=? AND event_id=?').bind(email,eventId).run();
  throw new Error('コードが違うか、有効期限が切れています。確認または再送してください。');
 }
 return startMeetingAccount(email,'',eventId,consumed.draftId);
}

export type MeetingProfile = {rosterId:string;profile:RosterPerson;walkIn:boolean;answerId:string};
export async function meetingMemberProfile(eventId:string,memberId:string):Promise<MeetingProfile|null> {
 await ensureMeetings();
 const row=await env.DB.prepare('SELECT roster_id AS rosterId,profile,walk_in AS walkIn,answer_id AS answerId FROM meeting_member_links WHERE event_id=? AND member_id=?').bind(eventId,memberId).first<{rosterId:string;profile:string;walkIn:number;answerId:string}>();
 return row?{...row,walkIn:row.walkIn===1,profile:JSON.parse(row.profile)}:null;
}
async function checkedProfile(eventId:string,input:Record<string,unknown>) {
 const event=eventId==='direct'?{id:'direct',venue:''}:await meeting(eventId);if(!event)throw new Error('アンケートが見つかりません。');
 const rosterId=typeof input.rosterId==='string'?input.rosterId:'';
 const base=rosterId&&eventId!=='direct'?await selectedRoster(eventId,rosterId,true):null;
 if(rosterId&&!base)throw new Error('名簿からご本人を選んでください。');
 if(!base&&input.walkIn!==true)throw new Error('会社名とご本人を選んでください。');
 const raw=input.profile as Record<string,unknown>;
 if(!raw||typeof raw!=='object')throw new Error('会社情報を確認してください。');
 const values=Object.fromEntries(['name','company','industry','services','area'].map(k=>[k,typeof raw[k]==='string'?raw[k]:base?.[k as keyof RosterPerson]||''])) as unknown as RosterPerson;
 const profile=validateAnswer(rosterAnswer({...values,table:''},''),true);
 const invite=eventId==='direct'&&typeof input.invite==='string'?input.invite.trim().toUpperCase().slice(0,16):'';
 if(invite&&!await findInviterByCode(invite))throw new Error('紹介リンクが無効です。');
 if(profile.services.length<2)throw new Error('事業内容を入力してください。');
 return {event,rosterId,walkIn:!base,profile:{...profile,table:'',...(eventId==='direct'?{invite,venue:typeof input.venue==='string'?input.venue.trim().slice(0,120):''}:{})}};
}
export async function createSignupDraft(eventId:string,input:Record<string,unknown>) {
 await schema();const data=await checkedProfile(eventId,input),id=crypto.randomUUID();
 await env.DB.batch([env.DB.prepare('DELETE FROM meeting_signup_drafts WHERE expires_at<?').bind(new Date().toISOString()),env.DB.prepare('INSERT INTO meeting_signup_drafts VALUES(?,?,?,?,?,?)').bind(id,eventId,data.rosterId,JSON.stringify(data.profile),data.walkIn?1:0,new Date(Date.now()+1200000).toISOString())]);
 return id;
}
export async function signupDraft(eventId:string,id:string) {
 await schema();
 return env.DB.prepare('SELECT roster_id AS rosterId,profile,walk_in AS walkIn FROM meeting_signup_drafts WHERE event_id=? AND id=? AND expires_at>?').bind(eventId,id,new Date().toISOString()).first<{rosterId:string;profile:string;walkIn:number}>();
}
export async function saveMeetingProfile(eventId:string,memberId:string,input:Record<string,unknown>,consent:boolean) {
 if(!consent)throw new Error('会社情報の保存に同意してください。');
 await ensureDatabase();await ensureMeetings();const data=await checkedProfile(eventId,input);
 const prior=await meetingMemberProfile(eventId,memberId);
 if(prior&&prior.rosterId!==data.rosterId)throw new Error('登録済みのお名前は変更できません。受付係にご相談ください。');
 const member=await env.DB.prepare('SELECT membership_status AS status FROM members WHERE id=?').bind(memberId).first<{status:string}>();
 if(!member||!['active','invited','past_due'].includes(member.status))throw new Error('このアカウントは利用できません。');
 if(prior?.answerId)throw new Error('回答後の会社情報変更は受付係にご相談ください。希望は締切まで編集できます。');
 try{await env.DB.batch([
  env.DB.prepare(`INSERT INTO meeting_member_links(event_id,member_id,roster_id,profile,walk_in) VALUES(?,?,?,?,?) ON CONFLICT(event_id,member_id) DO UPDATE SET profile=excluded.profile,walk_in=excluded.walk_in WHERE meeting_member_links.answer_id='' AND meeting_member_links.roster_id=excluded.roster_id`).bind(eventId,memberId,data.rosterId,JSON.stringify(data.profile),data.walkIn?1:0),
  env.DB.prepare(`UPDATE members SET display_name=?,company=?,venue=?,business_area=?,primary_industry=?,company_pr=? WHERE id=?`).bind(data.profile.name,data.profile.company,data.event.venue,data.profile.area,data.profile.industry,data.profile.services,memberId),
 ]);}catch(error){if(String(error).includes('UNIQUE'))throw new Error('この方は登録済みです。登録したアカウントで進むか、受付係にご相談ください。');throw error;}
 return data;
}
export async function activateMeetingMember(memberId:string,eventId:string) {
 await ensureDatabase();await ensureMeetings();
 // Only meeting registrations linked to their own submitted answer can be activated. Suspended/canceled accounts remain unchanged.
 await env.DB.prepare(`UPDATE members SET membership_status='active',activated_at=? WHERE id=? AND membership_status='invited' AND membership_source='meeting_signup' AND EXISTS(SELECT 1 FROM meeting_member_links l JOIN meeting_answers a ON a.id=l.answer_id WHERE l.member_id=members.id AND l.event_id=? AND a.event_id=?)`).bind(new Date().toISOString(),memberId,eventId,eventId).run();
}
