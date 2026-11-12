// 実際の業務関数を通し、Resend送信境界を偽サービスで計数する。本番通信なし。
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-email-'));
await build({ entryPoints: [resolve('tests/line-worker.ts')], outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], tsconfig: resolve('tsconfig.json'), define: { 'import.meta.env.DEV': 'false' } });
const mails = [];
let onPush = async () => {}; let pushCalls = 0;
const mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'line-email-test' }, r2Buckets: ['AVATARS'], bindings: { AUTH_CODE_PEPPER: 'test-only', LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), LINE_TOKEN_KEY_VERSION: 'test-v1', LINE_DATA_POLICY_READY: 'true', LINE_LOGIN_ENABLED: 'true', LINE_NOTIFICATIONS_ENABLED: 'true', LINE_LOGIN_CHANNEL_ID: 'test-client', LINE_LOGIN_CHANNEL_SECRET: 'fake', LINE_PROVIDER_ID: 'test-provider', LINE_MESSAGING_PROVIDER_ID: 'test-provider', LINE_MESSAGING_CHANNEL_TOKEN: 'fake', LINE_MESSAGING_CHANNEL_SECRET: 'fake', LINE_BOT_USER_ID: 'U' + 'd'.repeat(32), RESEND_API_KEY: 'fake-only', AUTH_FROM_EMAIL: 'test@example.com' }, outboundService: async request => {
  const url = new URL(request.url);
  if (url.origin === 'https://api.line.me' && url.pathname === '/oauth2/v2.1/verify' && request.method === 'GET') return Response.json({ client_id: 'test-client', scope: 'openid', expires_in: 3600 });
  if (url.origin === 'https://api.line.me' && url.pathname === '/oauth2/v2.1/userinfo') { const auth = request.headers.get('authorization'); assert.match(auth, /^Bearer fixture-access-U[0-9a-f]{32}$/); return Response.json({ sub: auth.slice('Bearer fixture-access-'.length) }); }
  if (request.url === 'https://api.line.me/v2/bot/message/push') { pushCalls++; await onPush(); return new Response('{}', { status: 200 }); }
  assert.equal(request.url, 'https://api.resend.com/emails', 'all outbound requests mocked'); mails.push(await request.json()); return new Response('{}', { status: 200 });
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB');
  const good = async (action, data = {}) => { const r = await worker.fetch('https://test.example/', { method: 'POST', body: JSON.stringify({ action, ...data }) }); const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body; };
  await good('init');
  for (const id of ['member-a','member-b']) await db.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at) VALUES(?,?,?,'active',?)").bind(id, `${id}@example.com`, id, new Date().toISOString()).run();
  await db.prepare("UPDATE members SET mail_on_message=1,mail_on_offer=1,mail_on_request=1,notify_industries='[\"システム開発\"]' WHERE id='member-a'").run();
  await db.prepare("INSERT INTO line_data_origins(member_id,email_from_line,data_consent_version,data_consent_at,email_notice_consent) VALUES('member-a',1,'fixture',?,0)").bind(new Date().toISOString()).run();
  await db.prepare("INSERT INTO requests(id,author_id,title,description,category,budget_label,area,deadline,status,created_at) VALUES('fixture-request','member-a','試験','試験','project','','','','open',?)").bind(new Date().toISOString()).run();
  const sender = await good('google', { email: 'member-b@example.com' });
  await good('message', sender); assert.equal(mails.length, 0, 'message email blocked despite mail_on_message=1');
  await good('offer', sender); assert.equal(mails.length, 0, 'immediate offer email blocked despite mail_on_offer=1');
  assert.equal((await db.prepare("SELECT offer_notified_day FROM members WHERE id='member-a'").first()).offer_notified_day, '', 'denied consent does not claim immediate offer slot');
  assert.deepEqual(await good('digest'), { recipients: 1, sent: 0 }); assert.equal(mails.length, 0, 'digest blocked at actual delivery boundary');
  await good('request', sender); assert.equal(mails.length, 0, 'matching-industry email blocked despite matching industry and mail_on_request=1');
  // 正の対照: 同じ配送設定・同じ関数で明示同意があれば送れることも確かめる。
  await db.prepare("UPDATE line_data_origins SET email_notice_consent=1 WHERE member_id='member-a'").run();
  await good('message', sender); assert.equal(mails.length, 1); assert.match(mails.at(-1).subject, /メッセージ/);
  await good('offer', sender); assert.equal(mails.length, 2); assert.match(mails.at(-1).subject, /オファー/);
  assert.notEqual((await db.prepare("SELECT offer_notified_day FROM members WHERE id='member-a'").first()).offer_notified_day, '', 'consent permits immediate slot');
  await db.prepare('UPDATE introductions SET notified=0').run(); assert.deepEqual(await good('digest'), { recipients: 1, sent: 1 }); assert.equal(mails.length, 3);
  await good('request', sender); assert.equal(mails.length, 4); assert.match(mails.at(-1).subject, /関連する案件/);
  assert.ok(mails.every(mail => mail.to.length === 1 && mail.to[0] === 'member-a@example.com'));
  await db.prepare("UPDATE line_data_origins SET email_notice_consent=0 WHERE member_id='member-a'").run();
  await good('message', sender); await db.prepare('UPDATE introductions SET notified=0').run(); await good('digest'); assert.equal(mails.length, 4, 'withdrawal stops later actual delivery');
  // claim後・sendOfferMail前に同意が撤回された場合、後段の再検証も必要。
  await db.prepare("UPDATE line_data_origins SET email_notice_consent=1 WHERE member_id='member-a'").run();
  await db.prepare("UPDATE members SET offer_notified_day='' WHERE id='member-a'").run();
  await good('link');
  await good('preferences', { message: false, offer: true, proof: { subject: 'U' + 'a'.repeat(32), friend: true } });
  onPush = async () => { await db.prepare("UPDATE line_data_origins SET email_notice_consent=0 WHERE member_id='member-a'").run(); };
  await good('offer', sender);
  assert.equal(pushCalls, 1, 'interposition reached between slot claim and offer email');
  assert.notEqual((await db.prepare("SELECT offer_notified_day FROM members WHERE id='member-a'").first()).offer_notified_day, '', 'slot was initially authorized');
  assert.equal(mails.length, 4, 'sendOfferMail independently rechecks consent after claim');
  await db.prepare("UPDATE members SET membership_source='line_signup',offer_notified_day='' WHERE id='member-a'").run();
  await db.prepare("DELETE FROM line_data_origins WHERE member_id='member-a'").run();
  await good('message', sender); await good('offer', sender); await db.prepare('UPDATE introductions SET notified=0').run(); await good('digest'); await good('request', sender);
  assert.equal(mails.length, 4, 'restored LINE member without consent provenance fails closed across all email paths');
  console.log('PASS: real message/offer/digest/matching-request operations send zero email without LINE email consent, preserve immediate-offer slot, send with explicit consent, and stop after withdrawal.');
} finally { await mf.dispose(); rmSync(dir, { recursive: true, force: true }); }
