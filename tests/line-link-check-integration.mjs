// Request.cf は組込みの偽メタデータを使い、外部 cf.json の自動取得を行わない。
import { mockStatelessToken } from './line-stateless-fixture.mjs';
// 実ルート＋隔離D1。LINE/Google/メールは全て偽応答。本番・実通知には触れない。
import { Miniflare } from 'miniflare';
import { Response, FormData } from 'undici';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve('.'), A='U'+'a'.repeat(32), B='U'+'b'.repeat(32), BOT='U'+'d'.repeat(32);
let delayVerification=false;
let subject=A,nonce='',challenge='',googleEmail='existing@example.com',tokenCount=0,deauthStatus=204,deauthCalls=0,pushCalls=0;
const mails=[],tokens=new Map(),revoked=new Set();
const bindings={ AUTH_CODE_PEPPER:'test-only',GOOGLE_CLIENT_ID:'fake-client',GOOGLE_CLIENT_SECRET:'fake-secret',ADMIN_EMAILS:'different-admin@example.com',LINE_LINK_CHECK_MEMBER_ID:'existing',LINE_LINK_CHECK_STARTED_AT:new Date(Date.now()-60000).toISOString(),LINE_LINK_CHECK_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),ACCOUNT_ERASURE_ENABLED:'false',LINE_DATA_POLICY_READY:'false',LINE_LOGIN_ENABLED:'false',LINE_SIGNUP_ENABLED:'false',LINE_NOTIFICATIONS_ENABLED:'false',LINE_LOGIN_CHANNEL_ID:'test-client',LINE_LOGIN_CHANNEL_SECRET:'test-secret',LINE_PROVIDER_ID:'test-provider',LINE_MESSAGING_PROVIDER_ID:'test-provider',LINE_MESSAGING_CHANNEL_TOKEN:'test-token',LINE_MESSAGING_CHANNEL_SECRET:'test-webhook',LINE_BOT_USER_ID:BOT,LINE_OFFICIAL_ACCOUNT_ID:'@test-only',LINE_NOTIFY_CRON_TOKEN:'fixture-not-a-secret-token'.repeat(2),LINE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),LINE_TOKEN_KEY_VERSION:'v1',RESEND_API_KEY:'fake-mail',AUTH_FROM_EMAIL:'test@example.com' };
const options={ cf: false, modulesRoot:root+'/dist/server',modules:readdirSync(root+'/dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(p=>({type:'ESModule',path:root+'/dist/server/'+p})),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],assets:{directory:root+'/dist/client',runWorkerFirst:true},d1Databases:{DB:'line-owner-test-integration'},r2Buckets:['AVATARS'],bindings,outboundService:async request=>{
 const url=new URL(request.url);
    if (url.pathname === '/oauth2/v3/token') return mockStatelessToken(request, 'test-client', 'test-secret', 'fake-login-channel-token');
 if(url.hostname==='api.resend.com'){mails.push(await request.json());return Response.json({id:'fake-mail'});}
 if(url.hostname==='oauth2.googleapis.com')return Response.json({id_token:'x.'+Buffer.from(JSON.stringify({email:googleEmail,email_verified:true,name:'Existing Member'})).toString('base64url')+'.x'});
 assert.equal(url.hostname,'api.line.me','no unexpected real network');
 if(url.pathname.endsWith('/token')){const form=new URLSearchParams(await request.text());assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'),challenge);assert.equal(form.get('redirect_uri'),'https://tasuki.club/api/auth/line/callback');const token=`fake-access-${++tokenCount}`;tokens.set(token,subject);tokens.set(`fake-id-${tokenCount}`,subject);return Response.json({id_token:`fake-id-${tokenCount}`,access_token:token,expires_in:3600});}
 if(url.pathname.endsWith('/verify')&&request.method==='POST'){const form=new URLSearchParams(await request.text());assert.equal(form.get('nonce'),nonce);return Response.json({iss:'https://access.line.me',aud:'test-client',exp:Math.floor(Date.now()/1000)+600,iat:Math.floor(Date.now()/1000),nonce,sub:tokens.get(form.get('id_token')),name:'DO_NOT_COPY_LINE_NAME',email:'do-not-copy-line@example.com'});}
 if(url.pathname.endsWith('/verify')){if(delayVerification)await new Promise(resolve=>setTimeout(resolve,2000));const token=url.searchParams.get('access_token');return Response.json({client_id:'test-client',expires_in:3600,scope:'openid'},{status:tokens.has(token)&&!revoked.has(token)?200:400});}
 if(url.pathname.endsWith('/userinfo')){const token=request.headers.get('authorization')?.replace('Bearer ','');return Response.json({sub:tokens.get(token)},{status:revoked.has(token)?401:200});}
 if(url.pathname.includes('friendship')||url.pathname.includes('/profile'))throw new Error('friendship/profile must not be requested');
 if(url.pathname==='/user/v1/deauthorize'){deauthCalls++;assert.equal(request.headers.get('authorization'),'Bearer fake-login-channel-token');const {userAccessToken}=await request.json();assert.ok(tokens.has(userAccessToken));if(deauthStatus===204)revoked.add(userAccessToken);return new Response(null,{status:deauthStatus});}
 if(url.pathname==='/v2/bot/message/push'){pushCalls++;const body=await request.json();assert.equal(body.to,A);assert.equal(body.messages.length,1);assert.match(body.messages[0].text,/本人限定テスト/);assert.doesNotMatch(JSON.stringify(body),/DO_NOT_COPY_LINE_NAME|existing@example.com/);return Response.json({});}
 throw new Error('unmocked LINE path '+url.pathname);
}};
const mf=new Miniflare(options);
try{
 let worker=await mf.getWorker(),db=await mf.getD1Database('DB'); const base=(await mf.ready).origin;let ip=0;
 const fetch=(path,options={})=>worker.fetch(base+path,{redirect:'manual',...options});
 const post=(path,body,cookie='',origin=base,extra={})=>fetch(path,{method:'POST',headers:{origin,cookie,'content-type':'application/json','cf-connecting-ip':'test-'+ip++,...extra},body:JSON.stringify(body)});
 const cookie=(response,name)=>response.headers.getSetCookie().find(s=>s.startsWith(name+'='))?.split(';')[0];
 const combined=(...items)=>items.filter(Boolean).join('; ');
 const parseStart=(response,jsonUrl)=>{assert.equal(response.status,jsonUrl?200:303);const url=new URL(jsonUrl||response.headers.get('location'));assert.equal(url.hostname,'access.line.me',response.headers.get('location'));assert.equal(url.searchParams.get('scope'),'openid','never request profile/email');nonce=url.searchParams.get('nonce');challenge=url.searchParams.get('code_challenge');assert.equal(url.searchParams.get('code_challenge_method'),'S256');return{state:url.searchParams.get('state'),cookie:cookie(response,'line_oauth_browser'),url};};
 const callback=(flow,jar='',query='')=>fetch('/api/auth/line/callback?'+(query||new URLSearchParams({state:flow.state,code:'fake'})),{headers:{cookie:combined(jar,flow.cookie)}});
 const formStart=async(jar,action='link',origin=base)=>{const form=new FormData();form.set('action',action);form.set('consent','yes');form.set('message','yes');form.set('offer','yes');return fetch('/api/auth/line/start',{method:'POST',headers:{origin,cookie:jar,'cf-connecting-ip':'test-'+ip++},body:form});};
 const google=async()=>{const first=await fetch('/api/auth/google/start');const url=new URL(first.headers.get('location'));const result=await fetch('/api/auth/google/callback?state='+url.searchParams.get('state')+'&code=fake',{headers:{cookie:first.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')}});return cookie(result,'member_session');};

 assert.deepEqual(await(await fetch('/api/auth/line/config')).json(),{login:false,signup:false});
 assert.equal((await fetch('/settings/line/check')).status,404);
 await post('/api/register',{action:'draft',consent:true});
 for(const [id,email] of [['existing','existing@example.com'],['other','other@example.com']]) await db.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at,company) VALUES(?,?,'既存会員','active',?,'既存の会社')").bind(id,email,new Date().toISOString()).run();
 await db.prepare("INSERT INTO line_test_budget(test_id,owner_member_id,linked_at,authorization_revision,closed,slot1,slot2,retry1,retry2) VALUES('tasuki-owner-line-test-v1','','','',1,'accepted','unused','old1','old2')").run();
 const oldBudget=await db.prepare('SELECT * FROM line_test_budget').first();
 googleEmail='other@example.com';const otherCookie=await google();
 assert.equal((await fetch('/settings/line/check',{headers:{cookie:otherCookie}})).status,404);
 assert.equal((await formStart(otherCookie,'owner_link_check')).status,404);
 googleEmail='existing@example.com';const ownerCookie=await google();assert.ok(ownerCookie);
 assert.equal((await formStart(ownerCookie,'owner_link_check','https://evil.example')).status,403);
 assert.equal((await formStart(ownerCookie,'test_link')).status,404,'old test stays unavailable');
 assert.match((await formStart(ownerCookie,'link')).headers.get('location'),/line_unconfigured/);
 const page=await fetch('/settings/line/check',{headers:{cookie:ownerCookie}});assert.equal(page.status,200);assert.match(await page.text(),/本人限定LINE接続確認/);
 let flow=parseStart(await formStart(ownerCookie,'owner_link_check'));
 const exchanged=tokenCount;let result=await callback(flow);assert.match(result.headers.get('location'),/line_session/);assert.equal(tokenCount,exchanged);
 flow=parseStart(await formStart(ownerCookie,'owner_link_check'));
 result=await callback(flow,otherCookie);assert.match(result.headers.get('location'),/line_session/);assert.equal(tokenCount,exchanged);
 const noConsent=new FormData();noConsent.set('action','owner_link_check');
 result=await fetch('/api/auth/line/start',{method:'POST',headers:{origin:base,cookie:ownerCookie},body:noConsent});assert.match(result.headers.get('location'),/line_consent/);
 for (const override of [{LINE_LINK_CHECK_EXPIRES_AT:new Date(Date.now()-1).toISOString()}, {LINE_LINK_CHECK_STARTED_AT:new Date(Date.now()-30000).toISOString()}, ...['LINE_DATA_POLICY_READY','LINE_LOGIN_ENABLED','LINE_SIGNUP_ENABLED','LINE_NOTIFICATIONS_ENABLED','ACCOUNT_ERASURE_ENABLED'].map(key=>({[key]:'true'}))]) {
   flow=parseStart(await formStart(ownerCookie,'owner_link_check'));
   const count=tokenCount;
   await mf.setOptions({...options,bindings:{...bindings,...override}});worker=await mf.getWorker();db=await mf.getD1Database('DB');
   result=await callback(flow,ownerCookie);assert.match(result.headers.get('location'),/line_(failed|session)/);assert.equal(tokenCount,count,'reconfigured callback rejected before OAuth');
   assert.equal(await db.prepare("SELECT * FROM line_accounts WHERE member_id='existing'").first(),null);
   await mf.setOptions(options);worker=await mf.getWorker();db=await mf.getD1Database('DB');
 }
 const shortWindow={...bindings,LINE_LINK_CHECK_STARTED_AT:new Date(Date.now()-60000).toISOString(),LINE_LINK_CHECK_EXPIRES_AT:new Date(Date.now()+1500).toISOString()};
 await mf.setOptions({...options,bindings:shortWindow});worker=await mf.getWorker();db=await mf.getD1Database('DB');
 flow=parseStart(await formStart(ownerCookie,'owner_link_check'));delayVerification=true;
 result=await callback(flow,ownerCookie);delayVerification=false;assert.match(result.headers.get('location'),/line_failed/,'expiry during external verification rejected');
 assert.equal(await db.prepare("SELECT * FROM line_accounts WHERE member_id='existing'").first(),null,'expired verification did not save');
 await mf.setOptions(options);worker=await mf.getWorker();db=await mf.getD1Database('DB');
 const jsonStart=await fetch('/api/auth/line/start',{method:'POST',headers:{origin:base,cookie:ownerCookie,accept:'application/json','content-type':'application/x-www-form-urlencoded','cf-connecting-ip':'test-json'},body:new URLSearchParams({action:'owner_link_check',consent:'yes'}).toString()});
 flow=parseStart(jsonStart,(await jsonStart.json()).authorizeUrl);result=await callback(flow,ownerCookie);assert.match(result.headers.get('location'),/settings\/line\/check\?line=linked/);
 assert.equal(cookie(result,'member_session'),undefined);
 const linked=await db.prepare("SELECT * FROM line_accounts WHERE member_id='existing'").first();assert.equal(linked.line_user_id,A);assert.equal(linked.notify_message,0);assert.equal(linked.notify_offer,0);
 assert.equal((await db.prepare("SELECT company FROM members WHERE id='existing'").first()).company,'既存の会社');
 const count=tokenCount;await callback(flow,ownerCookie);assert.equal(tokenCount,count,'OAuth state consumed once');
 subject=B;flow=parseStart(await formStart(ownerCookie,'owner_link_check'));result=await callback(flow,ownerCookie);assert.match(result.headers.get('location'),/line_conflict/);assert.equal((await db.prepare("SELECT line_user_id FROM line_accounts WHERE member_id='existing'").first()).line_user_id,A);
 assert.deepEqual(await db.prepare('SELECT * FROM line_test_budget').first(),oldBudget,'old budget unchanged');
 assert.equal((await post('/api/admin/line-test',{action:'send',slot:2,confirm:true},ownerCookie)).status,404);
 assert.equal(pushCalls,0);assert.equal(mails.length,0);assert.equal(deauthCalls,0);
 assert.deepEqual(await(await fetch('/api/auth/line/config')).json(),{login:false,signup:false});
 console.log('PASS owner link check: real routes/isolated D1; owner/session/Origin/consent/PKCE/state; no public rollout, no mail/push, old budget unchanged');
} finally { await mf.dispose(); }
