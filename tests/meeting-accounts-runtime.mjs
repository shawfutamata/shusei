import {Miniflare} from 'miniflare';
import {Response} from 'undici';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'tasuki-account-test-'));
const {build}=await import('esbuild');
await build({entryPoints:[resolve('tests/meeting-account-worker.ts')],outfile:join(dir,'meeting-account-worker.js'),bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],tsconfig:resolve('tsconfig.json'),define:{'import.meta.env.DEV':'false'}});
let deliveredCode='',deliveryFails=false;
const mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:join(dir,'meeting-account-worker.js'),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'meeting-account-test'},bindings:{AUTH_CODE_PEPPER:'isolated-test-pepper',RESEND_API_KEY:'test-only',AUTH_FROM_EMAIL:'test@example.com'},outboundService:async request=>{assert.equal(new URL(request.url).hostname,'api.resend.com');const data=await request.json();deliveredCode=data.html.match(/>(\d{6})</)[1];return new Response('{}',{status:deliveryFails?500:200});}});
try {
 const worker=await mf.getWorker(),db=await mf.getD1Database('DB');
 async function call(action,email='new@example.com',code='',event='event-a',token='') {const r=await worker.fetch('https://test.example.com/',{method:'POST',body:JSON.stringify({action,email,code,event,token})});return {status:r.status,body:await r.json()};}
 assert.equal((await call('request')).status,200);
 assert.equal(await db.prepare('SELECT id FROM members WHERE email=?').bind('new@example.com').first(),null,'must not register before verification');
 assert.equal((await call('request')).status,400,'resend cooldown');
 const otp=deliveredCode;
 assert.equal((await call('verify','new@example.com',otp,'event-b')).status,400,'wrong event');
 assert.equal((await call('verify','new@example.com','xxxxxx')).status,400);
 const verified=await call('verify','new@example.com',otp);assert.equal(verified.status,200,JSON.stringify(verified.body));
 const session=await call('access','','','',verified.body.token);assert.equal(session.body.user.email,'new@example.com');assert.equal(session.body.membership.status,'invited');
 assert.equal((await call('verify','new@example.com',otp)).status,400,'single use');
 const existing=await call('google');assert.equal(existing.status,200);assert.equal((await db.prepare('SELECT id FROM members WHERE email=?').bind('new@example.com').all()).results.length,1,'reuse account');
 await call('request','expired@example.com');await db.prepare("UPDATE meeting_registration_codes SET expires_at='2000-01-01' WHERE email='expired@example.com'").run();assert.equal((await call('verify','expired@example.com',deliveredCode)).status,400);
 await call('request','attempts@example.com');const validCode=deliveredCode;for(let i=0;i<5;i++)await call('verify','attempts@example.com',validCode==='000000'?'111111':'000000');assert.equal((await call('verify','attempts@example.com',validCode)).status,400,'five attempts');
 await db.prepare("UPDATE members SET membership_status='canceled' WHERE email='new@example.com'").run();assert.equal((await call('google')).status,400,'blocked account stays blocked');
 deliveryFails=true;assert.equal((await call('request','failed@example.com')).status,400);assert.equal(await db.prepare("SELECT email FROM meeting_registration_codes WHERE email='failed@example.com'").first(),null,'delivery failure cleared');
 console.log('Passed: verified email registration, existing Google account reuse, valid shared session, pending membership preservation, cooldown, wrong event, replay, expiry, attempts, canceled membership and delivery failure.');
}finally{await mf.dispose();rmSync(dir,{recursive:true,force:true});}
