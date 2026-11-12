// Request.cf は組込みの偽メタデータを使い、外部 cf.json の自動取得を行わない。
import { mockStatelessToken } from './line-stateless-fixture.mjs';
// 隔離D1と偽メール配送のみ。実メール、本番データ、公開には触れない。
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-privacy-'));
await build({ entryPoints: [resolve('tests/line-worker.ts')], outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], tsconfig: resolve('tsconfig.json'), define: { 'import.meta.env.DEV': 'false' } });
let mailStatus = 200;
const mails = [];
const mf = new Miniflare({ cf: false, modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'privacy-test' }, r2Buckets: ['AVATARS'], bindings: { AUTH_CODE_PEPPER: 'test-only', RESEND_API_KEY: 'fake-only', AUTH_FROM_EMAIL: 'test@example.com', LINE_PROVIDER_ID: 'test-provider',LINE_LOGIN_CHANNEL_ID:'test-client', LINE_LOGIN_CHANNEL_SECRET: 'test-secret',LINE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),LINE_TOKEN_KEY_VERSION:'v1' }, outboundService: async request => {
  const url=new URL(request.url);
    if (url.pathname === '/oauth2/v3/token') return mockStatelessToken(request, 'test-client', 'test-secret', 'fake-deauth');
  if(url.hostname==='api.line.me'){
    if(url.pathname.endsWith('/verify'))return Response.json({client_id:'test-client',expires_in:3600,scope:'openid'});
    if(url.pathname.endsWith('/userinfo'))return Response.json({sub:request.headers.get('authorization').split('fixture-access-')[1]});
    if(url.pathname.endsWith('/deauthorize'))return new Response(null,{status:204});
    throw new Error('unmocked LINE path');
  }
  assert.equal(request.url, 'https://api.resend.com/emails', 'all outbound requests mocked');
  mails.push(await request.json()); return new Response('{}', { status: mailStatus });
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB');
  const call = async (action, data = {}) => { const r = await worker.fetch('https://test.example/', { method: 'POST', body: JSON.stringify({ action, ...data }) }); return { status: r.status, body: await r.json() }; };
  const good = async (action, data = {}) => { const r = await call(action, data); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
  await good('init');
  for (const id of ['member-a','member-b']) await db.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at) VALUES(?,?,?,'active',?)").bind(id, `${id}@example.com`, id, new Date().toISOString()).run();
  const session = await good('google', { email: 'member-a@example.com' });
  const other = await good('google', { email: 'member-b@example.com' });
  const latestCode = () => mails.at(-1).text.match(/確認コード: (\d{6})/)[1];
  const releaseCooldown = () => db.prepare("UPDATE line_privacy_codes SET requested_at=0 WHERE member_id='member-a'").run();
  const request = () => good('privacyRequest', { purpose: 'unlink' });
  const confirm = (code, extra = {}) => call('privacyConfirm', { token: session.token, purpose: 'unlink', code, ...extra });
  const requests = await Promise.all(Array.from({ length: 8 }, () => call('privacyRequest', { purpose: 'unlink' })));
  assert.equal(requests.filter(r => r.status === 200).length, 1, 'one concurrent request accepted'); assert.equal(mails.length, 1, 'one email only');
  assert.deepEqual(mails[0].to, ['member-a@example.com']);
  const code = latestCode();
  assert.equal((await confirm(code, { token: other.token })).status, 400, 'code bound to member');
  assert.equal((await confirm(code, { purpose: 'withdraw' })).status, 400, 'code bound to operation');
  assert.equal((await db.prepare("SELECT attempts FROM line_privacy_codes WHERE member_id='member-a'").first()).attempts, 1, 'wrong purpose consumes attempt');
  assert.equal((await confirm('invalid')).status, 400, 'format rejected');
  const wrong = code === '000000' ? '000001' : '000000';
  const guesses = await Promise.all(Array.from({ length: 12 }, () => confirm(wrong)));
  assert.ok(guesses.every(r => r.status === 400));
  assert.equal((await db.prepare("SELECT attempts FROM line_privacy_codes WHERE member_id='member-a'").first()).attempts, 5, 'parallel wrong guesses capped at five');
  assert.equal((await confirm(code)).status, 400, 'correct code cannot bypass lockout');
  await releaseCooldown(); await request(); const expired = latestCode();
  await db.prepare("UPDATE line_privacy_codes SET expires_at=0 WHERE member_id='member-a'").run(); assert.equal((await confirm(expired)).status, 400, 'expired code rejected');
  await releaseCooldown(); await request(); const replacement = latestCode();
  // LINE-only session and inactive membership may still use independently verified privacy controls.
  await good('link'); const lineSession = await good('login');
  await db.prepare("UPDATE members SET membership_status='canceled' WHERE id='member-a'").run();
  const confirmations = await Promise.all(Array.from({ length: 8 }, () => confirm(replacement, { token: lineSession.token })));
  assert.equal(confirmations.filter(r => r.status === 200).length, 1, 'only one concurrent code consumer succeeds');
  assert.equal(await good('access', lineSession), null, 'unlink revokes LINE session');
  assert.ok(await good('access', session), 'independent session retained even when membership inactive');
  assert.equal((await confirm(replacement)).status, 400, 'code cannot replay');
  assert.equal(await db.prepare("SELECT * FROM line_accounts WHERE member_id='member-a'").first(), null);
  await request(); const old = latestCode(); await releaseCooldown(); await good('privacyRequest', { purpose: 'withdraw' });
  assert.equal((await confirm(old)).status, 400, 'new purpose invalidates old code');
  const withdrawalCode = latestCode();
  assert.equal((await confirm(withdrawalCode, { purpose: 'withdraw' })).status, 200, 'clean account can withdraw while inactive');
  assert.equal(await db.prepare("SELECT * FROM members WHERE id='member-a'").first(), null);
  mailStatus = 503;
  const failed = await call('privacyRequest', { member: 'member-b', purpose: 'unlink' }); assert.equal(failed.status, 400);
  const failedCode = await db.prepare("SELECT * FROM line_privacy_codes WHERE member_id='member-b'").first();
  assert.equal(failedCode.code_hash, '', 'unconfirmed delivery invalidates code'); assert.equal(failedCode.attempts, 5); assert.ok(failedCode.requested_at > 0);
  const mailCount = mails.length;
  assert.equal((await call('privacyRequest', { member: 'member-b', purpose: 'unlink' })).status, 400, 'failed delivery retains resend cooldown'); assert.equal(mails.length, mailCount, 'cooldown prevents another send');
  assert.equal((await confirm(latestCode(), { token: other.token })).status, 400, 'even delivered-but-unconfirmed code is unusable');
  console.log('PASS: privacy OTP request concurrency/cooldown, member/purpose binding, five-attempt lockout, expiration, one-time parallel consumption, inactive LINE-only unlink, replacement, withdrawal, and failed-delivery invalidation.');
} finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
