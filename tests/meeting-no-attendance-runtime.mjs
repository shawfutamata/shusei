import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir=mkdtempSync(join(tmpdir(),'tasuki-background-analysis-'));
await build({entryPoints:[resolve('tests/meeting-no-attendance-worker.ts')],outfile:join(dir,'worker.js'),bundle:true,format:'esm',platform:'node',external:['cloudflare:workers'],tsconfig:resolve('tsconfig.json')});
const mf=new Miniflare({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.js'),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'background-test'},queueProducers:{MEETING_ANALYSIS_QUEUE:'analysis-fixture'}});
try{const r=await mf.dispatchFetch('https://fixture.test');const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));assert.equal(result.pass,true);console.log(JSON.stringify(result,null,2));}finally{await mf.dispose();rmSync(dir,{recursive:true,force:true});}
