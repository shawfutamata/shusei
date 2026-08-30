import { chromium } from 'playwright-core';
const B = 'http://localhost:3000';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ja-JP' });
const page = await ctx.newPage();
console.log('== まっさらなDBから ==');
const top = await ctx.request.get(`${B}/`);
console.log('  トップ:', top.status());
await page.goto(`${B}/api/dev/signin?return_to=%2F`, { waitUntil: 'networkidle' });
for (const path of ['/api/board', '/api/ads', '/api/referral', '/api/entitlements', '/api/profile']) {
  const r = await page.evaluate(async (p) => { const x = await fetch(p); return { s: x.status, t: (await x.text()).slice(0, 120) }; }, path);
  console.log(`  ${path} → ${r.s}${r.s >= 400 ? ' ' + r.t : ''}`);
}
console.log('  画面に下メニューが出た:', await page.locator('.bottom-nav').count() > 0);
await browser.close();
