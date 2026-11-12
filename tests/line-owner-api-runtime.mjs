// 指定会員本人の限定テストAPI。共通admin権限は増やさず、認証/設定判定は実コードを使う。
import { Response } from 'undici';
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'line-owner-api-'));
const full = { ADMIN_EMAILS:'other-admin@example.invalid', FIXTURE_EMAIL:'owner@example.invalid', FIXTURE_MEMBER:'owner', LINE_TEST_MEMBER_ID:'owner', LINE_PROVIDER_ID:'provider', LINE_MESSAGING_PROVIDER_ID:'provider', LINE_LOGIN_CHANNEL_ID:'channel', LINE_LOGIN_CHANNEL_SECRET:'secret', LINE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'), LINE_TOKEN_KEY_VERSION:'v1', LINE_MESSAGING_CHANNEL_TOKEN:'fake-token', LINE_MESSAGING_CHANNEL_SECRET:'fake-secret', LINE_BOT_USER_ID:`U${'a'.repeat(32)}`, LINE_OFFICIAL_ACCOUNT_ID:'@fixture', LINE_DATA_POLICY_READY:'false', LINE_LOGIN_ENABLED:'false', LINE_SIGNUP_ENABLED:'false', LINE_NOTIFICATIONS_ENABLED:'false', ACCOUNT_ERASURE_ENABLED:'false' };
try {
 const built = await build({stdin:{contents:"import {GET,POST} from './app/api/admin/line-test/route';import {GET as connection} from './app/api/admin/line-connection/route';import {getAdmin} from './app/admin-auth';export default {async fetch(r){const p=new URL(r.url).pathname;if(p==='/connection')return connection();if(p==='/admin-guard')return Response.json({admin:!!await getAdmin()});return r.method==='GET'?GET():POST(r);}}",resolveDir:resolve('.'),loader:'ts'},outfile:join(dir,'worker.js'),bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],metafile:true,plugins:[{name:'fixture-boundaries',setup(b){
  b.onResolve({filter:/^\.\/app-auth$/},a=>['/app/admin-auth.ts','/app/line-test-auth.ts'].some(path=>a.importer.endsWith(path))?{path:'session',namespace:'fixture'}:undefined);
  b.onResolve({filter:/^@\/db\/line-test$/},()=>({path:'core',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'ts',contents:a.path==='session'?"import {env} from 'cloudflare:workers';export async function getAppAccess(){return env.FIXTURE_EMAIL?{user:{userId:env.FIXTURE_MEMBER,email:env.FIXTURE_EMAIL},membership:{canUseApp:env.FIXTURE_ACTIVE!=='false'}}:null;}":"export async function getLineTestStatus(id){return {core:'status',id};} export async function sendLineTestNotice(id,slot){return {core:'send',id,slot};} export async function closeLineTest(id){return {core:'close',id};}"}));
 }}]});
 for(const file of ['app/admin-auth.ts','app/admin-emails.ts','app/line-test-config.ts','app/line-test-auth.ts','app/line-auth.ts','db/line-token-crypto.ts'])assert.ok(built.metafile.inputs[file],file);
 const cases=[];
 const add=(name,overrides,method='GET',body=undefined,status=404,expected=undefined,origin='https://fixture.invalid',path='/api/admin/line-test',calls=0)=>cases.push({name,overrides,method,body,status,expected,origin,path,calls});
 add('anonymous',{FIXTURE_EMAIL:''});add('ordinary member',{FIXTURE_EMAIL:'member@example.invalid',FIXTURE_MEMBER:'other'});add('other admin',{FIXTURE_EMAIL:'other-admin@example.invalid',FIXTURE_MEMBER:'other'});add('inactive owner',{FIXTURE_ACTIVE:'false'});
 add('empty admin allowlist does not block designated owner',{ADMIN_EMAILS:''},'GET',undefined,200,{core:'status',id:'owner'});
 for(const key of ['LINE_TEST_MEMBER_ID','LINE_PROVIDER_ID','LINE_LOGIN_CHANNEL_ID','LINE_LOGIN_CHANNEL_SECRET','LINE_TOKEN_ENCRYPTION_KEY','LINE_TOKEN_KEY_VERSION','LINE_MESSAGING_CHANNEL_TOKEN','LINE_MESSAGING_CHANNEL_SECRET','LINE_BOT_USER_ID','LINE_OFFICIAL_ACCOUNT_ID'])add(`missing ${key}`,{[key]:''});
 for(const key of ['LINE_DATA_POLICY_READY','LINE_LOGIN_ENABLED','LINE_SIGNUP_ENABLED','LINE_NOTIFICATIONS_ENABLED','ACCOUNT_ERASURE_ENABLED'])for(const value of ['true','','False',' false'])add(`gate ${key} ${value}`,{[key]:value});
 for(const overrides of [{LINE_TEST_MEMBER_ID:'other'},{LINE_TEST_MEMBER_ID:'owner '},{LINE_TEST_MEMBER_ID:'x'.repeat(201)},{LINE_MESSAGING_PROVIDER_ID:'another'},{LINE_MESSAGING_CHANNEL_TOKEN:'bad\nheader'},{LINE_BOT_USER_ID:'Ubad'},{LINE_OFFICIAL_ACCOUNT_ID:'bad'},{LINE_TOKEN_ENCRYPTION_KEY:'not-base64'}])add('malformed setting',overrides);
 add('owner read',{},'GET',undefined,200,{core:'status',id:'owner'});
 add('owner slot1',{},'POST',{action:'send',slot:1,confirm:true},200,{core:'send',id:'owner',slot:1});
 add('owner slot2',{},'POST',{action:'send',slot:2,confirm:true},200,{core:'send',id:'owner',slot:2});
 add('owner close',{},'POST',{action:'close',confirm:true},200,{core:'close',id:'owner'});
 add('foreign origin',{},'POST',{action:'send',slot:1,confirm:true},403,undefined,'https://other.invalid');
 add('missing origin',{},'POST',{action:'send',slot:1,confirm:true},403,undefined,'');
 add('other-admin send',{FIXTURE_EMAIL:'other-admin@example.invalid',FIXTURE_MEMBER:'other'},'POST',{action:'send',slot:1,confirm:true});
 for(const body of [{action:'send',slot:1,confirm:false},{action:'send',slot:'1',confirm:true},{action:'send',slot:3,confirm:true},{action:'send',slot:1,confirm:true,to:'someone'},{action:'send',slot:1,confirm:true,memberId:'other'},{action:'send',slot:1,confirm:true,text:'changed'},[],null,{action:'retry',confirm:true},{action:'send',slot:1}])add('invalid request',{},'POST',body,400);
 add('oversized request',{},'POST','x'.repeat(501),400);
 add('invalid JSON',{},'POST','{',503);
 const bot={ok:true,botUserId:full.LINE_BOT_USER_ID,basicId:'@fixture',botIdMatches:true};
 add('designated owner is not an admin',{},'GET',undefined,200,{admin:false},'https://fixture.invalid','/admin-guard');
 add('existing other admin stays admin',{FIXTURE_EMAIL:'other-admin@example.invalid',FIXTURE_MEMBER:'other'},'GET',undefined,200,{admin:true},'https://fixture.invalid','/admin-guard');
 add('designated owner diagnosis',{},'GET',undefined,200,bot,'https://fixture.invalid','/connection',1);
 add('owner can discover missing Bot ID',{LINE_BOT_USER_ID:''},'GET',undefined,200,{...bot,botIdMatches:null},'https://fixture.invalid','/connection',1);
 add('other admin diagnosis remains allowed',{FIXTURE_EMAIL:'other-admin@example.invalid',FIXTURE_MEMBER:'other',LINE_TEST_MEMBER_ID:''},'GET',undefined,200,bot,'https://fixture.invalid','/connection',1);
 add('ordinary member cannot diagnose',{FIXTURE_MEMBER:'other',FIXTURE_EMAIL:'member@example.invalid'},'GET',undefined,404,undefined,'https://fixture.invalid','/connection');
 add('inactive owner cannot diagnose',{FIXTURE_ACTIVE:'false'},'GET',undefined,404,undefined,'https://fixture.invalid','/connection');
 add('owner not selected cannot diagnose',{LINE_TEST_MEMBER_ID:''},'GET',undefined,404,undefined,'https://fixture.invalid','/connection');
 add('owner flags changed cannot diagnose',{LINE_LOGIN_ENABLED:'true'},'GET',undefined,404,undefined,'https://fixture.invalid','/connection');
 let network=0;
 for(const test of cases){
  let calls=0;
  const mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.js'),compatibilityDate:'2026-05-22',bindings:{...full,...test.overrides},outboundService(request){network++;calls++;assert.equal(request.url,'https://api.line.me/v2/bot/info');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer fake-token');return Response.json({userId:full.LINE_BOT_USER_ID,basicId:'@fixture',displayName:'PRIVATE_PROFILE',pictureUrl:'PRIVATE_PROFILE'});}});
  try{
   const headers={};if(test.origin)headers.origin=test.origin;
   const response=await mf.dispatchFetch('https://fixture.invalid'+test.path,{method:test.method,headers,...(test.method==='POST'?{body:typeof test.body==='string'?test.body:JSON.stringify(test.body)}:{})});
   const text=await response.text(),body=JSON.parse(text);
   assert.equal(response.status,test.status,test.name);
   if(test.expected)assert.deepEqual(body,test.expected,test.name);else assert.equal(body.core,undefined,test.name);
   if(test.path!=='/admin-guard')assert.ok(response.headers.get('cache-control').includes('no-store'));
   assert.equal(calls,test.calls,test.name);
   assert.ok(!text.includes('fake-token')&&!text.includes('fake-secret')&&!text.includes('PRIVATE_PROFILE'));
  }finally{await mf.dispose();}
 }
 assert.equal(network,cases.reduce((sum,item)=>sum+item.calls,0));
 console.log(`PASS: ${cases.length} owner-only API/auth/config cases, real owner/admin/helper wiring; no admin expansion; flags/origin/input/owner fail closed; diagnosis only mocked; no real LINE/mail/production calls.`);
}finally{rmSync(dir,{recursive:true,force:true});}
