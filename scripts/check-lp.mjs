import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('review', {recursive:true});
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[];
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:4173/lp',{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:'review/desktop.png',fullPage:true});
await page.screenshot({path:'review/hero.png'});
for(const width of [1440,768,390,320]){
 await page.setViewportSize({width,height:844});
 await page.evaluate(()=>window.scrollTo(0,0));
 const dims=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(dims.scroll<=dims.w,JSON.stringify(dims));
 if(width===390){await page.screenshot({path:'review/mobile.png',fullPage:true});await page.screenshot({path:'review/mobile-hero.png'});}
}
await page.getByRole('link',{name:'招待コードで始める',exact:false}).first().click();
await page.getByLabel('招待コード（8桁の英数字）').fill('ab12cd34');
assert.equal(await page.locator('#lp-invite').inputValue(),'AB12CD34');
await page.route('**/join/AB12CD34',route=>route.fulfill({status:200,body:'Invite destination confirmed'}));
await page.getByRole('button',{name:'招待を確かめる'}).click();
await page.waitForURL('**/join/AB12CD34');
await page.goto('http://localhost:4173/?login=failed',{waitUntil:'networkidle'});
await page.getByRole('alert').waitFor();
assert.ok(await page.getByRole('heading',{name:'TASUKI',exact:true}).count());
assert.equal(await page.locator('a[href="/api/auth/google/start"]').count(),2);
assert.equal(errors.length,0,errors.join('\n'));
console.log('PASS: desktop/mobile/no overflow, invitation normalization and destination (intercepted), root LP, login error, Google link, no browser errors');
await browser.close();
