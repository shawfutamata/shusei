// 実API・隔離D1で自由記入、選択数制限、保存後の再読込を確かめる。本番には接続しない。
import { Miniflare } from 'miniflare';
import { Response, FormData } from 'undici';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('.');
const mf = new Miniflare({ modulesRoot: root + '/dist/server', modules: readdirSync(root + '/dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p)).sort((a,b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : 0).map(p => ({ type: 'ESModule', path: root + '/dist/server/' + p })), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], assets: { directory: root + '/dist/client', runWorkerFirst: true }, d1Databases: { DB: 'profile-industry-test' }, r2Buckets: ['AVATARS'], bindings: { AUTH_CODE_PEPPER: 'test-pepper', GOOGLE_CLIENT_ID: 'fake-client', GOOGLE_CLIENT_SECRET: 'fake-secret' }, outboundService: async request => {
  if (new URL(request.url).hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ id_token: 'x.' + Buffer.from(JSON.stringify({ email: 'profile@example.com', email_verified: true, name: 'Test Member' })).toString('base64url') + '.x' }), { headers: { 'content-type': 'application/json' } });
  return new Response('Denied', { status: 403 });
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB'), base = (await mf.ready).origin;
  const fetch = (path, options = {}) => worker.fetch(base + path, { redirect: 'manual', ...options });
  await fetch('/meeting/missing');
  await fetch('/api/mobile/auth/request-code', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'invalid' }) });
  await db.prepare('INSERT INTO members(id,email,display_name,company,membership_status,avatar_key,created_at) VALUES(?,?,?,?,?,?,?)').bind('profile-test', 'profile@example.com', 'Test Member', 'Test Company', 'active', 'member-photos/profile-test', new Date().toISOString()).run();
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
  const selected = ['花屋', '家具の組み立て', 'イタリアン', '楽器の修理'];
  let result = await save(selected); assert.equal(result.status, 200, await result.clone().text()); assert.deepEqual((await result.json()).industries, selected);
  const stored = await db.prepare('SELECT industries_json FROM members WHERE id=?').bind('profile-test').first(); assert.deepEqual(JSON.parse(stored.industries_json), selected);
  let board = await fetch('/api/board', { headers: { cookie } }); assert.equal(board.status, 200); let data = await board.json(); assert.deepEqual(data.stats.industries, selected); assert.deepEqual(data.stats.notifyIndustries, ['イタリアン', '花屋']);
  const page = await fetch('/', { headers: { cookie } }); assert.equal(page.status, 200); const html = await page.text(); for (const name of selected) assert.ok(html.includes(name), name);
  for (const invalid of [['x'.repeat(41)], ['悪い\n入力'], ['1','2','3','4','5','6','7']]) { result = await save(invalid); assert.equal(result.status, 400); }
  result = await save(['花屋', '和食']); assert.equal(result.status, 200); board = await fetch('/api/board', { headers: { cookie } }); data = await board.json(); assert.deepEqual(data.stats.industries, ['花屋', '和食']);
  console.log('PASS 実プロフィールAPI・D1: 自由記入/花屋/家具/料理ジャンルの保存と再表示、通知選択、長さ/制御文字/7件拒否、削除再保存');
} finally { await mf.dispose(); }
