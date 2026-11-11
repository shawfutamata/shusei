import {Miniflare} from 'miniflare';
import {Response} from 'undici';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('.');let otp='',googleEmail='google@example.com';
const mf=new Miniflare({modulesRoot:root+'/dist/server',modules:readdirSync(root+'/dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(p=>({type:'ESModule',path:root+'/dist/server/'+p})),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],assets:{directory:root+'/dist/client',runWorkerFirst:true},d1Databases:{DB:'registration-debug'},r2Buckets:['AVATARS'],bindings:{AUTH_CODE_PEPPER:'test-pepper',RESEND_API_KEY:'test',AUTH_FROM_EMAIL:'test@example.com',GOOGLE_CLIENT_ID:'fake-client',GOOGLE_CLIENT_SECRET:'fake-secret'},outboundService:async request=>{
 const u=new URL(request.url);
 if(u.hostname==='api.resend.com'){const b=await request.json();otp=b.html.match(/>(\d{6})</)[1];return new Response('{}');}
 if(u.hostname==='oauth2.googleapis.com')return new Response(JSON.stringify({id_token:'x.'+Buffer.from(JSON.stringify({email:googleEmail,email_verified:true,name:'Google User'})).toString('base64url')+'.x'}),{headers:{'content-type':'application/json'}});
 if(u.hostname==='openidconnect.googleapis.com')return new Response(JSON.stringify({email:googleEmail,email_verified:true,name:'Google User'}),{headers:{'content-type':'application/json'}});
 return new Response('Denied',{status:403});
}});
try {
 const worker=await mf.getWorker(),db=await mf.getD1Database('DB'),base=(await mf.ready).origin;
 const fetch=(path,options={})=>worker.fetch(base+path,{redirect:'manual',...options});
 const post=(body,origin=base)=>fetch('/api/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const profile={name:'登録テスト',company:'テスト会社',industry:'印刷',services:'チラシの印刷',area:''};
 const draft=async(p=profile)=>{const r=await post({action:'draft',consent:true,profile:p});assert.equal(r.status,200);return (await r.json()).draft;};
 const start=async(id)=>{const r=await fetch('/api/auth/google/start?signup=1&draft='+id);assert.equal(r.status,307);return {cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),state:new URL(r.headers.get('location')).searchParams.get('state')};};
 const callback=async(s,query)=>fetch('/api/auth/google/callback?'+(query||new URLSearchParams({state:s.state,code:'fake'})),{headers:{cookie:s.cookie}});
 const member=async(email)=>db.prepare('SELECT * FROM members WHERE email=?').bind(email).first();
 const sessionCookie=r=>r.headers.getSetCookie().find(s=>s.startsWith('member_session='))?.split(';')[0];
 await fetch('/register');
 assert.equal((await post({action:'draft',consent:true,profile},'https://wrong.example')).status,403);
 assert.equal((await post({action:'draft',consent:false,profile})).status,400);
 assert.equal((await post({action:'draft',consent:true,profile:{...profile,name:''}})).status,400);
 assert.equal((await post({action:'draft',consent:true,profile:{...profile,company:''}})).status,400);
 assert.equal((await post({action:'draft',consent:true,profile:{...profile,services:'a'}})).status,400);
 assert.equal((await post({action:'draft',consent:true,profile,invite:'INVALID'})).status,400);
 const firstDraft=await draft();
 googleEmail='retry@example.com';
 let s=await start(firstDraft),r=await callback(s,'error=access_denied');assert.equal(sessionCookie(r),undefined);assert.equal(await member(googleEmail),null);
 s=await start(firstDraft);r=await callback(s,'state=wrong&code=fake');assert.equal(sessionCookie(r),undefined);assert.equal(await member(googleEmail),null);
 s=await start(firstDraft);r=await callback(s);let cookie=sessionCookie(r);assert.ok(cookie);assert.equal((await member(googleEmail)).membership_status,'active');
 let home=await fetch('/',{headers:{cookie}});assert.equal(home.status,200,'verified new member can enter app');
 const original=await member(googleEmail);const changedDraft=await draft({...profile,company:'上書き禁止'});
 s=await start(changedDraft);r=await callback(s);assert.ok(sessionCookie(r));assert.equal((await member(googleEmail)).company,original.company);assert.equal((await member(googleEmail)).id,original.id);
 assert.equal((await db.prepare('SELECT count(*) n FROM members WHERE email=?').bind(googleEmail).first()).n,1);
 // Expired profile after OAuth start fails safely and supports a fresh attempt.
 googleEmail='expiry@example.com';const exp=await draft();s=await start(exp);await db.prepare('UPDATE meeting_signup_drafts SET expires_at=? WHERE id=?').bind('2000-01-01T00:00:00.000Z',exp).run();r=await callback(s);assert.equal(sessionCookie(r),undefined);assert.equal(await member(googleEmail),null);assert.equal(new URL(r.headers.get('location')).pathname,'/register');
 s=await start(await draft());r=await callback(s);assert.ok(sessionCookie(r));assert.equal((await member(googleEmail)).membership_status,'active');
 // Cancelled and overdue existing members are not reactivated by signup.
 for(const status of ['canceled','suspended','past_due']){
  await db.prepare('UPDATE members SET membership_status=?,membership_period_end=? WHERE email=?').bind(status,'2000-01-01T00:00:00.000Z',googleEmail).run();
  s=await start(await draft());r=await callback(s);assert.equal(sessionCookie(r),undefined);assert.equal((await member(googleEmail)).membership_status,status);
 }
 // Wrong mail code, resend cooldown and replay do not create duplicate accounts.
 const mail='mail-retry@example.com';r=await post({action:'request',consent:true,email:mail,profile});assert.equal(r.status,200);const correct=otp;
 r=await post({action:'request',consent:true,email:mail,profile});assert.equal(r.status,400);
 r=await post({action:'verify',consent:true,email:mail,code:correct==='000000'?'111111':'000000'});assert.equal(r.status,400);assert.equal(await member(mail),null);
 r=await post({action:'verify',consent:true,email:mail,code:correct});assert.equal(r.status,200);cookie=sessionCookie(r);assert.ok(cookie);assert.equal((await member(mail)).membership_status,'active');assert.equal((await fetch('/',{headers:{cookie}})).status,200);
 r=await post({action:'verify',consent:true,email:mail,code:correct});assert.equal(r.status,400);assert.equal((await fetch('/',{headers:{cookie}})).status,200,'failed code replay does not revoke valid session');
 console.log('PASS registration debug: origin/consent/profile/referral validation; OAuth cancellation/state retry; new member app access; duplicate/profile protection; expired draft recovery; canceled/suspended/overdue guards; email cooldown/wrong-code/replay and app access. No live accounts or emails.');
} finally {await mf.dispose();}
