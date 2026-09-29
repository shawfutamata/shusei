import { env } from 'cloudflare:workers';
import { ensureDatabase, registerDirectMember, getMobileSessionAccess, hashMobileSecret } from './data';

const hash=hashMobileSecret;
function emailOf(raw:string) {
 const email=raw.trim().toLowerCase();
 if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('正しいメールアドレスを入力してください。');
 return email;
}
async function schema() {
 await ensureDatabase();
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS meeting_registration_codes (
 email TEXT PRIMARY KEY,event_id TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,requested_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0)`).run();
}
export async function requestMeetingCode(eventId:string,rawEmail:string) {
 await schema();const email=emailOf(rawEmail),now=new Date().toISOString();
 if(!env.RESEND_API_KEY||!env.AUTH_FROM_EMAIL)throw new Error('メールの送信設定を確認中です。Googleで進む方法をご利用ください。');
 const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1_000_000).padStart(6,'0');
 const codeHash=await hash(`${eventId}:${email}:${code}`),expires=new Date(Date.now()+600_000).toISOString();
 const saved=await env.DB.prepare(`INSERT INTO meeting_registration_codes VALUES (?,?,?,?,?,0)
 ON CONFLICT(email) DO UPDATE SET event_id=excluded.event_id,code_hash=excluded.code_hash,expires_at=excluded.expires_at,requested_at=excluded.requested_at,attempts=0
 WHERE meeting_registration_codes.requested_at < ?`).bind(email,eventId,codeHash,expires,now,new Date(Date.now()-60_000).toISOString()).run();
 if(!saved.meta.changes)throw new Error('認証コードは1分後に再送できます。');
 try {
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.AUTH_FROM_EMAIL,to:[email],subject:'例会アンケート・TASUKI 認証コード',html:`<h2>アンケートへ進むための認証コード</h2><p>画面に次の6桁を入力してください。</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>有効期限は10分です。初めての方は、認証後にTASUKIの無料アカウントが作成されます。心当たりがない場合は破棄してください。</p>`})});
  if(!response.ok)throw new Error('認証メールを送信できませんでした。');
 }catch(error){await env.DB.prepare('DELETE FROM meeting_registration_codes WHERE email=? AND code_hash=?').bind(email,codeHash).run();throw error;}
}
/** Called only after Google or email ownership has been verified. Account approval rules stay unchanged. */
export async function startMeetingAccount(rawEmail:string,name='') {
 await ensureDatabase();const email=emailOf(rawEmail);
 await registerDirectMember(email,name);
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
 return {token,expiresAt};
}
export async function verifyMeetingCode(eventId:string,rawEmail:string,code:string) {
 await schema();const email=emailOf(rawEmail);
 if(!/^\d{6}$/.test(code))throw new Error('6桁の認証コードを入力してください。');
 const now=new Date().toISOString(),codeHash=await hash(`${eventId}:${email}:${code}`);
 const consumed=await env.DB.prepare(`DELETE FROM meeting_registration_codes WHERE email=? AND event_id=? AND code_hash=? AND expires_at>? AND attempts<5 RETURNING email`).bind(email,eventId,codeHash,now).first();
 if(!consumed){
  await env.DB.prepare('UPDATE meeting_registration_codes SET attempts=attempts+1 WHERE email=? AND event_id=?').bind(email,eventId).run();
  throw new Error('コードが違うか、有効期限が切れています。確認または再送してください。');
 }
 return startMeetingAccount(email);
}
