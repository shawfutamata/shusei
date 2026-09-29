import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
const output=mkdtempSync(join(tmpdir(),'tasuki-cron-test-'));
execFileSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--config','wrangler.meeting-scheduler.jsonc','--dry-run','--outdir',output],{stdio:'pipe'});
const homepage='<h2>2026年間スケジュール</h2><h3>10月7日(水)</h3><a href="https://www.shuseiclub.jp/hirunomeguro/entry_form/index.php?e=11636">申込</a>';
let authenticatedRequests=0;
async function outbound(request){
 const u=new URL(request.url);
 if(u.href==='https://colourjam.wixstudio.com/hirumeguro')return new Response(homepage);
 if(u.origin!=='https://www.shuseiclub.jp')return new Response('Denied',{status:403});
 if(u.pathname.endsWith('/onetime.php'))return new Response('',{status:302,headers:{Location:'/hirunomeguro/___STAFF___/menu.php','Set-Cookie':'test_session=fixture; Secure; HttpOnly'}});
 assert.equal(request.headers.get('cookie'),'test_session=fixture');authenticatedRequests++;
 if(u.pathname.endsWith('/menu.php'))return new Response('管理メニュー');
 if(u.pathname.endsWith('/set_info.php'))return new Response('<table><tr><th>最終名簿テーブル数</th><td>8 [H]</td></tr></table><a href="./list_download-MS.php?id=11636&cd=U">UTF-8形式名簿データ</a>');
 if(u.pathname.endsWith('/list_download-MS.php'))return new Response('1\tA\tH\t\tひるのめぐろ\tテスト印刷会社\t代表\t試験 一郎\tチラシ印刷\t会員\tしけんいちろう\n2\tI\tZ\t\tひるのめぐろ\tテスト建築会社\t代表\t試験 二郎\t内装工事\t会員\tしけんじろう');
 if(u.pathname.endsWith('/member/index.php')){assert.equal(request.method,'POST');assert.ok(['sel_key=1','sel_key=2','sel_key=3'].includes(await request.text()));return new Response('会員一覧<a href="./member_detail.php?id=1&amp;sk=1">試験 一郎<br>シケン イチロウ</a><a href="./member_detail.php?id=2&amp;sk=2">試験 二郎<br>シケン ジロウ</a>');}
 if(u.pathname.endsWith('/member_detail.php')){const one=u.searchParams.get('id')==='1';return new Response(`<input name="member[company_name]" value="${one?'テスト印刷会社':'別会社'}"><input name="member[member_namel]" value="試験"><input name="member[member_namef]" value="${one?'一郎':'二郎'}"><input name="member[company_type]" value="印刷"><textarea name="member[company_pr]">チラシ印刷と商品のケース印刷</textarea>`);}
 return new Response('Not Found',{status:404});
}
const rawKey=webcrypto.getRandomValues(new Uint8Array(32));
const mf=new Miniflare({modules:true,modulesRoot:output,scriptPath:join(output,'meeting-scheduler.js'),compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'automation-test'},bindings:{MEETING_CONNECTION_KEY:Buffer.from(rawKey).toString('base64')},outboundService:outbound});
try{
 const worker=await mf.getWorker(),db=await mf.getD1Database('DB');
 const before={scheduledTime:Date.parse('2026-10-04T01:00:00+09:00'),cron:'0 16 * * *'};
 const due={scheduledTime:Date.parse('2026-10-05T01:00:00+09:00'),cron:'0 16 * * *'};
 await worker.scheduled(before);assert.equal((await db.prepare('SELECT id FROM meeting_events').all()).results.length,0);
 await worker.scheduled(due);assert.equal((await db.prepare('SELECT id FROM meeting_events').all()).results.length,1);
 assert.equal((await db.prepare('SELECT status FROM meeting_preparations').first()).status,'roster_pending');
 const iv=webcrypto.getRandomValues(new Uint8Array(12)),key=await webcrypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt']);
 const cipher=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('https://www.shuseiclub.jp/hirunomeguro/___STAFF___/onetime.php?id=fixture'));
 await db.prepare('UPDATE meeting_automation_settings SET connection=? WHERE id=1').bind(Buffer.concat([Buffer.from(iv),Buffer.from(cipher)]).toString('base64')).run();
 await Promise.all([worker.scheduled(due),worker.scheduled(due)]);
 assert.equal((await db.prepare('SELECT id FROM meeting_events').all()).results.length,1);
 const state=await db.prepare('SELECT status,tables,error FROM meeting_preparations').first();assert.equal(state.status,'ready',state.error);assert.equal(state.tables,8);
 const roster=(await db.prepare('SELECT profile FROM meeting_roster').all()).results;assert.equal(roster.length,2);assert.equal(JSON.parse(roster[0].profile).table,'');assert.equal(JSON.parse(roster[0].profile).services,'チラシ印刷と商品のケース印刷');
 assert.equal(JSON.parse(roster[1].profile).services,'内装工事');assert.equal(JSON.parse(roster[1].profile).industry,'');
 await worker.scheduled(due);assert.equal((await db.prepare('SELECT profile FROM meeting_roster').all()).results.length,2);
 assert.ok(authenticatedRequests>=3);
 console.log('Verified cron timing, encrypted login, session redirects, UTF-8 roster import, table count, hidden seats and concurrent retries.');
}finally{await mf.dispose();rmSync(output,{recursive:true,force:true});}
