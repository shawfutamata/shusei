import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'line-test-budget-'));
let mf;
try {
  await build({stdin:{contents:`import {env} from 'cloudflare:workers'; import {sendLineTestNotice,getLineTestStatus,closeLineTest} from './db/line-test'; import {lineStatements} from './db/line-schema'; export default {async fetch(request){const b=await request.json();try{if(b.action==='init'){await env.DB.exec('CREATE TABLE members(id TEXT PRIMARY KEY,active INTEGER)');for(const sql of lineStatements)await env.DB.prepare(sql).run();return Response.json({});} const result=b.action==='send'?await sendLineTestNotice(b.member,b.slot):b.action==='close'?await closeLineTest(b.member):await getLineTestStatus(b.member);return Response.json(result);}catch{return Response.json({error:'denied'},{status:403});}}};`,resolveDir:resolve('.'),loader:'ts'},outfile:join(dir,'worker.js'),bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],plugins:[{name:'isolate-auth',setup(b){
    b.onResolve({filter:/^(\.\/data|\.\/line-authorization|@\/app\/line-test-config)$/},a=>a.importer.endsWith('/db/line-test.ts')?{path:a.path,namespace:'fixture'}:undefined);
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'ts',contents:a.path==='./data'?`import {env} from 'cloudflare:workers'; export async function ensureDatabase(){} export async function getMembershipAccess(id){return {canUseApp:!!await env.DB.prepare('SELECT 1 FROM members WHERE id=? AND active=1').bind(id).first()};}`:a.path==='./line-authorization'?`export async function checkLineAuthorization(){return (await fetch('https://authorization.fixture.invalid')).status===200?'valid':'invalid';}`:`export const LINE_TEST_ID='tasuki-owner-line-test-v1';export function lineTestReadyForMember(id){return id==='owner';}`}));
  }}]});
  let pushes=0, authStatus=200, pushStatus=200, beforeAuth=async()=>{}, beforePush=async()=>{};
  const destinations=[], retryKeys=[];
  mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.js'),compatibilityDate:'2026-05-22',d1Databases:['DB'],bindings:{LINE_PROVIDER_ID:'provider',LINE_LOGIN_CHANNEL_ID:'channel',LINE_MESSAGING_CHANNEL_TOKEN:'fake-token'},outboundService:async req=>{
    if(req.url==='https://authorization.fixture.invalid/'){await beforeAuth();return new Response('',{status:authStatus});}
    assert.equal(req.url,'https://api.line.me/v2/bot/message/push');assert.equal(req.method,'POST');assert.equal(req.headers.get('authorization'),'Bearer fake-token');
    pushes++;const body=await req.json();destinations.push(body.to);retryKeys.push(req.headers.get('x-line-retry-key'));assert.equal(body.messages.length,1);assert.ok(body.messages[0].text.includes('本人限定テスト'));await beforePush();return new Response('PRIVATE_EXTERNAL_BODY',{status:pushStatus});
  }});
  const db=await mf.getD1Database('DB');
  const call=async(action,slot,member='owner')=>{const r=await mf.dispatchFetch('https://fixture.invalid',{method:'POST',body:JSON.stringify({action,slot,member})});return {status:r.status,body:await r.json()};};
  await call('init');
  const subject=`U${'a'.repeat(32)}`;
  const seed=async()=>{await db.prepare("INSERT OR REPLACE INTO members VALUES('owner',1)").run();await db.prepare(`INSERT OR REPLACE INTO line_accounts(member_id,provider_id,line_user_id,linked_at,consent_version) VALUES('owner','provider',?,'fixture-linked','consent')`).bind(subject).run();await db.prepare(`INSERT INTO line_authorizations(member_id,provider_id,channel_id,subject,ciphertext,iv,key_version,expires_at,status,revision,updated_at) VALUES('owner','provider','channel',?,'fake','fake','v1',?,'active','revision-1',0) ON CONFLICT(member_id) DO UPDATE SET revision='revision-1',status='active',expires_at=excluded.expires_at`).bind(subject,Date.now()+600000).run();};
  const reset=async()=>{await db.prepare('DELETE FROM line_test_budget').run();await seed();pushes=0;authStatus=200;pushStatus=200;beforeAuth=async()=>{};beforePush=async()=>{};};
  await reset();assert.equal((await call('send',1,'other')).status,403);assert.equal(pushes,0);
  assert.equal((await call('send',3)).status,403);assert.equal(pushes,0);
  assert.equal((await call('status')).body.linkedReady,true);
  await Promise.all(Array.from({length:8},()=>call('send',1)));assert.equal(pushes,1);assert.equal((await call('status')).body.slots[0].status,'accepted');
  await Promise.all(Array.from({length:8},()=>call('send',2)));assert.equal(pushes,2);await call('send',1);await call('send',2);assert.equal(pushes,2);
  assert.ok(destinations.every(x=>x===subject));assert.equal(new Set(retryKeys).size,2);
  const raw=JSON.stringify(await db.prepare('SELECT * FROM line_test_budget').all());for(const forbidden of [subject,'fake-token','PRIVATE_EXTERNAL_BODY'])assert.ok(!raw.includes(forbidden));
  await db.prepare("DELETE FROM members WHERE id='owner'").run();await seed();await call('send',1);assert.equal(pushes,2,'member erasure does not reset budget');assert.equal((await db.prepare('SELECT owner_member_id FROM line_test_budget').first()).owner_member_id,'');assert.equal((await call('status')).body.closed,true);
  await reset();await call('close');await call('send',1);assert.equal(pushes,0);assert.equal((await call('status')).body.closed,true);
  await reset();pushStatus=500;await call('send',1);await call('send',1);assert.equal(pushes,1);assert.equal((await call('status')).body.slots[0].status,'unknown');
  await reset();pushStatus=401;await call('send',1);await call('send',1);assert.equal(pushes,1);assert.equal((await call('status')).body.slots[0].status,'failed');
  for(const code of [302,429]) {await reset();pushStatus=code;await call('send',1);await call('send',1);assert.equal(pushes,1);}
  await reset();beforePush=async()=>{throw new Error('PRIVATE_EXTERNAL_BODY');};await call('send',1);await call('send',1);assert.equal(pushes,1);assert.equal((await call('status')).body.slots[0].status,'unknown');
  await reset();authStatus=401;assert.equal((await call('send',1)).status,403);assert.equal(pushes,0);
  await reset();beforeAuth=async()=>{await db.prepare("UPDATE line_authorizations SET revision='changed'").run();};assert.equal((await call('send',1)).status,403);assert.equal(pushes,0);
  await reset();await call('send',1);await db.prepare("UPDATE line_authorizations SET revision='changed'").run();assert.equal((await call('send',2)).status,403);assert.equal(pushes,1);assert.equal((await call('status')).body.linkedReady,false);
  await reset();beforePush=async()=>{await call('close');};await call('send',1);await call('send',2);assert.equal(pushes,1);assert.equal((await call('status')).body.closed,true);assert.equal((await call('status')).body.slots[0].status,'accepted','close does not claim to cancel in-flight request');
  await reset();await db.prepare("UPDATE members SET active=0").run();assert.equal((await call('send',1)).status,403);assert.equal(pushes,0);
  console.log('PASS: isolated D1 budget, concurrent claims, two-request cap, owner restriction, auth/relink races, close/in-flight semantics, erasure persistence, output secrecy. No real LINE requests.');
} finally {if(mf)await mf.dispose();rmSync(dir,{recursive:true,force:true});}
