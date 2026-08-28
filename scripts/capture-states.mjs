// ローカルで動いている本物のWebを操作して、各画面のDOMをそのまま保存する。
// 出力したJSONは、クリックで状態を切り替えられるプレビューHTMLの材料になる。
//   npm run dev            # 別ターミナルで先に起動
//   node scripts/capture-states.mjs [出力先.json]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PREVIEW_BASE_URL || 'http://localhost:3000';
const OUT = process.argv[2] || 'preview-states.json';
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const VIEWPORT = { width: 430, height: 932 };
const SHELL = 'main.app-shell';

const localDb = () => join(D1_DIR, readdirSync(D1_DIR).find((name) => name.endsWith('.sqlite') && !name.startsWith('metadata')));
const setStatus = (status) => execFileSync('python3', ['-c',
  'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE members SET membership_status=? WHERE id=?",(sys.argv[2],sys.argv[3]));c.commit()',
  localDb(), status, process.env.PREVIEW_MEMBER_ID || 'local_seedy']);

const states = {};
const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });

async function newPage({ signIn = false } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, locale: 'ja-JP' });
  const page = await context.newPage();
  if (signIn) await page.goto(`${BASE}/signin-with-chatgpt?return_to=%2F`, { waitUntil: 'networkidle' });
  return page;
}

async function save(key, page, selector = SHELL) {
  await page.waitForTimeout(450);
  states[key] = await page.locator(selector).first().evaluate((node) => node.outerHTML);
  process.stdout.write(`${key} `);
}

// --- 未ログイン・権限なしの画面 ---
{
  const page = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await save('login', page, 'main.signin-page');
  await page.goto(`${BASE}/?login=notmember`, { waitUntil: 'networkidle' });
  await save('login:notmember', page, 'main.signin-page');
  await page.context().close();
}
setStatus('invited');
{
  const page = await newPage({ signIn: true });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await save('denied', page, 'main.signin-page');
  await page.context().close();
}

// --- 会員として全画面 ---
setStatus('active');
const page = await newPage({ signIn: true });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForSelector(SHELL);

const nav = (index) => page.locator('.bottom-nav > button').nth(index);
const closeModal = async () => { await page.locator('.modal-close, .cardbook-header > button').first().click(); await page.waitForTimeout(350); };

await nav(0).click();
await save('home', page);

// バナー4枚
for (let index = 0; index < 4; index += 1) {
  await page.locator('.carousel-dots button').nth(index).click();
  await save(`home:banner:${index}`, page);
}
await page.locator('.carousel-dots button').nth(0).click();

// 業種グリッドの件数（ラベル）を控える
const industryNames = await page.locator('.industry-grid > button b').allTextContents();

// 困りごと一覧とカテゴリ絞り込み
await nav(1).click();
await save('search', page);
const filterKeys = ['all', 'project', 'collaboration', 'consultation'];
for (const [index, key] of filterKeys.entries()) {
  await page.locator('.filters button').nth(index).click();
  await save(`search:${key}`, page);
}
await page.locator('.filters button').nth(0).click();

// カード1枚ずつの詳細と紹介フォーム
const cardCount = await page.locator('.card-list .need-card').count();
for (let index = 0; index < cardCount; index += 1) {
  await page.locator('.card-list .need-card h3').nth(index).click();
  await save(`detail:${index}`, page);
  await page.locator('.need-detail .submit-button').click();
  await save(`intro:${index}`, page);
  await closeModal();
  await page.locator('.filters button').nth(0).click();
  await page.waitForTimeout(200);
}

// 業種で絞り込んだ一覧
for (const [index, name] of industryNames.entries()) {
  await nav(0).click();
  await page.waitForTimeout(250);
  await page.locator('.industry-grid > button').nth(index).click();
  await save(`industry:${name}`, page);
}

// モーダル各種
await nav(1).click();
await nav(2).click();
await save('modal:post', page);
await closeModal();
await nav(3).click();
await save('modal:cards', page);
await closeModal();
await nav(0).click();
await page.locator('.carousel-dots button').nth(1).click();
await page.locator('.hero-image-slide').click();
await save('modal:responses', page);
await closeModal();

await nav(4).click();
await save('mypage', page);

// --- CSS を全部集める ---
const css = await page.evaluate(async () => {
  const parts = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      parts.push(Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n'));
    } catch {
      if (sheet.href) parts.push(await fetch(sheet.href).then((response) => response.text()).catch(() => ''));
    }
  }
  return parts.join('\n');
});

// --- 同一オリジンの画像をdata URIに置き換える（認証済みのページから取りに行く） ---
const paths = new Set();
const collect = (text) => {
  for (const match of text.matchAll(/src="(\/[^"]+)"/g)) paths.add(match[1]);
  for (const match of text.matchAll(/url\((\/[^)"']+)\)/g)) paths.add(match[1]);
};
Object.values(states).forEach(collect);
collect(css);
const fetched = await page.evaluate(async (list) => {
  const out = [];
  for (const path of list) {
    const response = await fetch(path);
    const type = (response.headers.get('content-type') || '').split(';')[0];
    if (!response.ok || !type.startsWith('image/')) { out.push([path, '', `${response.status} ${type}`]); continue; }
    const blob = await response.blob();
    const uri = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    out.push([path, uri, '']);
  }
  return out;
}, [...paths]);
const assets = new Map();
for (const [path, uri, reason] of fetched) {
  if (uri) assets.set(path, uri);
  else console.warn(`\nskip ${path} (${reason})`);
}

await page.context().close();
await browser.close();
const inline = (text) => [...assets].reduce((current, [path, uri]) => current.split(`"${path}"`).join(`"${uri}"`).split(`(${path})`).join(`(${uri})`), text);
for (const key of Object.keys(states)) states[key] = inline(states[key]);

writeFileSync(OUT, JSON.stringify({ css: inline(css), states }));
console.log(`\n${Object.keys(states).length} states, ${assets.size} assets -> ${OUT}`);
