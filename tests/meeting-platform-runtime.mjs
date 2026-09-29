import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {Response} from 'undici';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'tasuki-venue-test-'));
await build({entryPoints:[resolve('tests/meeting-platform-worker.ts')],outfile:join(dir,'worker.js'),bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],tsconfig:resolve('tsconfig.json'),define:{'import.meta.env.DEV':'false'},plugins:[{name:'test-auth',setup(b){b.onResolve({filter:/^next\/server$/},()=>({path:'next-response',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export class NextResponse extends Response {}',loader:'js'}));b.onResolve({filter:/app-auth$/},()=>({path:resolve('tests/fixtures/meeting-platform-auth.ts')}));}}]});
const homepage='<h2>2026年間スケジュール</h2><h3>10月7日</h3><a href="https://www.shuseiclub.jp/other/entry_form/index.php?e=11636">申込</a>';
const mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.js'),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'venue-test'},bindings:{ADMIN_EMAILS:'platform@example.com'},outboundService:()=>new Response(homepage)});
try{const worker=await mf.getWorker();const response=await worker.fetch('https://test.example.com');const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.pass,true);console.log(JSON.stringify(result,null,2));}finally{await mf.dispose();rmSync(dir,{recursive:true,force:true});}
