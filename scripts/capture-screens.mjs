// ローカルで起動中のWebを実際に描画して、各画面を撮影する。
//   npm run dev            # 別のターミナルで先に起動しておく
//   node scripts/capture-screens.mjs [出力先ディレクトリ]
//
// 会員の状態はローカルD1を直接書き換えて切り替える。本番には触れない。
// ストア用スクリーンショットの下地にも使える。
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PREVIEW_BASE_URL || 'http://localhost:3000';
const OUT = process.argv[2] || 'screens';
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const VIEWPORT = { width: 480, height: 940 };

const localDb = () => join(D1_DIR, readdirSync(D1_DIR).find((name) => name.endsWith('.sqlite') && !name.startsWith('metadata')));
const setStatus = (status) => execFileSync('python3', ['-c',
  'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE members SET membership_status=? WHERE id=?",(sys.argv[2],sys.argv[3]));c.commit()',
  localDb(), status, process.env.PREVIEW_MEMBER_ID || 'local_seedy']);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });

// タブごとに新しいコンテキストを使う。モーダルの開いた状態が次の撮影に残らない。
async function capture(name, { signIn = false, path = '/', navIndex = null } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, locale: 'ja-JP' });
  await context.addInitScript(() => window.localStorage.setItem('tasuki:tutorial:v1', 'done'));
  const page = await context.newPage();
  if (signIn) await page.goto(`${BASE}/api/dev/signin?return_to=%2F`, { waitUntil: 'networkidle' });
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const automaticModalClose = page.locator('.modal-close').first();
  if (await automaticModalClose.isVisible().catch(() => false)) {
    await automaticModalClose.click();
    await page.waitForTimeout(250);
  }
  if (navIndex !== null) {
    await page.locator('.bottom-nav button, .bottom-nav a').nth(navIndex).click();
    await page.waitForTimeout(1100);
    if (await automaticModalClose.isVisible().catch(() => false)) {
      await automaticModalClose.click();
      await page.waitForTimeout(250);
    }
  }
  writeFileSync(join(OUT, `${name}.jpg`), await page.screenshot({ type: 'jpeg', quality: 76 }));
  console.log(name);
  await context.close();
}

await capture('01-login');
await capture('02-notmember', { path: '/?login=notmember' });

setStatus('invited');
await capture('03-denied', { signIn: true });

setStatus('active');
const tabs = [
  ['04-home', 0],
  ['05-requests', 1],
  ['06-recommended', 2],
  ['07-post', 3],
  ['08-messages', 4],
  ['09-ads', 5],
  ['10-mypage', 6],
];
for (const [name, navIndex] of tabs) await capture(name, { signIn: true, navIndex });

await browser.close();
console.log(`\n${OUT}/ に保存しました。`);
