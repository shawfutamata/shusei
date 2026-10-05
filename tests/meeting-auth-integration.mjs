import {Miniflare} from 'miniflare';
import {Response} from 'undici';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve('.');let otp='';
const mf=new Miniflare({modulesRoot:root+'/dist/server',modules:readdirSync(root+'/dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(p=>({type:'ESModule',path:root+'/dist/server/'+p})),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],assets:{directory:root+'/dist/client',runWorkerFirst:true},d1Databases:{DB:'auth-integration'},r2Buckets:['AVATARS'],bindings:{AUTH_CODE_PEPPER:'test-pepper',RESEND_API_KEY:'test',AUTH_FROM_EMAIL:'test@example.com',GOOGLE_CLIENT_ID:'fake-client',GOOGLE_CLIENT_SECRET:'fake-secret'},outboundService:async request=>{
 const u=new URL(request.url);
 if(u.hostname==='api.resend.com'){const b=await request.json();otp=b.html.match(/>(\d{6})</)[1];return new Response('{}');}
 if(u.hostname==='oauth2.googleapis.com')return new Response(JSON.stringify({id_token:'x.'+Buffer.from(JSON.stringify({email:'google@example.com',email_verified:true,name:'Google User'})).toString('base64url')+'.x'}),{headers:{'content-type':'application/json'}});
 if(u.hostname==='openidconnect.googleapis.com')return new Response(JSON.stringify({email:'google@example.com',email_verified:true,name:'Google User'}),{headers:{'content-type':'application/json'}});
 return new Response('Denied',{status:403});
}});
try {
 const worker=await mf.getWorker(),db=await mf.getD1Database('DB');
 const base=(await mf.ready).origin;
 const fetch=(path,options={})=>worker.fetch(base+path,{redirect:'manual',...options});
 await fetch('/meeting/missing');
 await db.prepare('INSERT INTO meeting_events(id,title,venue,closes_at,state,created_at) VALUES(?,?,?,?,?,?)').bind('fixture','Test Meeting','Venue',Date.now()+3600000,'open',Date.now()).run();
 const profile={name:'回答者',company:'会社',industry:'印刷',services:'チラシの印刷',area:'東京',table:''};
 await db.prepare('INSERT INTO meeting_roster VALUES(?,?,?,?)').bind('person','fixture',JSON.stringify(profile),'回答者').run();
 await db.prepare('INSERT INTO meeting_roster VALUES(?,?,?,?)').bind('googleperson','fixture',JSON.stringify({...profile,name:'Google回答者',company:'Google会社'}),'google回答者').run();
 const page=await fetch('/meeting/fixture');assert.equal(page.status,200);assert.match(await page.text(),/Googleで進む/);
 assert.equal((await fetch('/api/meeting/fixture?people=1')).status,401);
 const post=(body,cookie='')=>fetch('/api/meeting/fixture/account',{method:'POST',headers:{origin:base,'content-type':'application/json',cookie},body:JSON.stringify(body)});
 const mail=await post({action:'request',email:'new@example.com',consent:true,rosterId:'person',profile});assert.equal(mail.status,200,await mail.text());
 const verified=await post({action:'verify',email:'new@example.com',consent:true,code:otp});assert.equal(verified.status,200,await verified.text());
 const cookie=verified.headers.get('set-cookie').split(';')[0];assert.match(cookie,/member_session=/);
 const authed=await fetch('/meeting/fixture',{headers:{cookie}});assert.equal(authed.status,200);assert.match(await authed.text(),/どんな業種・相手とつながりたいですか/);
 // Answer receipt in Authorization must not override the authenticated session cookie.
 assert.equal((await fetch('/api/meeting/fixture',{headers:{cookie,authorization:'Bearer '+'a'.repeat(64)}})).status,404);
 const draftResponse=await post({action:'draft',consent:true,rosterId:'googleperson',profile:{...profile,name:'Google回答者',company:'Google会社'}});assert.equal(draftResponse.status,200);const {draft}=await draftResponse.json();
 const submitted=await fetch('/api/meeting/fixture',{method:'POST',headers:{origin:base,cookie,'content-type':'application/json'},body:JSON.stringify({rosterId:'person',need:'チラシの印刷',token:'a'.repeat(64),consent:true})});assert.equal(submitted.status,200,await submitted.text());
 const mine=await fetch('/api/meeting/fixture?mine=1',{headers:{cookie}});assert.equal(mine.status,200);assert.equal((await mine.json()).answer.need,'チラシの印刷');
 await db.prepare("UPDATE members SET membership_status='active' WHERE email='new@example.com'").run();
 const m=await db.prepare("SELECT id FROM members WHERE email='new@example.com'").first();const memberProfile=await fetch('/api/members/'+m.id,{headers:{cookie}});assert.equal(memberProfile.status,200);assert.equal((await memberProfile.json()).company,'会社');
 const contactPage=await fetch('/?contact='+m.id,{headers:{cookie}});assert.equal(contactPage.status,200);assert.doesNotMatch(await contactPage.text(),/まだ利用権限がありません/);
 const start=await fetch('/api/auth/google/start?meeting=fixture&draft='+draft+'&return_to=%2Fmeeting%2Ffixture');assert.equal(start.status,307);
 const cookies=start.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),state=new URL(start.headers.get('location')).searchParams.get('state');
 const callback=await fetch('/api/auth/google/callback?state='+state+'&code=fake',{headers:{cookie:cookies}});assert.equal(callback.status,307);assert.equal(callback.headers.get('location'),base+'/meeting/fixture');assert.match(callback.headers.get('set-cookie'),/member_session=/);
 assert.equal((await db.prepare("SELECT email FROM members WHERE email='google@example.com'").all()).results.length,1);
 assert.equal((await fetch('/api/auth/google/start?meeting=nonexistent')).status,404);
 const directPage=await fetch('/register');assert.equal(directPage.status,200);assert.match(await directPage.text(),/Googleで登録/);
 const directPost=(body)=>fetch('/api/register',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)});
 const requested=await directPost({action:'request',consent:true,email:'lp@example.com',profile});assert.equal(requested.status,200,await requested.text());const done=await directPost({action:'verify',consent:true,email:'lp@example.com',code:otp});assert.equal(done.status,200,await done.text());
 const pending=await fetch('/register/complete',{headers:{cookie:done.headers.get('set-cookie').split(';')[0]}});assert.equal(pending.status,200);const pendingHtml=await pending.text();assert.match(pendingHtml,/アカウント登録を受け付けました/);assert.match(pendingHtml,/現在、運営確認待ちです/);
 console.log('Passed full application: signup UI, email session cookie, authenticated survey, receipt separation, Google registration and exact return destination.');
}finally{await mf.dispose();}
