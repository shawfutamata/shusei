import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('review', {recursive:true});
const BASE = process.env.PREVIEW_BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
await page.goto(`${BASE}/lp`,{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
const productScreens = page.locator('figure[aria-label="TASUKIの実際の画面"] img');
assert.equal(await productScreens.count(),2);
for (const screen of await productScreens.all()) {
 assert.ok(await screen.evaluate(image=>image.complete&&image.naturalWidth===960&&image.naturalHeight===1880));
}
const floatingWidgets = page.locator('section').first().locator('[data-motion="saas-float"] g');
assert.equal(await page.locator('section').first().locator('[data-motion="saas-float"]').count(),2);
assert.ok((await floatingWidgets.evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).animationName))).some(name=>name!=='none'));
await page.screenshot({path:'review/desktop.png',fullPage:true});
await page.screenshot({path:'review/hero.png'});
for(const width of [1440,768,430,390,375,320]){
 await page.setViewportSize({width,height:844});
 await page.evaluate(()=>window.scrollTo(0,0));
 const dims=await page.evaluate(()=>({
  w:innerWidth,
  scroll:document.documentElement.scrollWidth,
  confetti:[...document.querySelectorAll('section:first-of-type svg')].slice(0,2).map((element)=>{
   const box=element.getBoundingClientRect();
   return {left:box.left,right:box.right,width:box.width};
  }),
 }));
 assert.ok(dims.scroll<=dims.w,JSON.stringify(dims));
 if(width<=430){
  assert.equal(dims.confetti.length,2,JSON.stringify(dims));
  assert.ok(dims.confetti.every(({left,right,width})=>left>=0&&right<=dims.w&&width>=26),JSON.stringify(dims));
 }
 if(width===768) await page.locator('section').first().screenshot({path:'review/tablet-hero.png'});
 if(width===390){
  await page.screenshot({path:'review/mobile.png',fullPage:true});
  await page.screenshot({path:'review/mobile-hero.png'});
  await page.locator('section').first().screenshot({path:'review/mobile-hero-full.png'});
 }
}
await page.locator('summary[aria-label="メニューを開く"]').click();
await page.getByRole('navigation',{name:'モバイルナビゲーション'}).getByRole('link',{name:'料金プラン'}).click();
assert.equal(await page.locator('details').getAttribute('open'),null);
await page.getByRole('link',{name:'招待コードで始める',exact:false}).filter({visible:true}).first().click();
await page.getByLabel('招待コード（8桁の英数字）').fill('ab12cd34');
assert.equal(await page.locator('#lp-invite').inputValue(),'AB12CD34');
await page.route('**/join/AB12CD34',route=>route.fulfill({status:200,body:'Invite destination confirmed'}));
await page.getByRole('button',{name:'招待を確かめる'}).click();
await page.waitForURL('**/join/AB12CD34');
await page.goto(`${BASE}/?login=failed`,{waitUntil:'networkidle'});
await page.getByRole('alert').waitFor();
assert.equal((await page.locator('h1').innerText()).replace(/\s/g,''),'紹介が、次の商売につながる。');
assert.equal(await page.locator('a[href="/api/auth/google/start"]').count(),2);
assert.equal(errors.length,0,errors.join('\n'));
assert.equal(await page.locator('img[src="/lp/tasuki-ribbon.png"]').count(),0);
assert.equal(await page.locator('section').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 18, 20)');
await page.emulateMedia({reducedMotion:'reduce'});
assert.ok((await floatingWidgets.evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).animationName))).every(name=>name==='none'));
await page.close();
await Promise.race([browser.close(), new Promise(resolve=>setTimeout(resolve,2000))]);
console.log('PASS: desktop/mobile/no overflow, animated SaaS edge widgets with reduced-motion fallback, actual product UI screenshots, invitation normalization and destination (intercepted), root LP, login error, Google link, no browser errors');
process.exit(0);
