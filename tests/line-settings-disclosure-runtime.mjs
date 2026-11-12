// 実ビルドを隔離Workerで確認。公式cf:falseで外部メタデータ取得を止め、外部通信はすべて禁止する。
import { Miniflare } from 'miniflare';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve('.'); let outbound=0;
const mf=new Miniflare({cf:false,modulesRoot:root+'/dist/server',modules:readdirSync(root+'/dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)).sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:0).map(p=>({type:'ESModule',path:root+'/dist/server/'+p})),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],assets:{directory:root+'/dist/client',runWorkerFirst:true},d1Databases:{DB:'line-disclosure-only'},r2Buckets:['AVATARS'],bindings:{LINE_DATA_POLICY_READY:'false',LINE_LOGIN_ENABLED:'false',LINE_SIGNUP_ENABLED:'false',LINE_NOTIFICATIONS_ENABLED:'false',ACCOUNT_ERASURE_ENABLED:'false'},outboundService(){outbound++;throw new Error('No external service is permitted in this local test');}});
try{
 const worker=await mf.getWorker(),base=(await mf.ready).origin;
 const response=await worker.fetch(base+'/settings/line/about',{redirect:'manual'});
 assert.equal(response.status,200,'disclosure is readable without login even when rollout is OFF');assert.equal(response.headers.get('set-cookie'),null,'reading does not create consent/session state');
 const html=await response.text(),source=readFileSync('app/line-data-consent.ts','utf8');
 const disclosure=source.match(/LINE_LINK_DISCLOSURE = '([^']+)'/)[1];assert.ok(html.includes(disclosure));
 assert.match(html,/2026-11-11-v4/);assert.match(html,/href="\/settings\/line"/);assert.match(html,/このページを開くだけで/);assert.doesNotMatch(html,/<form[\s>]/);
 const protectedResponse=await worker.fetch(base+'/settings/line',{redirect:'manual'});assert.ok([302,303,307,308].includes(protectedResponse.status));assert.match(protectedResponse.headers.get('location'),/\/login\/member\?return_to=/);
 assert.equal(outbound,0,'no LINE, email, metadata, production or other external call');
 console.log('PASS: anonymous disclosure 200 with full v4 text, no cookies/forms/external calls; actual settings route still requires login. All five feature flags OFF.');
}finally{await mf.dispose();}
