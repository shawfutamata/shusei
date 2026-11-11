// 実際のTOP画面とCSSを描画し、合成クリックを含むタッチ操作を隔離環境で確認する。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import BoardClient from './app/BoardClient';
import './app/globals.css';
window.fetch=async()=>new Response('{}',{status:503,headers:{'Content-Type':'application/json'}});
localStorage.setItem('tasuki:tutorial:v1','done');
window.tasukiEntryPromptHandled=true; // 初回の相談案内は別テスト。バナーを覆わない状態で操作する。
const stats={memberId:'qa',memberNo:1,displayName:'検証用会員',nameKana:'',venue:'',company:'検証用会社',companyKana:'',positionTitle:'',businessArea:'東京都',primaryIndustry:'システム開発',industries:['システム開発'],notifyIndustries:[],annualRevenueBand:'',facebookUrl:'',companyPr:'',avatarUrl:'',introCount:0,receivedIntroCount:0,inviteCount:0,dealCount:0,rank:'SILVER',level:1,nextRankAt:10,plan:'standard',paid:false,adminPlan:false,contractedPlan:'free',bonusPlan:'free',bonusPeriodEnd:'',planPeriodEnd:'',campaignPlan:true,campaignUntil:'2026-12-31',requestsThisMonth:0,requestLimit:-1};
const ad={id:'qa-ad',startDate:'2026-11-11',endDate:'2026-12-10',title:'バナーのタッチ操作を確認しています',description:'これは隔離テスト専用の広告です。実際の会員・広告・投稿データは使いません。',linkUrl:'',imageUrl:'/banners/top-ad.webp',status:'active',placement:'banner',industry:'',memberName:'検証用会員',memberCompany:'検証用会社',memberId:'qa-advertiser',mine:false};
createRoot(document.getElementById('root')).render(<BoardClient initialRequests={[]} initialStats={stats} initialAds={[ad]} userName="検証用会員"/>);`;
const bundle = await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',format:'esm',conditions:['style','browser','import','default'],outfile:'fixture.js',loader:{'.woff2':'dataurl'}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const server=createServer(async(req,res)=>{
 try {
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
  if(req.url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  if(req.url?.startsWith('/banners/')){res.setHeader('Content-Type',req.url.endsWith('.png')?'image/png':'image/webp');res.end(await readFile(resolve('public','.'+req.url)));return;}
  if(req.url?.endsWith('.svg')){res.setHeader('Content-Type','image/svg+xml');res.end(await readFile(resolve('public','.'+req.url)));return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');
 } catch {res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
await mkdir('outputs/banner-swipe',{recursive:true});
try {
 for(const width of [360,390,430]) {
  const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.clock.pauseAt(new Date());
  await page.goto(url);await page.locator('.hero-image-slide').waitFor();
  const cdp=await context.newCDPSession(page);
  const active=()=>page.locator('.carousel-dots button').evaluateAll(nodes=>nodes.findIndex(n=>n.classList.contains('active')));
  const count=await page.locator('.carousel-dots button').count();assert.ok(count>=3);
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
  const gesture=async(dx,dy=0,kind='touchEnd')=>{
   const box=await page.locator('.hero-image-slide').boundingBox();const x=box.x+box.width/2,y=box.y+box.height/2;
   await touch('touchStart',x,y);
   for(let n=1;n<=6;n++)await touch('touchMove',x+dx*n/6,y+dy*n/6);
   await touch(kind,x+dx,y+dy);
  };
  const noDialog=async()=>assert.equal(await page.getByRole('dialog').count(),0,'スワイプで広告を開かない');
  // 5000msになる直前までは同じバナー。その後は1枚進み、周回する。
  const first=await active();await page.clock.runFor(4999);assert.equal(await active(),first);
  await page.clock.runFor(1);assert.equal(await active(),(first+1)%count);
  for(let n=1;n<count;n++)await page.clock.runFor(5000);
  assert.equal(await active(),first);
  // 指を置いている途中では時間が来ても差し替えない。
  let box=await page.locator('.hero-image-slide').boundingBox();
  await touch('touchStart',box.x+box.width/2,box.y+box.height/2);
  await page.clock.runFor(6000);assert.equal(await active(),first);
  await touch('touchCancel',0,0);await page.clock.runFor(5000);assert.equal(await active(),(first+1)%count);
  // ドットの既存操作を維持し、その後の左右スワイプ・端の折り返しも確認する。
  await page.locator('.carousel-dots button').first().tap();assert.equal(await active(),0);
  await gesture(-100);assert.equal(await active(),1);await noDialog();
  await gesture(100);assert.equal(await active(),0);await noDialog();
  await gesture(100);assert.equal(await active(),count-1);await noDialog();
  await gesture(-100);assert.equal(await active(),0);await noDialog();
  await page.clock.runFor(6000);assert.equal(await active(),0,'手動で選んだバナーは既存仕様どおり停止');
  await gesture(-20);assert.equal(await active(),0);await noDialog();
  await gesture(-100,0,'touchCancel');assert.equal(await active(),0);await noDialog();
  // 縦スクロールと縦方向中心の斜め操作ではバナーを切り替えない。
  await gesture(-25,-100);assert.equal(await active(),0);await noDialog();
  assert.ok(await page.evaluate(()=>window.scrollY)>0,'バナー上から縦スクロールできる');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.clock.runFor(400);
  // スワイプ後の次の通常タップは広告詳細を開ける。
  await page.locator('.hero-image-slide').tap();await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(),/バナーのタッチ操作を確認しています/);
  await page.getByRole('button',{name:'閉じる',exact:true}).tap();await noDialog();
  // キーボードからの広告詳細も抑止しない。
  await gesture(-100);await gesture(100);await page.locator('.hero-image-slide').focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
  await page.getByRole('button',{name:'閉じる',exact:true}).tap();
  await page.clock.runFor(400);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
  assert.equal(await page.locator('.hero-swipe-area').evaluate(e=>getComputedStyle(e).touchAction),'pan-y pinch-zoom');
  await page.screenshot({path:`outputs/banner-swipe/top-${width}.png`,fullPage:false});
  assert.deepEqual(errors,[]);
  await context.close();
  console.log(`PASS ${width}px: 実TOP・5秒/周回・指を置いた間の停止・左右/折り返し・短い動き/取消・縦スクロール・誤クリック防止・タップ/キーボード・横溢れなし`);
 }
} finally {await browser.close();server.close();}
