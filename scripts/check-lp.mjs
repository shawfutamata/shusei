import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('review/assembly', { recursive: true });
const base = process.env.PREVIEW_BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/lp`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const scene = page.locator('[data-ready="true"]');
  await scene.waitFor({ timeout: 30000 });
  for (const width of [1440, 768, 430, 390, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const bounds = await scene.evaluate(el => {
      const target = innerWidth <= 600 ? el.parentElement.parentElement : el.closest('section');
      return { top: target.getBoundingClientRect().top + scrollY - 76, travel: target.getBoundingClientRect().height - innerHeight };
    });
    const statuses = [];
    for (const fraction of [0, .5, 1]) {
      await page.evaluate(y => scrollTo({ top: Math.max(0, y), behavior: 'instant' }), bounds.top + bounds.travel * fraction);
      await page.waitForFunction(({ value }) => Math.abs(Number(document.querySelector('[data-ready="true"]')?.getAttribute('data-progress')) - value) < .015, { value: fraction }, { timeout: 15000 });
      statuses.push(Number(await scene.getAttribute('data-connected')));
      const rect = await scene.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 60, JSON.stringify(rect));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 1440 || width === 390) await page.screenshot({ path: `review/assembly/${width}-${fraction}.png` });
    }
    assert.equal(statuses[0], 0);
    assert.ok(statuses[1] > 0 && statuses[1] < 8);
    assert.equal(statuses[2], 8);
    console.log(`PASS ${width}px: separated → ${statuses[1]} connected → all 8 connected, no overflow`);
    await page.evaluate(y => scrollTo({ top: Math.max(0, y), behavior: 'instant' }), bounds.top);
    await page.waitForFunction(() => document.querySelector('[data-ready]')?.getAttribute('data-connected') === '0');
  }
  const screens = page.locator('img[data-product-screen]');
  assert.equal(await screens.count(), 2);
  for (const screen of await screens.all()) assert.ok(await screen.evaluate(el => el.complete && el.naturalWidth === 960));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await scene.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-ready]')?.getAttribute('data-connected') === '8');
  assert.equal(await page.locator('section').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(239, 239, 236)');
  await page.getByRole('link', { name: '招待コードで始める', exact: false }).first().click();
  await page.getByLabel('招待コード（8桁の英数字）').fill('ab12cd34');
  assert.equal(await page.locator('#lp-invite').inputValue(), 'AB12CD34');
  await page.route('**/join/AB12CD34', route => route.fulfill({ status: 200, body: 'Invite destination confirmed' }));
  await page.getByRole('button', { name: '招待を確かめる' }).click();
  await page.waitForURL('**/join/AB12CD34');
  assert.deepEqual(errors, []);
  const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return String(type).includes('webgl') ? null : original.call(this, type, ...args); };
  });
  await fallback.goto(`${base}/lp`, { waitUntil: 'networkidle' });
  const image = fallback.locator('img[src="/lp/tasuki-connection-hero-v1.webp"]');
  await image.scrollIntoViewIfNeeded();
  assert.ok(await image.isVisible());
  assert.ok(await image.evaluate(i => i.complete && i.naturalWidth === 960));
  console.log('PASS reverse scroll, reduced motion, no WebGL fallback, actual UI images, invitation destination, no page errors');
} finally {
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 2000))]);
}
process.exit(0);
