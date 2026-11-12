import { mockStatelessToken } from './line-stateless-fixture.mjs';
// 実ルート＋隔離D1。LINE/Google/メールは全て偽応答。本番・実通知には触れない。
import { Miniflare } from 'miniflare';
import { Response, FormData } from 'undici';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root=resolve('.'), A='U'+'a'.repeat(32), B='U'+'b'.repeat(32), BOT='U'+'d'.repeat(32);
let subject=A,nonce='',challenge='',googleEmail='existing@example.com',tokenCount=0,deauthStatus=204,deauthCalls=0,pushCalls=0;
const mails=[],tokens=new Map(),revoked=new Set();
const bindings={ AUTH_CODE_PEPPER:'test-only',GOOGLE_CLIENT_ID:'fake-client',GOOGLE_CLIENT_SECRET:'fake-secret',ADMIN_EMAILS:'different-admin@example.com',LINE_TEST_MEMBER_ID:'existing',ACCOUNT_ERASURE_ENABLED:'false',LINE_DATA_POLICY_READY:'false',LINE_LOGIN_ENABLED:'false',LINE_SIGNUP_ENABLED:'false',LINE_NOTIFICATIONS_ENABLED:'false',LINE_LOGIN_CHANNEL_ID:'test-client',LINE_LOGIN_CHANNEL_SECRET:'test-secret',LINE_PROVIDER_ID:'test-provider',LINE_MESSAGING_PROVIDER_ID:'test-provider',LINE_MESSAGING_CHANNEL_TOKEN:'test-token',LINE_MESSAGING_CHANNEL_SECRET:'test-webhook',LINE_BOT_USER_ID:BOT,LINE_OFFICIAL_ACCOUNT_ID:'@test-only',LINE_NOTIFY_CRON_TOKEN:'fixture-not-a-secret-token'.repeat(2),LINE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),LINE_TOKEN_KEY_VERSION:'v1',RESEND_API_KEY:'fake-mail',AUTH_FROM_EMAIL:'test@example.com' };
const mf=new Miniflare({ modulesRoot:root+'/dist/server',modules:readdirSync(root+'/dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(p=>({type:'ESModule',path:root+'/dist/server/'+p})),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],assets:{directory:root+'/dist/client',runWorkerFirst:true},d1Databases:{DB:'line-owner-test-integration'},r2Buckets:['AVATARS'],bindings,outboundService:async request=>{
 const url=new URL(request.url);
    if (url.pathname === '/oauth2/v3/token') return mockStatelessToken(request, 'test-client', 'test-secret', 'fake-login-channel-token');
 if(url.hostname==='api.resend.com'){mails.push(await request.json());return Response.json({id:'fake-mail'});}
 if(url.hostname==='oauth2.googleapis.com')return Response.json({id_token:'x.'+Buffer.from(JSON.stringify({email:googleEmail,email_verified:true,name:'Existing Member'})).toString('base64url')+'.x'});
 assert.equal(url.hostname,'api.line.me','no unexpected real network');
 if(url.pathname.endsWith('/token')){const form=new URLSearchParams(await request.text());assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'),challenge);assert.equal(form.get('redirect_uri'),'https://tasuki.club/api/auth/line/callback');const token=`fake-access-${++tokenCount}`;tokens.set(token,subject);tokens.set(`fake-id-${tokenCount}`,subject);return Response.json({id_token:`fake-id-${tokenCount}`,access_token:token,expires_in:3600});}
 if(url.pathname.endsWith('/verify')&&request.method==='POST'){const form=new URLSearchParams(await request.text());assert.equal(form.get('nonce'),nonce);return Response.json({iss:'https://access.line.me',aud:'test-client',exp:Math.floor(Date.now()/1000)+600,iat:Math.floor(Date.now()/1000),nonce,sub:tokens.get(form.get('id_token')),name:'DO_NOT_COPY_LINE_NAME',email:'do-not-copy-line@example.com'});}
 if(url.pathname.endsWith('/verify')){const token=url.searchParams.get('access_token');return Response.json({client_id:'test-client',expires_in:3600,scope:'openid'},{status:tokens.has(token)&&!revoked.has(token)?200:400});}
 if(url.pathname.endsWith('/userinfo')){const token=request.headers.get('authorization')?.replace('Bearer ','');return Response.json({sub:tokens.get(token)},{status:revoked.has(token)?401:200});}
 if(url.pathname.includes('friendship')||url.pathname.includes('/profile'))throw new Error('friendship/profile must not be requested');
 if(url.pathname==='/user/v1/deauthorize'){deauthCalls++;assert.equal(request.headers.get('authorization'),'Bearer fake-login-channel-token');const {userAccessToken}=await request.json();assert.ok(tokens.has(userAccessToken));if(deauthStatus===204)revoked.add(userAccessToken);return new Response(null,{status:deauthStatus});}
 if(url.pathname==='/v2/bot/message/push'){pushCalls++;const body=await request.json();assert.equal(body.to,A);assert.equal(body.messages.length,1);assert.match(body.messages[0].text,/本人限定テスト/);assert.doesNotMatch(JSON.stringify(body),/DO_NOT_COPY_LINE_NAME|existing@example.com/);return Response.json({});}
 throw new Error('unmocked LINE path '+url.pathname);
}});
try{
 const worker=await mf.getWorker(),db=await mf.getD1Database('DB'),base=(await mf.ready).origin;let ip=0;
 const fetch=(path,options={})=>worker.fetch(base+path,{redirect:'manual',...options});
 const post=(path,body,cookie='',origin=base,extra={})=>fetch(path,{method:'POST',headers:{origin,cookie,'content-type':'application/json','cf-connecting-ip':'test-'+ip++,...extra},body:JSON.stringify(body)});
 const cookie=(response,name)=>response.headers.getSetCookie().find(s=>s.startsWith(name+'='))?.split(';')[0];
 const combined=(...items)=>items.filter(Boolean).join('; ');
 const code=()=>JSON.stringify(mails.at(-1)).match(/(?:確認コード:? |確認コード: )(\d{6})/)?.[1]||JSON.stringify(mails.at(-1)).match(/\b\d{6}\b/)[0];
 const parseStart=response=>{assert.equal(response.status,303);const url=new URL(response.headers.get('location'));assert.equal(url.hostname,'access.line.me',response.headers.get('location'));assert.equal(url.searchParams.get('scope'),'openid','never request profile/email');nonce=url.searchParams.get('nonce');challenge=url.searchParams.get('code_challenge');assert.equal(url.searchParams.get('code_challenge_method'),'S256');return{state:url.searchParams.get('state'),cookie:cookie(response,'line_oauth_browser'),url};};
 const callback=(flow,jar='',query='')=>fetch('/api/auth/line/callback?'+(query||new URLSearchParams({state:flow.state,code:'fake'})),{headers:{cookie:combined(jar,flow.cookie)}});
 const formStart=async(jar,action='link',origin=base)=>{const form=new FormData();form.set('action',action);form.set('consent','yes');form.set('message','yes');form.set('offer','yes');return fetch('/api/auth/line/start',{method:'POST',headers:{origin,cookie:jar,'cf-connecting-ip':'test-'+ip++},body:form});};
 const google=async()=>{const first=await fetch('/api/auth/google/start');const url=new URL(first.headers.get('location'));const result=await fetch('/api/auth/google/callback?state='+url.searchParams.get('state')+'&code=fake',{headers:{cookie:first.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')}});return cookie(result,'member_session');};

 assert.deepEqual(await(await fetch('/api/auth/line/config')).json(),{login:false,signup:false});
 assert.equal((await fetch('/api/admin/line-test')).status,404);
 await post('/api/register',{action:'draft',consent:true});
 for(const [id,email] of [['existing','existing@example.com'],['other','other@example.com']]) await db.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at,company) VALUES(?,?,'既存会員','active',?,'既存の会社')").bind(id,email,new Date().toISOString()).run();
 googleEmail='other@example.com';const otherCookie=await google();
 assert.equal((await fetch('/api/admin/line-test',{headers:{cookie:otherCookie}})).status,404);
 assert.equal((await formStart(otherCookie,'test_link')).status,404);
 googleEmail='existing@example.com';const ownerCookie=await google();assert.ok(ownerCookie);
 assert.equal((await formStart(ownerCookie,'test_link','https://evil.example')).status,403);
 assert.match((await formStart(ownerCookie,'link')).headers.get('location'),/line_unconfigured/);
 assert.match((await formStart(ownerCookie,'preferences')).headers.get('location'),/line_unconfigured/);
 assert.match((await fetch('/api/auth/line/start?signup=1')).headers.get('location'),/line_unconfigured/);
 let flow=parseStart(await formStart(ownerCookie,'test_link'));
 const exchanged=tokenCount;let result=await callback(flow);assert.match(result.headers.get('location'),/line_session/);assert.equal(tokenCount,exchanged,'wrong session rejected before exchanging OAuth code');
 flow=parseStart(await formStart(ownerCookie,'test_link'));result=await callback(flow,ownerCookie);assert.match(result.headers.get('location'),/admin\/line-test\?line=linked/);
 assert.equal(cookie(result,'member_session'),undefined,'test link cannot become public LINE login');
 const linked=await db.prepare("SELECT * FROM line_accounts WHERE member_id='existing'").first();assert.equal(linked.line_user_id,A);assert.equal(linked.notify_message,0);assert.equal(linked.notify_offer,0);
 assert.equal((await db.prepare("SELECT company FROM members WHERE id='existing'").first()).company,'既存の会社');
 const page=await fetch('/admin/line-test',{headers:{cookie:ownerCookie}});assert.equal(page.status,200);assert.match(await page.text(),/LINE本人限定テスト/);
 const initial=await(await fetch('/api/admin/line-test',{headers:{cookie:ownerCookie}})).json();assert.equal(initial.linkedReady,true);assert.deepEqual(initial.slots.map(x=>x.status),['unused','unused']);
 assert.equal((await post('/api/admin/line-test',{action:'send',slot:1,confirm:true},otherCookie)).status,404);
 assert.equal((await post('/api/admin/line-test',{action:'send',slot:1,confirm:true,to:B},ownerCookie)).status,400);
 assert.equal((await post('/api/admin/line-test',{action:'send',slot:1,confirm:false},ownerCookie)).status,400);
 assert.equal(pushCalls,0);
 let sent=await post('/api/admin/line-test',{action:'send',slot:1,confirm:true},ownerCookie);assert.equal(sent.status,200,await sent.clone().text());assert.equal((await sent.json()).slots[0].status,'accepted');assert.equal(pushCalls,1);
 await Promise.all(Array.from({length:4},()=>post('/api/admin/line-test',{action:'send',slot:1,confirm:true},ownerCookie)));assert.equal(pushCalls,1,'same slot never re-sent');
 sent=await post('/api/admin/line-test',{action:'send',slot:2,confirm:true},ownerCookie);assert.equal(sent.status,200);assert.equal((await sent.json()).slots[1].status,'accepted');assert.equal(pushCalls,2);
 const cron=await post('/api/admin/line-notifications',{},'',base,{authorization:'Bearer '+bindings.LINE_NOTIFY_CRON_TOKEN});assert.deepEqual(await cron.json(),{enabled:false,attempted:0,accepted:0});assert.equal(pushCalls,2);
 assert.equal((await post('/api/admin/line-test',{action:'close',confirm:true},ownerCookie)).status,200);
 assert.equal((await(await post('/api/admin/line-test',{action:'send',slot:1,confirm:true},ownerCookie)).json()).closed,true);assert.equal(pushCalls,2);
 assert.match((await formStart(ownerCookie,'test_link')).headers.get('location'),/line_failed/,'closed test cannot relink');
 assert.equal((await post('/api/account/privacy',{action:'request',purpose:'unlink',consent:true},ownerCookie)).status,200);assert.equal(mails.length,1);assert.match(JSON.stringify(mails[0]),/existing@example.com/);
 const unlink=await post('/api/account/privacy',{action:'confirm',purpose:'unlink',confirm:true,code:code()},ownerCookie);assert.equal(unlink.status,200,await unlink.clone().text());assert.equal((await unlink.json()).done,true);assert.equal(deauthCalls,1);
 assert.equal(await db.prepare("SELECT * FROM line_accounts WHERE member_id='existing'").first(),null);assert.ok(await db.prepare("SELECT id FROM members WHERE id='existing'").first());assert.ok(await db.prepare('SELECT test_id FROM line_test_budget').first());
 assert.equal(pushCalls,2);assert.equal(mails.length,1);assert.deepEqual(await(await fetch('/api/auth/line/config')).json(),{login:false,signup:false});
 console.log('PASS: real HTTP owner-only test_link/admin API; all rollout flags false; other members denied; consent+Origin+session binding; exactly two mocked pushes, one mocked mail; cron disabled; closure/unlink do not restore budget. No live LINE or mail.');
} finally { await mf.dispose(); }
