import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'line-check-gates-'));
const now=Date.now(), start=new Date(now-60000).toISOString(), end=new Date(now+60000).toISOString();
const full={LINE_LINK_CHECK_MEMBER_ID:'owner',LINE_LINK_CHECK_STARTED_AT:start,LINE_LINK_CHECK_EXPIRES_AT:end,LINE_PROVIDER_ID:'provider',LINE_LOGIN_CHANNEL_ID:'channel',LINE_LOGIN_CHANNEL_SECRET:'secret',LINE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),LINE_TOKEN_KEY_VERSION:'v1',LINE_DATA_POLICY_READY:'false',LINE_LOGIN_ENABLED:'false',LINE_SIGNUP_ENABLED:'false',LINE_NOTIFICATIONS_ENABLED:'false',ACCOUNT_ERASURE_ENABLED:'false'};
try {
 await build({stdin:{contents:"import {lineLinkCheckReady} from './app/line-link-check';export default {fetch(){return Response.json(lineLinkCheckReady('owner',"+now+"));}}",resolveDir:resolve('.'),loader:'ts'},outfile:join(dir,'worker.js'),bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],plugins:[{name:'session-fixture',setup(b){b.onResolve({filter:/^\.\/app-auth$/},a=>a.importer.endsWith('/app/line-link-check.ts')?{path:'session',namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'ts',contents:'export async function getAppAccess(){return null;}'}));}}]});
 const cases=[['ready',{},true],['wrong owner',{LINE_LINK_CHECK_MEMBER_ID:'other'},false],['whitespace owner',{LINE_LINK_CHECK_MEMBER_ID:'owner '},false],['future',{LINE_LINK_CHECK_STARTED_AT:new Date(now+1000).toISOString()},false],['expired',{LINE_LINK_CHECK_EXPIRES_AT:new Date(now).toISOString()},false],['reversed',{LINE_LINK_CHECK_EXPIRES_AT:new Date(now-120000).toISOString()},false],['too long',{LINE_LINK_CHECK_EXPIRES_AT:new Date(now+86400000).toISOString()},false],['invalid calendar',{LINE_LINK_CHECK_STARTED_AT:'2026-02-30T00:00:00.000Z'},false],['noncanonical',{LINE_LINK_CHECK_STARTED_AT:'2026-01-01'},false]];
 for(const key of Object.keys(full))cases.push(['missing '+key,{[key]:''},false]);
 for(const key of ['LINE_DATA_POLICY_READY','LINE_LOGIN_ENABLED','LINE_SIGNUP_ENABLED','LINE_NOTIFICATIONS_ENABLED','ACCOUNT_ERASURE_ENABLED'])for(const value of ['true','False',' false'])cases.push([key+' '+value,{[key]:value},false]);
 for(const [name,overrides,expected] of cases){const mf=new Miniflare({cf:false,modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.js'),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],bindings:{...full,...overrides},outboundService:()=>{throw new Error('no network');}});try{assert.equal(await(await mf.dispatchFetch('https://fixture.invalid')).json(),expected,name);}finally{await mf.dispose();}}
 console.log(`PASS ${cases.length} owner/window/general-off/config checks; no network`);
} finally {rmSync(dir,{recursive:true,force:true});}
