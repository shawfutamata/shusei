// 隔離D1・偽Resend・ブラウザ内の偽APIのみ。本番会員や実メール、LINE APIには触れない。
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-signup-'));
await build({ entryPoints: [resolve('tests/line-signup-worker.ts')], outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', alias: { 'next/server': 'vinext/shims/server' }, external: ['cloudflare:workers'], tsconfig: resolve('tsconfig.json'), define: { 'import.meta.env.DEV': 'false' } });
const bindings = { AUTH_CODE_PEPPER: 'fake-test-pepper', RESEND_API_KEY: 'fake-only', AUTH_FROM_EMAIL: 'test@example.com', LINE_DATA_POLICY_READY: 'true', LINE_LOGIN_ENABLED: 'true', LINE_SIGNUP_ENABLED: 'true', LINE_LOGIN_CHANNEL_ID: 'fake-client', LINE_LOGIN_CHANNEL_SECRET: 'fake-secret', LINE_PROVIDER_ID: 'fake-provider', LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 42).toString('base64'), LINE_TOKEN_KEY_VERSION: 'test-v1' };
let mailStatus = 200;
const mails = [];
const options = { modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'signup-test' }, r2Buckets: ['AVATARS'], bindings, outboundService: async request => {
  assert.equal(request.url, 'https://api.resend.com/emails', 'no LINE or real outbound request');
  mails.push(await request.json()); return new Response('{}', { status: mailStatus });
} };
const mf = new Miniflare(options);
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB'), base = (await mf.ready).origin;
  const call = async (action, data = {}) => { const r = await worker.fetch('https://test.example/', { method: 'POST', body: JSON.stringify({ action, ...data }) }); return { status: r.status, body: await r.json() }; };
  const good = async (action, data = {}) => { const r = await call(action, data); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
  const input = { name: '本人の入力名', email: 'new@example.com', consent: true, lineConsent: true };
  const latestCode = () => mails.at(-1).text.match(/確認コード: (\d{6})/)[1];
  const releaseCooldown = email => db.prepare('UPDATE line_signup_drafts SET requested_at=0 WHERE email=?').bind(email).run();
  await good('init');
  for (const extra of [{ consent: false }, { lineConsent: false }, { name: '' }, { name: 'a'.repeat(121) }, { email: 'invalid' }, { invite: 'x'.repeat(17) }]) assert.equal((await call('request', { ...input, ...extra })).status, 400);
  assert.equal(mails.length, 0, 'invalid input never mails');
  await db.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at) VALUES('existing','Existing@Example.com','既存会員','active',?)").bind(new Date().toISOString()).run();
  assert.match((await call('request', { ...input, email: ' EXISTING@example.com ' })).body.error, /登録済み/);
  assert.equal(mails.length, 0, 'existing account never overwritten or merged');
  const requests = await Promise.all(Array.from({ length: 8 }, () => call('request', input)));
  assert.equal(requests.filter(r => r.status === 200).length, 1, 'one concurrent email accepted'); assert.equal(mails.length, 1);
  const draft = requests.find(r => r.status === 200).body, code = latestCode();
  assert.deepEqual(mails[0].to, ['new@example.com']);
  const stored = await db.prepare('SELECT * FROM line_signup_drafts WHERE id=?').bind(draft.draftId).first();
  assert.equal(stored.name, input.name); assert.equal(stored.email, input.email); assert.equal(stored.mail_consent, 0);
  assert.notEqual(stored.browser_hash, draft.browserToken); assert.notEqual(stored.code_hash, code); assert.match(stored.code_hash, /^[a-f0-9]{64}$/);
  assert.equal(stored.code_expires_at - stored.requested_at, 600000); assert.equal(stored.expires_at - stored.requested_at, 1200000);
  assert.equal(await good('verified', draft), null, 'unverified draft cannot start OAuth');
  assert.equal((await call('verify', { ...draft, browserToken: '0'.repeat(64), code })).status, 400, 'browser binding');
  assert.equal((await db.prepare('SELECT attempts FROM line_signup_drafts WHERE id=?').bind(draft.draftId).first()).attempts, 0, 'different browser cannot lock out owner');
  assert.equal((await call('verify', { ...draft, code: 'invalid' })).status, 400);
  const wrong = code === '000000' ? '000001' : '000000';
  const guesses = await Promise.all(Array.from({ length: 12 }, () => call('verify', { ...draft, code: wrong })));
  assert.ok(guesses.every(r => r.status === 400));
  assert.equal((await db.prepare('SELECT attempts FROM line_signup_drafts WHERE id=?').bind(draft.draftId).first()).attempts, 5, 'five attempts even in parallel');
  assert.equal((await call('verify', { ...draft, code })).status, 400, 'correct code cannot bypass lockout');
  await releaseCooldown(input.email); const retry = await good('request', { ...input, ...draft });
  await db.prepare('UPDATE line_signup_drafts SET code_expires_at=0 WHERE id=?').bind(retry.draftId).run();
  assert.equal((await call('verify', { ...retry, code: latestCode() })).status, 400, 'expired code rejected');
  await releaseCooldown(input.email); const valid = await good('request', { ...input, ...draft, mailConsent: true }); const validCode = latestCode();
  const confirmations = await Promise.all(Array.from({ length: 8 }, () => call('verify', { ...valid, code: validCode })));
  assert.equal(confirmations.filter(r => r.status === 200).length, 1, 'one code verification succeeds');
  const profile = await good('verified', valid);
  assert.equal(profile.name, input.name); assert.equal(profile.email, input.email); assert.equal(profile.mailConsent, true);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM members').first()).n, 1, 'even verified email does not create membership');
  assert.equal(await good('verified', { ...valid, browserToken: '' }), null, 'missing browser cannot pass public check');
  assert.equal(await good('verified', { ...valid, browserToken: '1'.repeat(64) }), null);
  assert.deepEqual(await good('verified', { draftId: valid.draftId }), profile, 'trusted callback may omit browser');
  const afterVerify = await db.prepare('SELECT * FROM line_signup_drafts WHERE id=?').bind(valid.draftId).first();
  assert.equal(afterVerify.code_hash, ''); assert.equal(afterVerify.code_expires_at, 0);
  assert.equal((await call('verify', { ...valid, code: validCode })).status, 400, 'verified code cannot replay');
  await db.prepare('UPDATE line_signup_drafts SET consumed_at=? WHERE id=?').bind(Date.now(), valid.draftId).run();
  assert.equal(await good('verified', valid), null, 'consumed draft rejected');
  await db.prepare('UPDATE line_signup_drafts SET consumed_at=0,expires_at=0 WHERE id=?').bind(valid.draftId).run();
  assert.equal(await good('verified', valid), null, 'expired draft rejected');
  await releaseCooldown(input.email);
  const replacement = await good('request', { ...input, email: ' NEW@example.com ' });
  assert.notEqual(replacement.draftId, valid.draftId); assert.equal(await good('verified', valid), null, 'replacement invalidates old browser draft');
  const failedInput = { ...input, email: 'failed@example.com' }; mailStatus = 503;
  assert.equal((await call('request', failedInput)).status, 400);
  const failed = await db.prepare("SELECT * FROM line_signup_drafts WHERE email='failed@example.com'").first();
  assert.equal(failed.code_hash, ''); assert.equal(failed.attempts, 5); assert.equal(failed.code_expires_at, 0);
  const beforeRetry = mails.length;
  assert.equal((await call('request', failedInput)).status, 400); assert.equal(mails.length, beforeRetry, 'failed send keeps cooldown'); mailStatus = 200;
  const backup = JSON.parse((await good('backup')).body); assert.ok(!Object.keys(backup.data).some(name => name.startsWith('line_')), 'LINE drafts absent from backup');

  let apiIp = 0;
  const post = (body, { origin = base, cookie = '', ip = `api-${apiIp++}`, contentType = 'application/json' } = {}) => worker.fetch(base + '/api/auth/line/registration', { method: 'POST', headers: { origin, cookie, 'cf-connecting-ip': ip, 'content-type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await post({ action: 'request', ...input }, { origin: 'https://other.example' })).status, 403);
  assert.equal((await post({ action: 'request', ...input }, { origin: '' })).status, 403);
  assert.equal((await post('[]')).status, 400); assert.equal((await post('{')).status, 400); assert.equal((await post({ action: 'other' })).status, 400);
  assert.equal((await post({ action: 'request', ...input }, { contentType: 'text/plain' })).status, 400);
  assert.equal((await post(' '.repeat(4097))).status, 400, 'streamed body bounded even without content-length');
  const apiResponse = await post({ action: 'request', ...input, email: 'api@example.com' }); assert.equal(apiResponse.status, 200, await apiResponse.clone().text());
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store'); assert.equal(apiResponse.headers.get('referrer-policy'), 'no-referrer');
  const apiBody = await apiResponse.json(), apiCode = latestCode(), cookieHeader = apiResponse.headers.get('set-cookie');
  assert.match(cookieHeader, /line_signup_browser=/); assert.match(cookieHeader, /HttpOnly/); assert.match(cookieHeader, /Secure/); assert.match(cookieHeader, /SameSite=lax/i); assert.match(cookieHeader, /Max-Age=1200/);
  assert.deepEqual(Object.keys(apiBody), ['draftId'], 'browser secret not in JSON');
  const cookie = cookieHeader.split(';')[0];
  assert.equal((await post({ action: 'verify', ...apiBody, code: apiCode })).status, 400);
  const verifiedResponse = await post({ action: 'verify', ...apiBody, code: apiCode }, { cookie }); assert.equal(verifiedResponse.status, 200);
  assert.deepEqual(await verifiedResponse.json(), { next: `/api/auth/line/start?signup=1&draft=${apiBody.draftId}` }, 'no personal input in OAuth URL');
  for (let i = 0; i < 8; i++) assert.equal((await post({ action: 'request', ...input, name: '' }, { ip: 'limit-ip' })).status, 400);
  assert.equal((await post({ action: 'request', ...input }, { ip: 'limit-ip' })).status, 429, 'request rate limit is atomic');
  const verifies = await Promise.all(Array.from({ length: 35 }, () => post({ action: 'verify', draftId: '', code: '000000' }, { ip: 'verify-ip' })));
  assert.equal(verifies.filter(r => r.status === 400).length, 30); assert.equal(verifies.filter(r => r.status === 429).length, 5, 'parallel verify rate limit');
  const off = new Miniflare({ ...options, bindings: { ...bindings, LINE_SIGNUP_ENABLED: 'false' } });
  try { const offWorker = await off.getWorker(), offBase = (await off.ready).origin; const r = await offWorker.fetch(offBase + '/api/auth/line/registration', { method: 'POST', headers: { origin: offBase }, body: '{}' }); assert.equal(r.status, 503); } finally { await off.dispose(); }
  console.log('PASS: LINE signup direct inputs, consent, no existing-account takeover, hashed/browser-bound OTP, atomic 60s resend and five attempts, expiry/replay, failed delivery, no premature member, backup exclusion, Origin/body/cookie/rate limits and OFF gate.');
} finally { await mf.dispose(); }

// ブラウザ実行は許可済みの環境で明示的に指定した場合だけ。既定は隔離API試験。
if (process.argv.includes('--ui')) await verifyUI();
rmSync(dir, { recursive: true, force: true });

async function verifyUI() {
  const output = join(dir, 'client.js');
  await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import RegisterForm from './app/register/RegisterForm'; import './app/globals.css'; import './app/meeting/meeting.css'; createRoot(document.getElementById('root')).render(<RegisterForm invite="" />);`, resolveDir: resolve('.'), loader: 'tsx' }, outfile: output, bundle: true, format: 'esm', platform: 'browser', tsconfig: resolve('tsconfig.json'), define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl' } });
  const server = createServer((req, res) => {
    if (req.url === '/client.js') { res.setHeader('content-type', 'text/javascript'); res.end(readFileSync(output)); }
    else if (req.url === '/client.css') { res.setHeader('content-type', 'text/css'); res.end(readFileSync(join(dir, 'client.css'))); }
    else { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LINE signup isolated test</title><link rel="stylesheet" href="/client.css"><div id="root"></div><script type="module" src="/client.js"></script></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const shots = resolve('artifacts/line-signup'); mkdirSync(shots, { recursive: true });
  try {
    for (const width of [360, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      let requests = [], delayed = false, release;
      await page.route('**/api/auth/line/config', route => route.fulfill({ json: { login: true, signup: true } }));
      await page.route('**/api/auth/line/registration', async route => {
        const body = route.request().postDataJSON(); requests.push(body);
        if (delayed) await new Promise(resolve => { release = resolve; });
        if (body.action === 'request') await route.fulfill({ json: { draftId: '12345678-abcd-1234-abcd-123456789abc' } });
        else await route.fulfill({ status: 400, json: { error: '確認コードが正しくありません。再入力してください。' } });
      });
      await page.goto(base); await page.getByRole('heading', { name: 'LINEで登録する方へ' }).waitFor();
      assert.equal(await page.getByLabel(/登録メールで/).isChecked(), false);
      assert.equal(await page.getByRole('button', { name: 'Googleで登録', exact: true }).isDisabled(), true);
      await page.getByRole('checkbox').first().check();
      assert.equal(await page.getByRole('button', { name: 'Googleで登録', exact: true }).isEnabled(), true, 'Google needs no extra name/email');
      await page.getByLabel('お名前（必須）').fill('入力した本人'); await page.getByLabel('メールアドレス（必須）').fill('person@example.com');
      await page.getByRole('checkbox').nth(1).check();
      const lineButton = page.getByRole('button', { name: 'LINE登録の確認コードを送る' });
      assert.equal(await lineButton.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(6, 123, 53)', 'LINE stays green');
      assert.ok(await lineButton.evaluate(el => el.getBoundingClientRect().height >= 44));
      await page.screenshot({ path: join(shots, `signup-${width}.png`), fullPage: true });
      delayed = true;
      await lineButton.click(); await page.getByRole('button', { name: '確認コードを送信中…' }).waitFor();
      assert.equal(requests.length, 1); assert.equal(await page.getByRole('button', { name: '確認コードを送信中…' }).isDisabled(), true);
      await page.getByRole('button', { name: 'LINE登録を中断・入力し直す' }).click();
      release(); delayed = false;
      await page.getByRole('button', { name: 'LINE登録の確認コードを送る' }).click();
      const otp = page.getByLabel('メールの6桁の確認コード'); await otp.waitFor();
      assert.equal(await otp.getAttribute('inputmode'), 'numeric'); assert.equal(await otp.getAttribute('autocomplete'), 'one-time-code');
      await otp.fill('000000'); await page.getByRole('button', { name: 'メールを確認してLINEへ進む' }).click();
      await page.getByRole('alert').filter({ hasText: '確認コードが正しくありません' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'メールを確認してLINEへ進む' }).isEnabled(), true, 'retry enabled after error');
      assert.equal(await page.getByRole('button', { name: /秒後に再送できます/ }).isDisabled(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: no horizontal overflow`);
      await page.screenshot({ path: join(shots, `code-error-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'LINE登録を中断・入力し直す' }).click();
      await page.getByLabel('お名前（必須）').waitFor(); assert.equal(await page.getByLabel('お名前（必須）').inputValue(), '入力した本人');
      assert.equal(await page.getByRole('checkbox').first().isEnabled(), true, 'cancel restores editable consent');
      await page.route('**/api/register', async route => { const body = route.request().postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['action', 'authProvider', 'consent', 'invite']); await route.fulfill({ status: 400, json: { error: 'Googleの試験エラー' } }); });
      await page.getByRole('button', { name: 'Googleで登録', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Googleの試験エラー' }).waitFor();
      await context.close();
    }
    const context = await browser.newContext(); const page = await context.newPage();
    await page.route('**/api/auth/line/config', route => route.fulfill({ json: { login: false, signup: false } }));
    await page.goto(base); await page.getByRole('button', { name: 'Googleで登録' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'LINEで登録する方へ' }).count(), 0, 'OFF gate keeps legacy Google signup');
    await context.close();
    console.log('PASS: Actual RegisterForm at 360/390/430px: green 44px+ action, labels/input modes, optional notice OFF, pending/cancel, OTP retry, resend cooldown, no overflow, unchanged Google payload, and hidden LINE when OFF. Screenshots: artifacts/line-signup/.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
