// 実コンポーネントとCSSを隔離ページで描画し、本番のデータには触れず操作を確認する。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const bundle = await build({ stdin: { contents: `
import React,{useState} from 'react';
import{createRoot}from'react-dom/client';
import Tutorial,{tutorialSeen}from'./app/Tutorial';
function Fixture(){const[open,setOpen]=useState(()=>!tutorialSeen());const[finished,setFinished]=useState(false);return <>
{!location.search.includes('missing')&&<><button className="header-profile">プロフィール</button><div className="bottom-nav" style={{position:'fixed',bottom:0}}><button className="nav-search">検索</button><button className="nav-post">投稿</button><button className="nav-ads">広告</button></div></>}
<button onClick={()=>setOpen(true)}>使い方をもう一度見る</button><span id="finished">{String(finished)}</span>
{open&&<Tutorial onClose={()=>setOpen(false)} onFinish={()=>{setOpen(false);setFinished(true)}}/>}</>};
createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle:true, write:false, jsx:'automatic', format:'esm' });
const css = await readFile('app/globals.css','utf8');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/app.js"></script>`)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 for(const width of [360,390,430]) {
  const context=await browser.newContext({viewport:{width,height:740}});const page=await context.newPage();
  await page.goto(url);await page.evaluate(()=>localStorage.setItem('user-data-fixture','keep'));
  for(let step=0;step<5;step++) {
   if(step)await page.getByRole('button',{name:'使い方をもう一度見る'}).click();
   for(let n=0;n<step;n++)await page.getByRole('button',{name:'次へ',exact:true}).click();
   await page.waitForTimeout(350);
   const skip=page.getByRole('button',{name:'ガイドをスキップ'});const box=await skip.boundingBox();
   assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=740);
   if(step===0&&width===390)await page.screenshot({path:'/tmp/tasuki-guide-skip.png'});
   await skip.click();assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal(await page.locator('#finished').textContent(),'false');
   assert.equal(await page.evaluate(()=>localStorage.getItem('tasuki:tutorial:v1')),'done');
   assert.equal(await page.evaluate(()=>localStorage.getItem('user-data-fixture')),'keep');
  }
  await page.reload();assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'使い方をもう一度見る'}).click();
  await page.getByRole('button',{name:'次へ',exact:true}).click();await page.getByRole('button',{name:'戻る',exact:true}).click();assert.equal(await page.locator('.tut-count').textContent(),'1 / 5');
  for(let n=0;n<4;n++)await page.getByRole('button',{name:'次へ',exact:true}).click();
  await page.getByRole('button',{name:'ガイドを完了する',exact:true}).click();assert.equal(await page.locator('#finished').textContent(),'true');
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:360,height:568}});const page=await context.newPage();
 await page.goto(url+'/?missing');await page.waitForTimeout(400);
 const card=await page.locator('.tut-card').boundingBox();assert.ok(card.y>=0&&card.y+card.height<=568);
 await page.screenshot({path:'/tmp/tasuki-guide-no-target.png'});
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('storage denied')}});
 await page.getByRole('button',{name:'ガイドをスキップ'}).click();assert.equal(await page.getByRole('dialog').count(),0);
 await context.close();
 const board=await readFile('app/BoardClient.tsx','utf8');assert.match(board,/onClick=\{\(\) => setTutorial\(true\)\}>使い方をもう一度見る/);
 console.log('PASS: 360/390/430px all five skips; reload; replay; back/next/finish; unrelated data preserved; missing targets; denied storage.');
} finally {await browser.close();server.close();}
