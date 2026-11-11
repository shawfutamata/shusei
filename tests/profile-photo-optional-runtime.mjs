// 実API・隔離D1で自由記入、選択数制限、保存後の再読込を確かめる。本番には接続しない。
import { Miniflare } from 'miniflare';
import { Response, FormData } from 'undici';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const root = resolve('.');
const mf = new Miniflare({ modulesRoot: root + '/dist/server', modules: readdirSync(root + '/dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p)).sort((a,b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : 0).map(p => ({ type: 'ESModule', path: root + '/dist/server/' + p })), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], assets: { directory: root + '/dist/client', runWorkerFirst: true }, d1Databases: { DB: 'profile-photo-test' }, r2Buckets: ['AVATARS'], bindings: { AUTH_CODE_PEPPER: 'test-pepper', GOOGLE_CLIENT_ID: 'fake-client', GOOGLE_CLIENT_SECRET: 'fake-secret' }, outboundService: async request => {
  if (new URL(request.url).hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ id_token: 'x.' + Buffer.from(JSON.stringify({ email: 'profile@example.com', email_verified: true, name: 'Test Member' })).toString('base64url') + '.x' }), { headers: { 'content-type': 'application/json' } });
  return new Response('Denied', { status: 403 });
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB'), base = (await mf.ready).origin;
  const fetch = (path, options = {}) => worker.fetch(base + path, { redirect: 'manual', ...options });
  await fetch('/meeting/missing');
  await fetch('/api/mobile/auth/request-code', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'invalid' }) });
  await db.prepare('INSERT INTO members(id,email,display_name,company,membership_status,avatar_key,created_at) VALUES(?,?,?,?,?,?,?)').bind('profile-test', 'profile@example.com', 'Test Member', 'Test Company', 'active', '', new Date().toISOString()).run();
  const start = await fetch('/api/auth/google/start');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const oauthCookie = start.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const callback = await fetch('/api/auth/google/callback?' + new URLSearchParams({ state, code: 'fake' }), { headers: { cookie: oauthCookie } });
  const cookie = callback.headers.get('set-cookie').match(/member_session=[^;]+/)[0];
  async function save(industries) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ displayName: 'Test Member', company: 'Test Company', industries: JSON.stringify(industries), notifyIndustries: JSON.stringify(['イタリアン', '花屋']), annualRevenueBand: '' })) form.set(key, value);
    return fetch('/api/profile', { method: 'PATCH', headers: { origin: base, cookie }, body: form });
  }
  let result = await save(['花屋']); assert.equal(result.status, 200, await result.clone().text()); assert.equal((await result.json()).avatarUrl, '');
  let board = await fetch('/api/board', { headers: { cookie } }); let data = await board.json(); assert.equal(data.stats.avatarUrl, '');
  const jsonHeaders = { origin: base, cookie, 'content-type': 'application/json' };
  const post = await fetch('/api/board', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ category: 'project', title: '写真なしで投稿のテスト' }) });
  assert.equal(post.status, 201, await post.clone().text()); const { id } = await post.json();
  const offer = await fetch('/api/introductions', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ requestId: id, personName: 'Test', personCompany: 'Company', relationship: 'テスト', fitReason: '紹介のテスト', consentConfirmed: true }) });
  assert.equal(offer.status, 201, await offer.clone().text());
  if (process.env.PHOTO_BROWSER_QA === '1') {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const width of [360, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addCookies([{ name: 'member_session', value: cookie.split('=')[1], url: base }]);
      await context.addInitScript(() => localStorage.setItem('tasuki:tutorial:v1', 'done'));
      const page = await context.newPage();
      await page.goto(base + '/');
      await page.locator('.header-profile').click();
      await page.getByRole('button', { name: 'プロフィールを保存する', exact: true }).waitFor();
      assert.ok(await page.getByRole('button', { name: 'プロフィールを保存する', exact: true }).isEnabled());
      assert.ok((await page.locator('.photo-upload').innerText()).includes('任意'));
      assert.ok((await page.locator('.photo-upload').innerText()).includes('写真なしでも利用できます'));
      const response = page.waitForResponse(r => r.url().endsWith('/api/profile') && r.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'プロフィールを保存する', exact: true }).click();
      assert.equal((await response).status(), 200);
      await page.locator('.photo-upload').scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/tmp/tasuki-photo-optional-' + width + '.png' });
      await context.close();
    }
    console.log('PASS Web実画面 360/390/430px: 任意表示・写真なし保存ボタン・保存API');
  } finally { await browser.close(); }
  }
  await db.prepare('UPDATE members SET avatar_key=?,avatar_version=? WHERE id=?').bind('member-photos/profile-test', 123, 'profile-test').run();
  result = await save(['家具の組み立て']); assert.equal(result.status, 200); assert.equal((await result.json()).avatarUrl, '/api/avatar/profile-test?v=123');
  const stored = await db.prepare('SELECT avatar_key, avatar_version FROM members WHERE id=?').bind('profile-test').first(); assert.equal(stored.avatar_key, 'member-photos/profile-test'); assert.equal(stored.avatar_version, 123);
  console.log('PASS 写真なしのプロフィールAPI保存・再読込・投稿・オファー、既存写真とバージョンの維持');
} finally { await mf.dispose(); }
