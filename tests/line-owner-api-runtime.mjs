// 運営本人の限定テストAPI。認証/設定判定は実コード、送信コアと会員セッションだけ偽応答。
import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'line-owner-api-'));
const full = { ADMIN_EMAILS:'owner@example.invalid,other-admin@example.invalid', FIXTURE_EMAIL:'owner@example.invalid', FIXTURE_MEMBER:'owner', LINE_TEST_MEMBER_ID:'owner', LINE_PROVIDER_ID:'provider', LINE_MESSAGING_PROVIDER_ID:'provider', LINE_LOGIN_CHANNEL_ID:'channel', LINE_LOGIN_CHANNEL_SECRET:'secret', LINE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'), LINE_TOKEN_KEY_VERSION:'v1', LINE_MESSAGING_CHANNEL_TOKEN:'fake-token', LINE_MESSAGING_CHANNEL_SECRET:'fake-secret', LINE_BOT_USER_ID:`U${'a'.repeat(32)}`, LINE_OFFICIAL_ACCOUNT_ID:'@fixture', LINE_DATA_POLICY_READY:'false', LINE_LOGIN_ENABLED:'false', LINE_SIGNUP_ENABLED:'false', LINE_NOTIFICATIONS_ENABLED:'false', ACCOUNT_ERASURE_ENABLED:'false' };
try {
 const built = await build({stdin:{contents:"import {GET,POST} from './app/api/admin/line-test/route';export default {fetch(r){return r.method==='GET'?GET():POST(r);}}",resolveDir:resolve('.'),loader:'ts'},outfile:join(dir,'worker.js'),bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],metafile:true,plugins:[{name:'fixture-boundaries',setup(b){
  b.onResolve({filter:/^\.\/app-auth$/},a=>a.importer.endsWith('/app/admin-auth.ts')?{path:'session',namespace:'fixture'}:undefined);
  b.onResolve({filter:/^@\/db\/line-test$/},()=>({path:'core',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'ts',contents:a.path==='session'?"import {env} from 'cloudflare:workers';export async function getAppAccess(){return env.FIXTURE_EMAIL?{user:{userId:env.FIXTURE_MEMBER,email:env.FIXTURE_EMAIL}}:null;}":"export async function getLineTestStatus(id){return {core:'status',id};} export async function sendLineTestNotice(id,slot){return {core:'send',id,slot};} export async function closeLineTest(id){return {core:'close',id};}"}));
 }}]});
 for(const file of ['app/admin-auth.ts','app/admin-emails.ts','app/line-test-config.ts','app/line-auth.ts','db/line-token-crypto.ts'])assert.ok(built.metafile.inputs[file],file);
 const cases=[];
 const add=(name,overrides,method='GET',body=undefined,status=404,expected=undefined,origin='https://fixture.invalid')=>cases.push({name,overrides,method,body,status,expected,origin});
 add('anonymous',{FIXTURE_EMAIL:''});add('ordinary member',{FIXTURE_EMAIL:'member@example.invalid'});add('other admin',{FIXTURE_EMAIL:'other-admin@example.invalid',FIXTURE_MEMBER:'other'});add('empty allowlist',{ADMIN_EMAILS:''});
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
 let network=0;
 for(const test of cases){
  const mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.js'),compatibilityDate:'2026-05-22',bindings:{...full,...test.overrides},outboundService(){network++;throw new Error('No real outbound permitted');}});
  try{
   const headers={};if(test.origin)headers.origin=test.origin;
   const response=await mf.dispatchFetch('https://fixture.invalid/api/admin/line-test',{method:test.method,headers,...(test.method==='POST'?{body:typeof test.body==='string'?test.body:JSON.stringify(test.body)}:{})});
   const text=await response.text(),body=JSON.parse(text);
   assert.equal(response.status,test.status,test.name);
   if(test.expected)assert.deepEqual(body,test.expected,test.name);else assert.equal(body.core,undefined,test.name);
   assert.ok(response.headers.get('cache-control').includes('no-store'));
   assert.ok(!text.includes('fake-token')&&!text.includes('fake-secret'));
  }finally{await mf.dispose();}
 }
 assert.equal(network,0);
 console.log(`PASS: ${cases.length} owner-only API/auth/config cases, real admin/helper wiring; all public flags false; origin/input/owner fail closed; no LINE/mail/production calls.`);
}finally{rmSync(dir,{recursive:true,force:true});}
