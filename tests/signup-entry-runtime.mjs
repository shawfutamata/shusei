// 実API・隔離D1で、会社情報を一度だけ入力する登録とLPの導線を確かめる。
import { Miniflare } from 'miniflare';
import { Response, FormData } from 'undici';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('.');
let googleEmail = 'signup-once@example.com';
const mf = new Miniflare({
  modulesRoot: root + '/dist/server',
  modules: readdirSync(root + '/dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p)).sort((a, b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : 0).map(p => ({ type: 'ESModule', path: root + '/dist/server/' + p })),
  compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'],
  assets: { directory: root + '/dist/client', runWorkerFirst: true },
  d1Databases: { DB: 'signup-entry-test' }, r2Buckets: ['AVATARS'],
  bindings: { AUTH_CODE_PEPPER: 'isolated-test-pepper', GOOGLE_CLIENT_ID: 'fake-client', GOOGLE_CLIENT_SECRET: 'fake-secret' },
  outboundService: async request => {
    const host = new URL(request.url).hostname;
    const account = { email: googleEmail, email_verified: true, name: 'Googleのお名前' };
    if (host === 'oauth2.googleapis.com') return new Response(JSON.stringify({ id_token: 'x.' + Buffer.from(JSON.stringify(account)).toString('base64url') + '.x' }), { headers: { 'content-type': 'application/json' } });
    if (host === 'openidconnect.googleapis.com') return new Response(JSON.stringify(account), { headers: { 'content-type': 'application/json' } });
    return new Response('Denied', { status: 403 });
  },
});
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB'), base = (await mf.ready).origin;
  const fetch = (path, options = {}) => worker.fetch(base + path, { redirect: 'manual', ...options });
  const post = (body, origin = base) => fetch('/api/register', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const newDraft = async (extra = {}) => { const r = await post({ action: 'draft', consent: true, ...extra }); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).draft; };
  const start = async id => { const r = await fetch('/api/auth/google/start?signup=1&draft=' + id); assert.equal(r.status, 307); return { cookie: r.headers.getSetCookie().map(x => x.split(';')[0]).join('; '), state: new URL(r.headers.get('location')).searchParams.get('state') }; };
  const callback = (s, query = new URLSearchParams({ state: s.state, code: 'fake' })) => fetch('/api/auth/google/callback?' + query, { headers: { cookie: s.cookie } });
  const sessionCookie = r => r.headers.getSetCookie().find(x => x.startsWith('member_session='))?.split(';')[0];
  const member = () => db.prepare('SELECT * FROM members WHERE email=?').bind(googleEmail).first();
  assert.equal((await post({ action: 'draft', consent: false })).status, 400);
  assert.equal((await post({ action: 'draft', consent: true }, 'https://wrong.example')).status, 403);
  assert.equal((await post({ action: 'draft', consent: true, invite: 'INVALID' })).status, 400);
  const id = await newDraft();
  assert.equal(await member(), null, '同意だけでは会員を作らない');
  let auth = await start(id), result = await callback(auth, 'error=access_denied');
  assert.equal(new URL(result.headers.get('location')).pathname, '/register');
  assert.equal(sessionCookie(result), undefined);
  assert.equal(await member(), null);
  auth = await start(id); result = await callback(auth, 'state=wrong&code=fake');
  assert.equal(sessionCookie(result), undefined);
  auth = await start(id); result = await callback(auth);
  const cookie = sessionCookie(result); assert.ok(cookie);
  assert.equal((await member()).display_name, 'Googleのお名前');
  assert.equal((await member()).company, '');
  assert.equal((await member()).membership_status, 'active');
  const complete = await fetch('/register/complete', { headers: { cookie } });
  assert.equal(new URL(complete.headers.get('location'), base).searchParams.get('welcome'), 'registered');
  const apiOnly = process.argv.includes('--api-only');
  if (!apiOnly) {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  mkdirSync('/tmp/signup-entry-qa', { recursive: true });
  try {
    for (const width of [360, 390, 430, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 850 } });
      const page = await context.newPage();
      await page.goto(base + '/login');
      const nav = page.getByRole('navigation', { name: '会員登録とログイン', exact: true });
      assert.equal(await nav.getByRole('link', { name: '新規会員登録', exact: true }).getAttribute('href'), '/register');
      assert.equal(await nav.getByRole('link', { name: 'ログイン', exact: true }).getAttribute('href'), '/login/member');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const fixed = page.getByRole('navigation', { name: 'いつでも会員登録・ログイン' });
      assert.equal(await fixed.isVisible(), width <= 700);
      if (width <= 700) {
        const rect = await fixed.boundingBox(); assert.ok(Math.abs(rect.y + rect.height - 850) <= 1);
        await page.screenshot({ path: `/tmp/signup-entry-qa/lp-${width}.png` });
        await page.locator('.welcome-footer').scrollIntoViewIfNeeded();
        assert.ok(await fixed.isVisible());
        await fixed.getByRole('link', { name: '新規会員登録', exact: true }).click();
      } else await nav.getByRole('link', { name: '新規会員登録', exact: true }).click();
      await page.getByRole('heading', { name: '新規会員登録', exact: true }).waitFor();
      assert.equal(await page.locator('input:not([type="checkbox"]),textarea').count(), 0);
      const register = page.getByRole('button', { name: 'Googleで登録', exact: true });
      assert.ok(await register.isDisabled());
      await page.getByRole('checkbox').check(); assert.ok(await register.isEnabled());
      await page.route('**/api/register', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: '通信テスト：もう一度お進みください。' }) }));
      await register.click(); await page.getByRole('alert').waitFor(); assert.ok(await register.isEnabled());
      await page.screenshot({ path: `/tmp/signup-entry-qa/register-${width}.png` });
      await page.getByRole('link', { name: 'ログインはこちら' }).click();
      await page.getByRole('heading', { name: '会員ログイン', exact: true }).waitFor();
      await page.goBack(); await page.getByRole('heading', { name: '新規会員登録', exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 850 } });
    await context.addCookies([{ name: 'member_session', value: cookie.split('=')[1], url: base }]);
    const page = await context.newPage();
    await page.goto(base + '/register/complete');
    await page.getByRole('heading', { name: 'プロフィール設定', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, '登録案内と入力を重ねない');
    await page.reload(); await page.getByRole('heading', { name: 'プロフィール設定', exact: true }).waitFor();
    await page.getByLabel('会社名・屋号', { exact: false }).fill('一度だけ入力する会社');
    await page.getByRole('button', { name: 'プロフィールを保存する', exact: true }).click();
    await page.getByRole('heading', { name: 'まずは投稿してみよう！', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.ok(!page.url().includes('welcome'));
    assert.equal((await member()).company, '一度だけ入力する会社');
    await page.getByRole('button', { name: 'あとで', exact: true }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await context.close();
  } finally { await browser.close(); }
  } else {
    const html = await (await fetch('/?welcome=registered', { headers: { cookie } })).text();
    assert.match(html, /会員登録ができました。会社名や業種を入力して/);
    const profile = new FormData();
    profile.set('displayName', 'Googleのお名前'); profile.set('company', '一度だけ入力する会社');
    profile.set('industries', JSON.stringify(['印刷'])); profile.set('notifyIndustries', JSON.stringify([]));
    const saved = await fetch('/api/profile', { method: 'PATCH', headers: { origin: base, cookie }, body: profile });
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.equal((await member()).company, '一度だけ入力する会社');
    assert.doesNotMatch(await (await fetch('/?welcome=registered', { headers: { cookie } })).text(), /会員登録ができました。会社名や業種を入力して/);
  }
  // 登録済みプロフィール・人数と利用停止状態は変更しない。
  const original = await member();
  result = await callback(await start(await newDraft()));
  assert.ok(sessionCookie(result)); assert.equal((await member()).company, original.company); assert.equal((await member()).id, original.id);
  assert.equal((await db.prepare('SELECT count(*) n FROM members WHERE email=?').bind(googleEmail).first()).n, 1);
  for (const status of ['invited', 'canceled', 'suspended', 'past_due']) {
    await db.prepare('UPDATE members SET membership_status=?,membership_period_end=? WHERE email=?').bind(status, '2000-01-01', googleEmail).run();
    result = await callback(await start(await newDraft()));
    assert.equal((await member()).membership_status, status);
    if (status !== 'invited') assert.equal(sessionCookie(result), undefined);
  }
  googleEmail = 'expired-new@example.com';
  const expired = await newDraft(); auth = await start(expired);
  await db.prepare('UPDATE meeting_signup_drafts SET expires_at=? WHERE id=?').bind('2000-01-01', expired).run();
  result = await callback(auth); assert.equal(sessionCookie(result), undefined); assert.equal(await member(), null);
  if (apiOnly) console.log('PASS API-only: consent/origin/referral, verified signup, Google name retained, profile once through real API and SSR, existing-profile/status protection, OAuth cancellation/state/expiry. Browser UI not run.');
  else console.log('PASS: 360/390/430/1280px LP CTA links, fixed mobile actions, no duplicate profile form, consent/failure/retry/back, verified signup, profile once and reload, post prompt, existing-profile/status protection, OAuth cancellation/state/expiry. No live accounts or emails.');
} finally { await mf.dispose(); }
