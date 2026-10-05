import {build} from 'esbuild';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=dirname(fileURLToPath(import.meta.url)),out=mkdtempSync(join(tmpdir(),'tasuki-unit-'));
try {
 const files=readdirSync(source).filter(p=>p.endsWith('.test.ts')).sort();
 const compiled=[];
 for(const name of files){const target=join(out,name.replace(/\.ts$/,'.mjs'));await build({entryPoints:[join(source,name)],outfile:target,bundle:true,platform:'node',format:'esm'});compiled.push(target);}
 const run=spawnSync(process.execPath,['--test',...compiled],{stdio:'inherit'});
 if(run.error)throw run.error;
 process.exitCode=run.status??1;
}finally{rmSync(out,{recursive:true,force:true});}
