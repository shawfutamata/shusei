import { mockStatelessToken } from './line-stateless-fixture.mjs';
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-withdrawal-'));
await build({ entryPoints: [resolve('tests/account-withdrawal-worker.ts')], outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], tsconfig: resolve('tsconfig.json'), define: { 'import.meta.env.DEV': 'false' } });
let deauthorizations = 0;
const mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'withdrawal-test' }, r2Buckets: ['AVATARS'], bindings: { LINE_PROVIDER_ID: 'fixture-provider', LINE_LOGIN_CHANNEL_ID: 'fixture-channel', LINE_LOGIN_CHANNEL_SECRET: 'fixture-secret', LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), LINE_TOKEN_KEY_VERSION: 'test-v1' }, outboundService: async request => {
  const url = new URL(request.url); assert.equal(url.origin, 'https://api.line.me');
    if (url.pathname === '/oauth2/v3/token') return mockStatelessToken(request, 'fixture-channel', 'fixture-secret', 'fixture-login-channel-token');
  if (url.pathname === '/oauth2/v2.1/verify' && request.method === 'GET') return Response.json({ client_id: 'fixture-channel', scope: 'openid', expires_in: 3600 });
  if (url.pathname === '/oauth2/v2.1/userinfo') { const auth = request.headers.get('authorization'); assert.ok(auth.startsWith('Bearer fixture-access-')); return Response.json({ sub: auth.slice('Bearer fixture-access-'.length) }); }
  if (url.pathname === '/user/v1/deauthorize') { assert.equal(request.method, 'POST'); assert.equal(request.headers.get('authorization'), 'Bearer fixture-login-channel-token'); deauthorizations++; return new Response(null, { status: 204 }); }
  throw new Error('Unmocked outbound request');
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB'), r2 = await mf.getR2Bucket('AVATARS');
  const call = async (member, action) => { const r = await worker.fetch('https://test.example/', { method: 'POST', body: JSON.stringify({ member, action }) }); return { status: r.status, body: await r.json() }; };
  assert.equal((await call()).status, 200);
  // Actual runtime schema, including migrated columns and enforced foreign keys.
  let serial = 0;
  const insert = async (table, values) => {
    const columns = (await db.prepare(`PRAGMA table_info(${table})`).all()).results;
    const row = {};
    for (const c of columns) if ((c.notnull || c.pk) && c.dflt_value === null) row[c.name] = c.type === 'INTEGER' ? 0 : `fixture-${++serial}`;
    Object.assign(row, values);
    await db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row)).run();
  };
  const member = async id => insert('members', { id, email: `${id}@example.test`, display_name: id });
  const snapshot = async () => {
    const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
    return Object.fromEntries(await Promise.all(tables.map(async ({ name }) => [name, (await db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()).results])));
  };
  for (const id of ['depart', 'other', 'third']) await member(id);
  for (const id of ['depart', 'other']) {
    await insert('requests', { id: `${id}-request`, author_id: id, image_count: 3, video_version: 1 });
    await insert('request_comments', { id: `${id}-comment`, request_id: `${id}-request`, member_id: id });
    await insert('request_reports', { request_id: `${id}-request`, reporter_id: id });
    await insert('attendance_events', { id: `${id}-event`, owner_id: id });
    await insert('attendance_people', { event_id: `${id}-event`, owner_id: id });
    for (const table of ['push_subscriptions', 'mobile_push_tokens', 'line_privacy_codes', 'line_data_origins', 'member_product_events', 'thread_reads', 'thread_hides', 'member_days', 'gacha_days', 'gacha_draws', 'ad_gifts', 'matching_surveys', 'feedback']) await insert(table, { member_id: id });
    await insert('line_accounts', { member_id: id, provider_id: 'fixture-provider', line_user_id: `${id}-line` });
    await insert('line_notification_outbox', { member_id: id, line_user_id: `${id}-line` });
    await insert('mobile_sessions', { token_hash: `${id}-session`, member_id: id });
    await insert('line_sessions', { token_hash: `${id}-session`, member_id: id });
    await insert('line_oauth_flows', { member_id: id });
    await insert('line_oauth_flows', { member_id: '', session_hash: `${id}-session` });
    await insert('line_signup_drafts', { id: `${id}-line-draft`, email: `${id}@example.test`, name: id });
    await insert('line_oauth_flows', { member_id: '', draft_id: `${id}-line-draft` });
    await insert('mobile_auth_codes', { email: `${id}@example.test` });
    await db.prepare('UPDATE members SET avatar_key=? WHERE id=?').bind(`avatars/${id}`, id).run();
    for (const key of [`avatars/${id}`, `request-videos/${id}-request`, ...['request-images','request-thumbs'].flatMap(prefix => ['', '/1', '/2'].map(suffix => `${prefix}/${id}-request${suffix}`))]) await r2.put(key, 'fixture image');
  }
  await insert('request_comments', { request_id: 'other-request', member_id: 'depart' });
  await db.prepare("UPDATE members SET membership_status='canceled' WHERE id='depart'").run();
  await insert('line_notification_outbox', { member_id: 'depart', line_user_id: 'depart-line', status: 'accepted' });
  const before = await snapshot();
  const linkedRefusal = await call('depart'); assert.equal(linkedRefusal.status, 400); assert.match(linkedRefusal.body.error, /先にLINE連携を解除/);
  assert.deepEqual(await snapshot(), before, 'linked withdrawal changes no records');
  assert.equal(deauthorizations, 0, 'account deletion never attempts implicit external deauthorization');
  assert.equal((await call('depart', 'unlink')).status, 200); assert.equal(deauthorizations, 1, 'explicit unlink confirms official deauthorization first');
  const result = await call('depart'); assert.equal(result.status, 200, JSON.stringify(result));
  const after = await snapshot();
  assert.equal(after.members.some(row => row.id === 'depart'), false);
  for (const [table, rows] of Object.entries(after)) for (const row of rows) assert.ok(!Object.values(row).some(v => typeof v === 'string' && v.includes('depart')), `${table}: departing user data remains`);
  for (const [table, rows] of Object.entries(before)) {
    const unrelated = rows.filter(row => !Object.values(row).some(v => typeof v === 'string' && v.includes('depart')));
    for (const row of unrelated) assert.ok(after[table].some(value => JSON.stringify(value) === JSON.stringify(row)), `${table}: unrelated row changed`);
  }
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  const objects = (await r2.list()).objects.map(o => o.key);
  assert.ok(objects.length > 0); assert.ok(objects.every(k => k.includes('other')), 'all departing images/videos deleted, unrelated images retained');
  // Each protected dependency must refuse without partial session/LINE/profile erasure.
  const blocked = async (name, setup) => {
    const id = `blocked-${name}`; await member(id);
    await insert('mobile_sessions', { member_id: id }); await insert('line_sessions', { member_id: id });
    await insert('line_notification_outbox', { member_id: id });
    await setup(id);
    const before = await snapshot(), response = await call(id);
    assert.equal(response.status, 400, name); assert.match(response.body.error, /自動退会は完了していません/, name);
    assert.deepEqual(await snapshot(), before, `${name}: blocked deletion mutated data`);
  };
  await blocked('dm', id => insert('direct_messages', { sender_id: 'other', recipient_id: id }));
  await blocked('credit', id => insert('referral_credits', { inviter_id: 'other', invitee_id: id }));
  await blocked('subscription', id => db.prepare("UPDATE members SET stripe_subscription_id='sub-fixture' WHERE id=?").bind(id).run());
  await blocked('ads', async id => { await insert('ad_slots', { id: `${id}-ad`, member_id: id, amount_yen: 1200 }); await insert('ad_daily', { ad_id: `${id}-ad` }); });
  await blocked('held-gift', id => insert('ad_gifts', { member_id: id, held_ad_id: 'reserved-ad', held_days: 2 }));
  await blocked('used-gift', id => insert('ad_gifts', { member_id: id, used_ad_id: 'paid-ad' }));
  await blocked('comment', async id => { await insert('requests', { id: `${id}-request`, author_id: id }); await insert('request_comments', { request_id: `${id}-request`, member_id: 'other' }); });
  await blocked('offer', async id => { await insert('introductions', { id: `${id}-offer`, request_id: 'other-request', introducer_id: id }); await insert('introduction_messages', { introduction_id: `${id}-offer`, sender_id: 'other' }); });
  await blocked('survey', async id => { await insert('matching_surveys', { id: `${id}-survey`, member_id: id }); await insert('survey_introductions', { survey_id: `${id}-survey`, member_id: 'other' }); });
  await db.prepare('CREATE TABLE meeting_member_links(member_id TEXT, profile TEXT)').run();
  await blocked('meeting', id => insert('meeting_member_links', { member_id: id, profile: 'private meeting profile' }));
  // Future unknown FKs must roll back the complete batch, not just fail the member DELETE.
  await member('future');
  await db.prepare('CREATE TABLE future_member_reference(member_id TEXT REFERENCES members(id))').run();
  await insert('future_member_reference', { member_id: 'future' });
  const rollbackBefore = await snapshot(); assert.equal((await call('future')).status, 400); assert.deepEqual(await snapshot(), rollbackBefore);
  console.log('PASS: populated account withdrawal, all LINE/session references, multi-image/video cleanup, unrelated row/blob preservation, protected financial/shared/meeting blockers and atomic FK rollback.');
} finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
