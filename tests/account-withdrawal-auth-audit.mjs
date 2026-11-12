import { mockStatelessToken } from './line-stateless-fixture.mjs';
// 退会後の旧認証・独立メール確認済みLINE登録draftを再利用できないことを隔離検証する。
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-withdrawal-auth-'));
await build({ entryPoints: [resolve('tests/account-withdrawal-auth-worker.ts')], outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], tsconfig: resolve('tsconfig.json'), define: { 'import.meta.env.DEV': 'false' } });
let deauthorizations = 0;
const mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'withdrawal-auth' }, r2Buckets: ['AVATARS'], bindings: { AUTH_CODE_PEPPER: 'fixture-only', LINE_PROVIDER_ID: 'fixture-provider', LINE_LOGIN_CHANNEL_ID: 'fixture-channel', LINE_LOGIN_CHANNEL_SECRET: 'fixture-secret', LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), LINE_TOKEN_KEY_VERSION: 'test-v1' }, outboundService: async request => {
  const url = new URL(request.url); assert.equal(url.origin, 'https://api.line.me');
    if (url.pathname === '/oauth2/v3/token') return mockStatelessToken(request, 'fixture-channel', 'fixture-secret', 'fixture-login-channel-token');
  if (url.pathname === '/oauth2/v2.1/verify' && request.method === 'GET') { assert.match(url.searchParams.get('access_token'), /^fixture-access-U[0-9a-f]{32}$/); return Response.json({ client_id: 'fixture-channel', scope: 'openid', expires_in: 3600 }); }
  if (url.pathname === '/oauth2/v2.1/userinfo') { const auth = request.headers.get('authorization'); assert.match(auth, /^Bearer fixture-access-U[0-9a-f]{32}$/); return Response.json({ sub: auth.slice('Bearer fixture-access-'.length) }); }
  if (url.pathname === '/user/v1/deauthorize') { deauthorizations++; assert.equal(request.headers.get('authorization'), 'Bearer fixture-login-channel-token'); return new Response(null, { status: 204 }); }
  throw new Error('Unmocked external request');
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB');
  const call = async (action, body = {}) => { const r = await worker.fetch('https://fixture.test/', { method: 'POST', body: JSON.stringify({ action, ...body }) }); return { status: r.status, body: await r.json() }; };
  const good = async (action, body) => { const r = await call(action, body); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
  await good('init');
  const seed = async id => { await db.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at) VALUES(?,?,?,'active',?)").bind(id, `${id}@example.test`, id, new Date().toISOString()).run(); return { member: id, email: `${id}@example.test` }; };
  const a = await seed('old-session'), session = await good('session', a);
  const captured = await good('access', { token: session.token });
  const sub = 'U' + 'a'.repeat(32); await good('line-link', { ...a, sub });
  const lineSession = await good('line-login', { sub });
  const linkFlow = await good('flow', { ...a, token: session.token }), anonymousLoginFlow = await good('flow');
  assert.equal((await call('delete', a)).status, 400, 'linked LINE account must be officially unlinked before withdrawal');
  assert.ok(await good('access', { token: session.token })); assert.ok(await good('access', lineSession)); assert.equal(deauthorizations, 0);
  await good('line-unlink', { ...a, token: session.token }); assert.equal(deauthorizations, 1);
  await good('delete', a);
  assert.equal(await good('access', { token: session.token }), null, 'old Google cookie / bearer session is invalid');
  assert.equal(await good('access', lineSession), null, 'old LINE cookie / bearer session is invalid');
  assert.equal(await good('consume', linkFlow), null, 'pending member-linked OAuth invalidated');
  assert.ok(await good('consume', anonymousLoginFlow), 'anonymous login state has no member link to revoke');
  assert.equal((await call('line-login', { sub })).status, 400, 'anonymous LINE login cannot restore deleted link');
  assert.equal((await call('line-link', { ...a, sub })).status, 400, 'in-flight LINE link cannot restore deleted member');
  assert.equal((await call('session', a)).status, 400, 'existing-email session helper does not register');
  console.log('SAFE: old cookie/bearer/LINE sessions and pending link rejected; anonymous LINE login does not recreate.');

  // Models a request that passed requireActiveMember before withdrawal, then resumes
  // at getBoardData/createRequest/etc -> upsertMember after withdrawal has committed.
  assert.equal((await call('stale-upsert', { user: captured.user })).status, 400);
  assert.equal(await db.prepare('SELECT * FROM members WHERE id=?').bind(a.member).first(), null);
  console.log('PASS: in-flight upsertMember cannot restore deleted member ID/profile.');

  const b = await seed('google-early'); await good('delete', b);
  assert.equal((await call('session', b)).status, 400);
  // Callback is inspected here; its full HTTP behavior belongs to the built-route suite.
  const callbackSource = readFileSync('app/api/auth/google/callback/route.ts', 'utf8');
  assert.doesNotMatch(callbackSource, /registerEarlyAccessMember|registerInvitedMember/);
  assert.match(callbackSource, /directSignup&&jar.get\(GOOGLE_PROFILE_COOKIE\)/);
  assert.equal(await db.prepare('SELECT id FROM members WHERE email=?').bind(b.email).first(), null);
  console.log('PASS: normal Google callback contains no implicit early/invite registration; consented draft signup remains.');

  const c = await seed('pending-line-signup'), draft = await good('line-draft', c);
  const unrelatedLineDraft = await good('line-draft', { email: 'unrelated-line-signup@example.test' });
  const pendingLineSignup = await good('signup-flow', { draft });
  await good('delete', c);
  assert.equal(await good('consume', pendingLineSignup), null, 'LINE signup OAuth bound to withdrawn email is revoked');
  assert.equal(await db.prepare('SELECT id FROM line_signup_drafts WHERE id=?').bind(draft).first(), null);
  assert.ok(await db.prepare('SELECT id FROM line_signup_drafts WHERE id=?').bind(unrelatedLineDraft).first(), 'another email signup draft is preserved');
  assert.equal((await call('line-register', { ...c, draft, sub: 'U' + 'c'.repeat(32) })).status, 400);
  assert.equal(await db.prepare('SELECT id FROM members WHERE email=?').bind(c.email).first(), null);
  console.log('PASS: independent email/name signup draft and its OAuth flow are erased; stale LINE signup cannot recreate the account.');

  const d = await seed('pending-code'), emailDraft = await good('draft');
  const hash = await good('hash-registration', d);
  await db.prepare("INSERT INTO meeting_registration_codes(email,event_id,code_hash,expires_at,requested_at,draft_id) VALUES(?,'direct',?,?,?,?)").bind(d.email, hash, new Date(Date.now()+600000).toISOString(), new Date().toISOString(), emailDraft).run();
  const pendingSignup = await good('signup-flow', { draft: emailDraft });
  await good('delete', d);
  assert.equal(await good('consume', pendingSignup), null, 'exclusively email-linked signup OAuth revoked');
  assert.equal(await db.prepare('SELECT email FROM meeting_registration_codes WHERE email=?').bind(d.email).first(), null);
  assert.equal(await db.prepare('SELECT id FROM meeting_signup_drafts WHERE id=?').bind(emailDraft).first(), null);
  assert.equal((await call('verify-registration', d)).status, 400);
  assert.equal(await db.prepare('SELECT id FROM members WHERE email=?').bind(d.email).first(), null);
  console.log('PASS: pre-withdrawal registration code and exclusively linked draft erased; stale code cannot recreate account.');

  const e = await seed('shared-draft-owner'), sharedDraft = await good('draft');
  for (const email of [e.email, 'unrelated@example.test']) await db.prepare("INSERT INTO meeting_registration_codes(email,event_id,code_hash,expires_at,requested_at,draft_id) VALUES(?,'direct','fixture-hash',?,?,?)").bind(email, new Date(Date.now()+600000).toISOString(), new Date().toISOString(), sharedDraft).run();
  const sharedFlow = await good('signup-flow', { draft: sharedDraft });
  await good('delete', e);
  assert.equal(await db.prepare('SELECT email FROM meeting_registration_codes WHERE email=?').bind(e.email).first(), null);
  assert.ok(await db.prepare("SELECT email FROM meeting_registration_codes WHERE email='unrelated@example.test'").first());
  assert.ok(await db.prepare('SELECT id FROM meeting_signup_drafts WHERE id=?').bind(sharedDraft).first());
  assert.ok(await good('consume', sharedFlow));
  console.log('PASS: shared draft / other email registration code / unbound OAuth preserved rather than deleting another person’s work.');

} finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
