// 本番ビルドと隔離D1で、実投稿を残し、固定の見本だけが表示されないことを確かめる。
// 本番DB・外部サービスには接続しない。
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.');
const mf = new Miniflare({
  modulesRoot: root + '/dist/server',
  modules: readdirSync(root + '/dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p)).sort((a, b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : 0).map(p => ({ type: 'ESModule', path: root + '/dist/server/' + p })),
  compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'],
  assets: { directory: root + '/dist/client', runWorkerFirst: true },
  d1Databases: { DB: 'sample-post-cleanup-test' }, r2Buckets: ['AVATARS'],
  bindings: { AUTH_CODE_PEPPER: 'test-pepper', GOOGLE_CLIENT_ID: 'fake-client', GOOGLE_CLIENT_SECRET: 'fake-secret' },
  outboundService: async request => {
    if (new URL(request.url).hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ id_token: 'x.' + Buffer.from(JSON.stringify({ email: 'viewer@tasuki.test', email_verified: true, name: '表示確認会員' })).toString('base64url') + '.x' }), { headers: { 'content-type': 'application/json' } });
    return new Response('Denied', { status: 403 });
  },
});

try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB'), base = (await mf.ready).origin;
  const fetch = (path, options = {}) => worker.fetch(base + path, { redirect: 'manual', ...options });
  await fetch('/meeting/missing');
  await fetch('/api/mobile/auth/request-code', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'invalid' }) });
  for (const [id, email, name] of [['viewer', 'viewer@tasuki.test', '表示確認会員'], ['author', 'author@tasuki.test', '実投稿の作成者'], ['legacy-demo', 'legacy@example.jp', '旧デモ会員']]) {
    await db.prepare('INSERT INTO members(id,email,display_name,company,membership_status,created_at) VALUES(?,?,?,?,?,?)').bind(id, email, name, '確認用会社', 'active', new Date().toISOString()).run();
  }
  const start = await fetch('/api/auth/google/start');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const oauthCookie = start.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const callback = await fetch('/api/auth/google/callback?' + new URLSearchParams({ state, code: 'fake' }), { headers: { cookie: oauthCookie } });
  const cookie = callback.headers.get('set-cookie').match(/member_session=[^;]+/)[0];
  const board = async () => {
    const response = await fetch('/api/board', { headers: { cookie } });
    assert.equal(response.status, 200);
    return response.json();
  };
  assert.deepEqual((await board()).requests, [], '投稿0件で固定見本を補充しない');
  for (const [id, author, title, status] of [['real-open', 'author', '実投稿の募集内容をそのまま表示する', 'open'], ['real-closed', 'author', '募集終了の実投稿も保持する', 'closed'], ['legacy-post', 'legacy-demo', '旧デモ投稿はDBに保持する', 'open']]) {
    await db.prepare('INSERT INTO requests(id,author_id,category,title,description,budget_label,area,deadline,status,industry_tags,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, author, 'project', title, '保存済みの説明文', '応相談', '東京都', '2099-12-31', status, '["システム開発"]', new Date().toISOString()).run();
  }
  const before = (await db.prepare('SELECT * FROM requests ORDER BY id').all()).results;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await board();
    assert.deepEqual(result.requests.map(r => r.id).sort(), ['real-closed', 'real-open']);
    assert.ok(result.requests.every(r => r.sample === false));
    assert.equal(result.requests.find(r => r.id === 'real-open').description, '保存済みの説明文');
  }
  assert.deepEqual((await db.prepare('SELECT * FROM requests ORDER BY id').all()).results, before, 'DB行を変更・削除しない');
  assert.ok(await db.prepare('SELECT id FROM members WHERE id=?').bind('legacy-demo').first(), '旧デモ会員も今回の対象外として保持');
  const page = await fetch('/', { headers: { cookie } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.ok(html.includes('実投稿の募集内容をそのまま表示する'));
  assert.doesNotMatch(html, /sample-cleaning|sample-moving|sample-catering/);
  const welcome = await fetch('/login'), welcomeHtml = await welcome.text();
  assert.equal(welcome.status, 200);
  assert.doesNotMatch(welcomeHtml, /welcome-hands-on|welcome-demo|demo-title|サンプル商事|サンプル製作所|サンプル工業|href="#try"/);
  assert.match(welcomeHtml, /登録して案件を探す/);
  assert.match(welcomeHtml, /登録して依頼を投稿する/);
  assert.match(welcomeHtml, /\/welcome\/find\.gif/);
  assert.match(welcomeHtml, /\/welcome\/post\.gif/);
  console.log('PASS 固定投稿なし・空一覧・実投稿/募集終了/説明文保持・再読込・DB/旧デモ会員非削除・LP体験案件なし・登録導線/GIF保持');

} finally { await mf.dispose(); }
