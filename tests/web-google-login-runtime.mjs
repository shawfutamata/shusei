// 本番と接続しない隔離D1で、Webログインの境界と既存会員への紐付けを確かめる。
import {Miniflare} from 'miniflare';
import {Response} from 'undici';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('.');let email='member@example.com',verified=true,otp='',sent=0;
const mf=new Miniflare({modulesRoot:root+'/dist/server',modules:readdirSync(root+'/dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(p=>({type:'ESModule',path:root+'/dist/server/'+p})),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],assets:{directory:root+'/dist/client',runWorkerFirst:true},d1Databases:{DB:'web-google-login'},r2Buckets:['AVATARS'],bindings:{AUTH_CODE_PEPPER:'test-pepper',RESEND_API_KEY:'test',AUTH_FROM_EMAIL:'test@example.com',GOOGLE_CLIENT_ID:'fake-client',GOOGLE_CLIENT_SECRET:'fake-secret',ADMIN_EMAILS:'admin@example.com'},outboundService:async request=>{
 const u=new URL(request.url);
 if(u.hostname==='api.resend.com'){sent++;const body=await request.json();otp=body.html.match(/>(\d{6})</)[1];return new Response('{}');}
 if(u.hostname==='oauth2.googleapis.com')return new Response(JSON.stringify({id_token:'x.'+Buffer.from(JSON.stringify({email,email_verified:verified,name:'Google Name'})).toString('base64url')+'.x'}),{headers:{'content-type':'application/json'}});
 return new Response('Denied',{status:403});
}});
try{
 const worker=await mf.getWorker(),db=await mf.getD1Database('DB'),base=(await mf.ready).origin;
 const fetch=(path,options={})=>worker.fetch(base+path,{redirect:'manual',...options});
 const post=(path,body,cookie='')=>fetch(path,{method:'POST',headers:{origin:base,'content-type':'application/json',cookie},body:JSON.stringify(body)});
 // 初回登録の画面はGoogleだけにし、会社情報・規約・運営確認の案内を残す。
 const registration=await fetch('/register');assert.equal(registration.status,200);const registrationHtml=await registration.text();
 assert.match(registrationHtml,/Googleで登録/);assert.match(registrationHtml,/Googleアカウントで登録できます/);
 assert.match(registrationHtml,/会社名・屋号/);assert.match(registrationHtml,/利用規約/);assert.match(registrationHtml,/運営確認/);
 assert.doesNotMatch(registrationHtml,/またはメールで|メールで登録|メールでも新規登録|one-time-code|type="email"/);
 const registrationError=await fetch('/register?login=failed');assert.match(await registrationError.text(),/認証できませんでした/);
 // 登録画面へ案内する入口でも、廃止したメール登録を勧めない。
 for(const path of ['/login','/login/member']){const page=await fetch(path);assert.equal(page.status,200);const html=await page.text();assert.match(html,/Googleアカウントで登録/);assert.doesNotMatch(html,/Googleまたはメールで登録|Google・メールで無料登録/);}
 await fetch('/meeting/missing');
 await post('/api/mobile/auth/request-code',{email:'invalid'});
 for(const [id,mail,status] of [['existing','member@example.com','active'],['admin','admin@example.com','pending'],['denied','denied@example.com','pending']])await db.prepare('INSERT INTO members(id,email,display_name,membership_status,created_at) VALUES(?,?,?,?,?)').bind(id,mail,'Existing Name',status,new Date().toISOString()).run();
 for(const path of ['/api/auth/request-code','/api/auth/session']){const r=await post(path,{email,code:'123456'});assert.equal(r.status,403);assert.match((await r.json()).error,/Google/);assert.equal(r.headers.get('set-cookie'),null);}
 assert.equal(sent,0);
 async function start(back='/'){const r=await fetch('/api/auth/google/start?return_to='+encodeURIComponent(back));assert.equal(r.status,307);return {cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),state:new URL(r.headers.get('location')).searchParams.get('state')};}
 async function callback(back='/',query){const s=await start(back);return fetch('/api/auth/google/callback?'+(query??new URLSearchParams({state:s.state,code:'fake'})),{headers:{cookie:s.cookie}});}
 const count=async()=> (await db.prepare('SELECT count(*) AS n FROM members').first()).n;
 // 既存の先行登録枠は変更せず、満員時の未登録ログインを検証する。
 for(let i=0;i<50;i++)await db.prepare('INSERT INTO members(id,email,display_name,membership_status,membership_source,created_at) VALUES(?,?,?,?,?,?)').bind('early-'+i,`early-${i}@example.com`,'Fixture','active','early_access',new Date().toISOString()).run();
 const before=await count();
 const existing=await callback('/?tab=mypage');assert.equal(existing.headers.get('location'),base+'/?tab=mypage');const cookie=existing.headers.get('set-cookie').match(/member_session=[^;]+/)[0];
 assert.equal(await count(),before);assert.equal((await db.prepare("SELECT display_name FROM members WHERE id='existing'").first()).display_name,'Existing Name');
 const session=await db.prepare("SELECT member_id FROM mobile_sessions ORDER BY created_at DESC LIMIT 1").first();assert.equal(session.member_id,'existing');
 assert.equal((await fetch('/',{headers:{cookie}})).status,200);
 // 閉じたWeb POSTを呼んでも、発行済みのCookieは失効しない。
 await post('/api/auth/session',{email,code:'123456'},cookie);assert.equal((await fetch('/',{headers:{cookie}})).status,200);
 email='unknown@example.com';let r=await callback('/admin');let u=new URL(r.headers.get('location'));assert.equal(u.pathname,'/login/member');assert.equal(u.searchParams.get('login'),'notmember');assert.equal(u.searchParams.get('return_to'),'/admin');assert.equal(await count(),before);
 email='denied@example.com';r=await callback('/admin');assert.equal(new URL(r.headers.get('location')).searchParams.get('login'),'denied');
 email='member@example.com';r=await callback('/admin','error=access_denied');assert.equal(new URL(r.headers.get('location')).searchParams.get('login'),'failed');assert.equal(new URL(r.headers.get('location')).searchParams.get('return_to'),'/admin');
 r=await callback('/admin','state=wrong&code=fake');assert.equal(new URL(r.headers.get('location')).searchParams.get('login'),'failed');
 verified=false;r=await callback('/admin');assert.equal(new URL(r.headers.get('location')).searchParams.get('login'),'failed');verified=true;
 email='admin@example.com';r=await callback('/admin');assert.equal(r.headers.get('location'),base+'/admin');const adminCookie=r.headers.get('set-cookie').match(/member_session=[^;]+/)[0];assert.equal((await fetch('/admin',{headers:{cookie:adminCookie}})).status,200);
 for(const error of ['notmember','denied','failed','unconfigured']){const page=await fetch('/login/member?return_to=%2Fadmin&login='+error);const html=await page.text();assert.match(html,/運営ログイン/);assert.match(html,/role="status"/);assert.doesNotMatch(html,/認証コードを送る|login-code|login-field/);assert.match(html,/return_to=%2Fadmin/);}
 const safe=await start('https://example.com');assert.doesNotMatch(safe.cookie,/google_oauth_return=https/);
 const out=await fetch('/api/auth/session',{method:'DELETE',headers:{origin:base,cookie}});assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await fetch('/',{headers:{cookie}})).status,307);
 // モバイル専用のメールコード入口を維持する。
 const mobile=await post('/api/mobile/auth/request-code',{email:'member@example.com'});assert.equal(mobile.status,200,await mobile.text());assert.equal(sent,1);assert.match(otp,/^\d{6}$/);const mobileVerify=await post('/api/mobile/auth/verify-code',{email:'member@example.com',code:otp});assert.equal(mobileVerify.status,200,await mobileVerify.text());
 console.log('PASS Web POST blocked without mail/session; existing member/session preserved; unknown/denied/cancelled/state/unverified failures; safe return_to; admin Google login; logout; mobile email request retained.');
}finally{await mf.dispose();}
