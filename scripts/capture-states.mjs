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
const setPlan = (plan, end = '') => execFileSync('python3', ['-c',
  'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE members SET plan=?, plan_period_end=?, plan_source=? WHERE id=?",(sys.argv[2],sys.argv[3],"" if sys.argv[2]=="free" else "direct",sys.argv[4]));c.commit()',
  localDb(), plan, end, process.env.PREVIEW_MEMBER_ID || 'local_seedy']);
// 出稿枠は上位ランクの特典なので、その画面を撮るあいだだけ紹介数を上げる。
const getIntroCount = () => Number(execFileSync('python3', ['-c',
  'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);print(c.execute("SELECT intro_count FROM members WHERE id=?",(sys.argv[2],)).fetchone()[0])',
  localDb(), process.env.PREVIEW_MEMBER_ID || 'local_seedy']).toString().trim());
const setIntroCount = (count) => execFileSync('python3', ['-c',
  'import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE members SET intro_count=? WHERE id=?",(int(sys.argv[2]),sys.argv[3]));c.commit()',
  localDb(), String(count), process.env.PREVIEW_MEMBER_ID || 'local_seedy']);

const states = {};
const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });

async function newPage({ signIn = false } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, locale: 'ja-JP' });
  const page = await context.newPage();
  if (signIn) await page.goto(`${BASE}/signin-with-chatgpt?return_to=%2F`, { waitUntil: 'networkidle' });
  return page;
}

const selectValues = {};
const industryChildren = {};
async function save(key, page, selector = SHELL) {
  await page.waitForTimeout(450);
  states[key] = await page.locator(selector).first().evaluate((node) => node.outerHTML);
  selectValues[key] = await page.evaluate(() => Array.from(document.querySelectorAll('select')).map((select) => select.value));
  process.stdout.write(`${key} `);
}

// --- 未ログイン・権限なしの画面 ---
{
  const page = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await save('login', page, 'main.signin-page');
  await page.goto(`${BASE}/?login=notmember`, { waitUntil: 'networkidle' });
  await save('login:notmember', page, 'main.signin-page');
  await page.goto(`${BASE}/?login=pending`, { waitUntil: 'networkidle' });
  await save('login:pending', page, 'main.signin-page');
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
const closeModal = async () => { await page.locator('.modal-close').first().click(); await page.waitForTimeout(350); };

await nav(0).click();
await save('home', page);

// バナーは固定3枚＋掲載中の広告。出ている枚数だけ撮る。
const bannerCount = await page.locator('.carousel-dots button').count();
for (let index = 0; index < bannerCount; index += 1) {
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

// 募集中・募集終了・すべて
const statusSelect = page.locator('.member-filters select').first();
for (const status of ['closed', 'all', 'open']) {
  await statusSelect.selectOption(status);
  await page.waitForTimeout(180);
  await save(`status:${status}`, page);
}
await statusSelect.selectOption('open');

// カード1枚ずつの詳細と紹介フォーム
const cardCount = await page.locator('.card-list .need-card').count();
for (let index = 0; index < cardCount; index += 1) {
  await page.locator('.card-list .need-card h3').nth(index).click();
  await page.locator('.comments').waitFor({ timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  await save(`detail:${index}`, page);
  // 自分の投稿には紹介フォームではなく、ランクの特典を使うところが出る。
  if (await page.locator('.need-detail > .submit-button').count()) {
    await page.locator('.need-detail > .submit-button').click();
    await save(`intro:${index}`, page);
  }
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
await save('modal:post:limit', page);
await closeModal();
await nav(0).click();
await page.locator('.carousel-dots button').nth(1).click();
await page.locator('.hero-image-slide').click();
await save('modal:responses', page);
await closeModal();

await nav(4).click();
await page.locator('.invite-card').waitFor({ timeout: 15000 }).catch(() => console.warn('\n招待カードが出ませんでした'));
await save('mypage', page);

// 有料会員のマイページも撮る（プラン表示と招待カードの文言が変わる）
setPlan('standard', '2027-03-31');
await page.reload({ waitUntil: 'networkidle' });
await nav(4).click();
await page.locator('.invite-card').waitFor({ timeout: 15000 }).catch(() => undefined);
await save('mypage:pro', page);
// 投稿フォームそのものは有料会員のうちに撮る（無料会員は上限の案内が出るため）
// 後ろは一覧にしておく。閉じたときに戻る先が自然になる。
await nav(1).click();
await page.waitForTimeout(250);
await nav(2).click();
await save('modal:post', page);

// 業種ピッカーは大分類で詳細業種が入れ替わる。実際に押して組み合わせを控える。
const majors = page.locator('.modal .industry-major-picker button');
const majorNames = (await majors.allTextContents()).map((name) => name.trim());
for (const [index, name] of majorNames.entries()) {
  await majors.nth(index).click();
  await page.waitForTimeout(70);
  industryChildren[name] = (await page.locator('.modal .tag-picker button').allTextContents()).map((child) => child.trim());
}
await majors.nth(0).click();
await page.waitForTimeout(120);
await save('modal:post', page);
await closeModal();

setPlan('free');
await page.reload({ waitUntil: 'networkidle' });
await nav(4).click();
await page.waitForTimeout(600);
// プランは折りたたみなので、開いた状態も撮っておく
await page.locator('.plan-card > summary').click();
await page.waitForTimeout(250);
await save('mypage:plan', page);
await page.locator('.plan-card > summary').click();
await page.waitForTimeout(250);

// 上位ランクだけに出る、ランクの特典とトップバナーの出稿枠
const introCount = getIntroCount();
setIntroCount(12);
await page.reload({ waitUntil: 'networkidle' });
await nav(4).click();
await page.locator('.ad-entry').waitFor({ timeout: 15000 }).catch(() => console.warn('\n出稿の入口が出ませんでした'));

// ランクの特典。上位ランクのときに撮ると、解放済みと未解放が両方見える。
await page.locator('.rank-card-slim').click();
await page.waitForTimeout(500);
await save('mypage:perks', page);
await closeModal();

// 出稿の設定はモーダルの中。入稿の画面も撮る（写真を持っていない人向けの作り方が見えるように）。
await page.locator('.ad-entry-open').click();
await page.waitForTimeout(700);
await save('mypage:ad', page);
// 成果のグラフも撮る。出稿した人がいちばん見る画面なので。
const adStats = page.locator('.ad-stats-open').first();
if (await adStats.count()) {
  await adStats.click();
  await page.locator('.ad-chart').first().waitFor({ timeout: 10000 }).catch(() => console.warn('\nグラフが出ませんでした'));
  await page.waitForTimeout(500);
  await save('mypage:ad:stats', page);
  await adStats.click();
  await page.waitForTimeout(300);
}
// 出す流れは3つの手順。1つずつ撮る。
const adNew = page.locator('.ad-flow-open').first();
if (await adNew.count()) {
  await adNew.click();
  await page.waitForTimeout(400);
}
if (await page.locator('.ad-fields input').count()) {
  await page.locator('.ad-fields input').nth(0).fill('内装工事の職人さんを探しています');
  await page.locator('.ad-fields input').nth(1).fill('都内の店舗改装。長くお付き合いできる方を');
  await page.waitForTimeout(500);
  await save('mypage:ad:step1', page);
  await page.locator('.ad-step-actions .submit-button').click();
  await page.waitForTimeout(450);
  await save('mypage:ad:step2', page);
  await page.locator('.ad-step-actions .submit-button').click();
  await page.waitForTimeout(450);
  await save('mypage:ad:step3', page);
}
await closeModal();
setIntroCount(introCount);
await page.reload({ waitUntil: 'networkidle' });
await nav(4).click();
await page.waitForTimeout(600);

// 都道府県ごとの会場は、実際にselectを切り替えて読み取る
const venuePicker = page.locator('.profile-venue-select select');
const prefectures = await venuePicker.first().locator('option').evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
const venuesByPrefecture = {};
for (const prefecture of prefectures) {
  await venuePicker.first().selectOption(prefecture);
  await page.waitForTimeout(60);
  venuesByPrefecture[prefecture] = await venuePicker.nth(1).locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent })));
}
console.log(`\n会場ピッカー: ${prefectures.length}都道府県`);

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

// 招待リンクの受け取り画面。コードは会員のマイページから取る。
{
  const inviteUrl = await page.locator('.invite-link > span').textContent().catch(() => '');
  if (inviteUrl) {
    const guest = await newPage();
    await guest.goto(`${BASE}/join/${inviteUrl.trim().split('/').pop()}`, { waitUntil: 'networkidle' });
    await save('join', guest, 'main.signin-page');
    await guest.goto(`${BASE}/join/ZZZZZZZZ`, { waitUntil: 'networkidle' });
    await save('join:invalid', guest, 'main.signin-page');
    await guest.context().close();
  }
}

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

writeFileSync(OUT, JSON.stringify({ css: inline(css), states, selectValues, venuesByPrefecture, industryChildren }));
console.log(`\n${Object.keys(states).length} states, ${assets.size} assets -> ${OUT}`);
