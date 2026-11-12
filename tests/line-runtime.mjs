// Request.cf は組込みの偽メタデータを使い、外部 cf.json の自動取得を行わない。
import { mockStatelessToken } from './line-stateless-fixture.mjs';
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHmac, createHash } from 'node:crypto';
import { build } from 'esbuild';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-test-'));
await build({ entryPoints: [resolve('tests/line-worker.ts')], outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], tsconfig: resolve('tsconfig.json'), define: { 'import.meta.env.DEV': 'false' } });
const A = 'U' + 'a'.repeat(32), B = 'U' + 'b'.repeat(32), C = 'U' + 'c'.repeat(32);
const bindings = { AUTH_CODE_PEPPER: 'test-only', LINE_DATA_POLICY_READY: 'true', LINE_LOGIN_ENABLED: 'true', LINE_SIGNUP_ENABLED: 'true', LINE_NOTIFICATIONS_ENABLED: 'true', LINE_LOGIN_CHANNEL_ID: 'test-client', LINE_LOGIN_CHANNEL_SECRET: 'test-secret', LINE_PROVIDER_ID: 'test-provider', LINE_MESSAGING_PROVIDER_ID: 'test-provider', LINE_MESSAGING_CHANNEL_TOKEN: 'test-token', LINE_MESSAGING_CHANNEL_SECRET: 'test-webhook', LINE_BOT_USER_ID: 'U' + 'd'.repeat(32), LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), LINE_TOKEN_KEY_VERSION: 'test-v1' };
let pushStatus = 200, claims = {}, calls = [], verifyFails = false, friendshipCalls = 0;
const mf = new Miniflare({ cf: false, modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'line-test' }, r2Buckets: ['AVATARS'], bindings,
  outboundService: async request => {
    const url = new URL(request.url); assert.equal(url.hostname, 'api.line.me', 'no real external network');
    if (url.pathname === '/oauth2/v3/token') return mockStatelessToken(request, 'test-client', 'test-secret', 'fixture-login-channel-token');
    if (url.pathname.endsWith('/token')) { const form = new URLSearchParams(await request.text()); assert.equal(form.get('code_verifier'), 'v'.repeat(64)); return Response.json({ id_token: 'test-id-token', access_token: `fixture-access-${A}`, expires_in: 3600 }); }
    if (url.pathname.endsWith('/verify') && request.method === 'GET') { assert.match(url.searchParams.get('access_token'), /^fixture-access-U[0-9a-f]{32}$/); return Response.json({ client_id: 'test-client', scope: 'openid', expires_in: 3600 }); }
    if (url.pathname.endsWith('/verify')) { const form = new URLSearchParams(await request.text()); assert.equal(form.get('nonce'), 'nonce'); return Response.json({ iss: 'https://access.line.me', aud: 'test-client', exp: Math.floor(Date.now() / 1000) + 1000, iat: Math.floor(Date.now() / 1000), nonce: 'nonce', sub: A, name: 'Line Person', email: 'untrusted-line-email@example.com', ...claims }, { status: verifyFails ? 400 : 200 }); }
    if (url.pathname.endsWith('/userinfo')) { const auth = request.headers.get('authorization'); assert.match(auth, /^Bearer fixture-access-U[0-9a-f]{32}$/); return Response.json({ sub: auth.slice('Bearer fixture-access-'.length) }); }
    if (url.pathname === '/user/v1/deauthorize') { assert.equal(request.headers.get('authorization'), 'Bearer fixture-login-channel-token'); assert.match((await request.json()).userAccessToken, /^fixture-access-U[0-9a-f]{32}$/); return new Response(null, { status: 204 }); }
    if (url.pathname.endsWith('/status')) { friendshipCalls++; return Response.json({ friendFlag: true }); }
    assert.equal(url.pathname, '/v2/bot/message/push'); calls.push({ retry: request.headers.get('x-line-retry-key'), body: await request.json() });
    return new Response('{}', { status: pushStatus, headers: pushStatus === 409 ? { 'x-line-accepted-request-id': 'accepted' } : pushStatus === 302 ? { location: 'https://untrusted.example.invalid/collect' } : {} });
  } });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB');
  const call = async (action, data = {}) => { const r = await worker.fetch('https://test.example/', { method: 'POST', body: JSON.stringify({ action, ...data }) }); return { status: r.status, body: await r.json() }; };
  const good = async (action, data = {}) => { const r = await call(action, data); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
  await good('init');
  for (const id of ['member-a', 'member-b', 'member-c']) await db.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at) VALUES(?,?,?,'active',?)").bind(id, `${id}@example.com`, id, new Date().toISOString()).run();
  const flow = await good('flow', { returnTo: '//evil.example' });
  assert.equal(await good('consume', { ...flow, browser: '0'.repeat(64) }), null);
  const consumed = await good('consume', flow); assert.equal(consumed.returnTo, '/'); assert.equal(createHash('sha256').update(consumed.verifier).digest('base64url'), flow.challenge);
  assert.equal(await good('consume', flow), null, 'single use callback');
  const expired = await good('flow'); await db.prepare('UPDATE line_oauth_flows SET expires_at=0').run(); assert.equal(await good('consume', expired), null);
  assert.equal((await call('login')).status, 400, 'unlinked LINE cannot login');
  await good('link', { friend: true }); assert.equal((await good('status')).notifyMessage, false, 'default opt-out');
  assert.equal((await call('link', { member: 'member-b', friend: true })).status, 400, 'cannot steal another LINE');
  assert.equal((await call('link', { sub: B })).status, 400, 'cannot overwrite existing identity');
  const session = await good('login'); assert.equal((await good('access', session)).user.userId, 'member-a');
  assert.equal((await call('unlink', { token: session.token })).status, 400, 'LINE-only session cannot remove its only login');
  await db.prepare("UPDATE members SET membership_status='canceled' WHERE id='member-a'").run(); assert.equal((await call('login')).status, 400); await db.prepare("UPDATE members SET membership_status='active' WHERE id='member-a'").run();
  await good('notice', { key: 'opt-out' }); assert.equal(calls.length, 0);
  await good('preferences', { message: true, offer: true, proof: { subject: A, friend: true } });
  await Promise.all(Array.from({ length: 4 }, () => good('notice', { key: 'one' }))); assert.equal(calls.length, 1, 'concurrent delivery deduplicated'); assert.equal(calls[0].body.to, A); assert.match(calls[0].body.messages[0].text, /新しいメッセージ/);
  pushStatus = 302; const beforeRedirect = calls.length; await good('notice', { key: 'redirect' });
  assert.equal(calls.length, beforeRedirect + 1, 'push redirect is not followed');
  const redirectResult = await db.prepare("SELECT status,line_user_id,provider_id,consent_version,last_error FROM line_notification_outbox WHERE event_key='redirect'").first();
  assert.deepEqual(redirectResult, { status: 'failed', line_user_id: '', provider_id: '', consent_version: '', last_error: 'http_302' }, 'redirect is not accepted or retained for retry');
  pushStatus = 500; await good('notice', { key: 'retry' }); const retry = calls.at(-1).retry;
  await db.prepare("UPDATE line_notification_outbox SET available_at=0 WHERE event_key='retry'").run(); pushStatus = 409; await good('flush'); assert.equal(calls.at(-1).retry, retry, 'same retry key after failure');
  assert.equal((await db.prepare("SELECT status FROM line_notification_outbox WHERE event_key='retry'").first()).status, 'accepted');
  pushStatus = 500; await good('notice', { key: 'cancel' }); const beforeCancel = calls.length;
  await good('preferences', { message: false, offer: false }); await db.prepare("UPDATE line_notification_outbox SET available_at=0 WHERE event_key='cancel'").run(); await good('flush'); assert.equal(calls.length, beforeCancel, 'consent withdrawal cancels queued messages');
  const assertNoFriendRetention = async () => {
    const rows = (await db.prepare('SELECT friend,friend_updated_at FROM line_accounts').all()).results;
    assert.ok(rows.every(row => row.friend === 0 && row.friend_updated_at === 0), 'friend observations are never persisted');
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM line_webhook_events').first()).n, 0, 'no friend event history retained');
  };
  assert.equal((await call('preferences', { message: true, offer: true })).status, 400, 'ON requires interactive verified proof');
  assert.equal((await call('preferences', { message: true })).status, 400, 'identity proof required');
  assert.equal((await call('preferences', { message: true, proof: { subject: B, friend: true } })).status, 400, 'proof must belong to linked identity');
  await db.prepare("UPDATE line_authorizations SET status='deauthorize_pending' WHERE member_id='member-a'").run();
  await db.prepare("INSERT INTO line_notification_outbox(event_key,member_id,provider_id,line_user_id,consent_version,kind,message_text,retry_key,available_at,created_at) VALUES('keep-on-rejection','member-a','test-provider',?,'old','message','fixture','keep-on-rejection',?,?)").bind(A,Date.now()+3600000,Date.now()).run();
  assert.equal((await call('preferences', { message: true, proof: { subject: A } })).status, 400, 'pending authorization cannot enable notices');
  assert.equal((await db.prepare("SELECT status FROM line_notification_outbox WHERE event_key='keep-on-rejection'").first()).status,'pending','rejected preference change leaves existing outbox untouched');
  await db.prepare("DELETE FROM line_notification_outbox WHERE event_key='keep-on-rejection'").run();
  await db.prepare("UPDATE line_authorizations SET status='active' WHERE member_id='member-a'").run();
  await good('preferences', { message: true, offer: true, proof: { subject: A, friend: true } });
  const consentAt = Date.parse((await db.prepare("SELECT consent_at FROM line_accounts WHERE member_id='member-a'").first()).consent_at);
  const block = { webhookEventId: 'block-1', type: 'unfollow', timestamp: consentAt, source: { type: 'user', userId: A } };
  await good('notice', { key: 'blocked-pending' });
  await good('webhook', { events: [block] }); assert.equal((await good('status')).notifyMessage, false);
  await good('webhook', { events: [{ ...block, type: 'follow', timestamp: consentAt + 1 }] });
  assert.equal((await good('status')).notifyMessage, false, 'follow never restarts notifications');
  await new Promise(resolve => setTimeout(resolve, 5));
  await good('preferences', { message: true, offer: true, proof: { subject: A, friend: true } });
  await good('webhook', { events: [block, { ...block, webhookEventId: 'old-delayed-block', timestamp: consentAt - 1 }] });
  assert.equal((await good('status')).notifyMessage, true, 'old unfollow cannot revoke later explicit consent');
  await assertNoFriendRetention();
  const raw = '{"events":[]}'; const signature = createHmac('sha256', bindings.LINE_MESSAGING_CHANNEL_SECRET).update(raw).digest('base64');
  assert.equal(await good('signature', { raw, signature }), true); assert.equal(await good('signature', { raw: raw + ' ', signature }), false); assert.equal(await good('signature', { raw, signature: 'invalid' }), false);
  const verified = await good('exchange'); assert.equal(verified.sub, A); assert.equal(verified.friend, undefined); assert.equal(verified.accessToken, `fixture-access-${A}`); assert.equal(verified.expiresIn, 3600); assert.equal(verified.email, undefined); assert.equal(verified.name, undefined, 'LINE profile/email claims are not retained');
  assert.equal(friendshipCalls, 0, 'login/signup must not fetch friendship');
  await good('exchange', { checkFriend: true }); assert.equal(friendshipCalls, 0, 'no friendship/profile API is called even if legacy input asks');
  for (const bad of [{ aud: 'other-client' }, { nonce: 'wrong' }, { iss: 'https://evil.example' }, { exp: 0 }, { sub: 'not-a-line-id' }]) { claims = bad; assert.equal((await call('exchange')).status, 400); } claims = {}; verifyFails = true; assert.equal((await call('exchange')).status, 400); verifyFails = false;
  assert.equal((await call('draft')).status, 400, 'LINE draft requires data consent');
  const googleDraft = await good('legacyDraft'); assert.equal((await call('register', { sub: B, draft: googleDraft })).body.error, 'line_draft', 'legacy meeting/Google draft cannot register a LINE account');
  const draft = await good('draft', { lineConsent: true }); const registered = await good('register', { sub: B, draft, friend: true, email: 'ignored-line-email@example.com' }); assert.equal((await good('access', registered)).membership.status, 'active');
  const newMember = await db.prepare("SELECT * FROM members WHERE email='new@example.com'").first(); assert.equal(newMember.company, '', 'deferred onboarding preserved'); assert.equal(newMember.membership_source, 'line_verified_signup'); assert.equal(newMember.display_name, '本人が入力した名前');
  const origin = await db.prepare('SELECT email_from_line,name_from_line FROM line_data_origins WHERE member_id=?').bind(newMember.id).first(); assert.deepEqual(origin, { email_from_line: 0, name_from_line: 0 });
  assert.equal((await good('status', { member: newMember.id })).notifyMessage, false);
  for (const field of ['mail_on_message','mail_on_offer','mail_on_request']) assert.equal(newMember[field], 0, 'email defaults OFF');
  assert.equal(await good('emailAllowed', { member: newMember.id }), true, 'independently verified email uses its own mail flags, not LINE-derived-email permission');
  const mailDraft = await good('draft', { lineConsent: true, mailConsent: true, email: 'mail-opt-in@example.com' });
  await good('register', { sub: 'U' + 'f'.repeat(32), draft: mailDraft, email: 'mail-opt-in@example.com' });
  const mailMember = await db.prepare("SELECT * FROM members WHERE email='mail-opt-in@example.com'").first();
  for (const field of ['mail_on_message','mail_on_offer','mail_on_request']) assert.equal(mailMember[field], 1, 'explicit email opt-in');
  assert.equal(await good('emailAllowed', { member: mailMember.id }), true);
  await good('stopEmail', { member: mailMember.id });
  const stoppedMail = await db.prepare('SELECT mail_on_message,mail_on_offer,mail_on_request FROM members WHERE id=?').bind(mailMember.id).first(); assert.ok(Object.values(stoppedMail).every(value => value === 0), 'withdrawal disables all optional email types');
  assert.equal(await good('emailAllowed', { member: 'member-a' }), true, 'existing independently acquired email unaffected');
  const existingDraft = await good('draft', { lineConsent: true, email: 'member-a@example.com' }); assert.equal((await call('register', { sub: C, draft: existingDraft })).body.error, 'line_existing');
  const unverifiedDraft = await good('draft', { lineConsent: true, email: 'unverified@example.com', verified: false }); assert.equal((await call('register', { sub: C, draft: unverifiedDraft })).body.error, 'line_draft');
  const racingDraft = await good('draft', { lineConsent: true, email: 'racing-user@example.com' }); const raced = await Promise.all([call('register', { sub: C, draft: racingDraft }), call('register', { sub: 'U' + 'e'.repeat(32), draft: racingDraft })]);
  assert.equal(raced.filter(r => r.status === 200).length, 1, 'draft consumed atomically');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM members WHERE email LIKE 'racing-%'").first()).n, 1, 'failed signup leaves no orphan member');
  pushStatus = 200; const sender = await good('google', { email: 'member-b@example.com' }); await good('message', sender); assert.doesNotMatch(JSON.stringify(calls.at(-1)), /非公開|秘密|member-b/);
  await db.prepare("INSERT INTO requests(id,author_id,title,description,category,budget_label,area,deadline,status,created_at) VALUES('fixture-request','member-a','秘密の案件','取引情報','project','','','','open',?)").bind(new Date().toISOString()).run();
  await good('offer', sender); assert.match(calls.at(-1).body.messages[0].text, /新しいオファー/); assert.doesNotMatch(JSON.stringify(calls.at(-1)), /秘密|非公開/);
  await assertNoFriendRetention();
  pushStatus = 400; await good('notice', { key: 'terminal-failed' });
  pushStatus = 500; await good('notice', { key: 'terminal-expired' });
  await db.prepare("UPDATE line_notification_outbox SET created_at=0 WHERE event_key='terminal-expired'").run(); await good('flush');
  for (const key of ['one', 'retry', 'cancel', 'blocked-pending', 'terminal-failed', 'terminal-expired']) {
    const row = await db.prepare('SELECT status,line_user_id,provider_id,consent_version FROM line_notification_outbox WHERE event_key=?').bind(key).first();
    assert.ok(row && !['pending','sending'].includes(row.status), key + ' terminal');
    for (const field of ['line_user_id','provider_id','consent_version']) assert.equal(row[field], '', key + ' scrubs ' + field);
  }
  const google = await good('google', { email: 'member-a@example.com' }); await good('unlink', { token: google.token }); assert.equal(await good('access', session), null, 'unlink revokes LINE sessions'); assert.equal((await good('access', google)).user.userId, 'member-a', 'Google session unchanged'); assert.equal((await call('login')).status, 400);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM line_notification_outbox WHERE member_id='member-a'").first()).n, 0, 'unlink deletes outbox history');
  const backup = JSON.parse((await good('backup')).body); assert.ok(!backup.tables.includes('line_oauth_flows')); assert.ok(!backup.tables.includes('line_sessions')); assert.ok(backup.tables.every(name => !name.startsWith('line_')), 'all LINE tables excluded'); assert.ok(Object.keys(backup.data).every(name => !name.startsWith('line_')));
  console.log('PASS: LINE auth/PKCE/state replay/nonce/audience/expiry, account isolation, signup rollback, same-subject notification consent, no friendship/profile API or retention, email/data consent, webhook ordering, terminal scrubbing, redirect refusal, deduplication/retry, private payloads, real message/offer hooks, unlink sessions and backup exclusions.');
} finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
