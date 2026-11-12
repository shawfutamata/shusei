import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { Response } from 'undici';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-diagnostic-'));
const token = 'fake-diagnostic-token';
const uid = `U${'a'.repeat(32)}`;
const other = `U${'b'.repeat(32)}`;
const privateMarker = 'EXTERNAL_PRIVATE_MUST_NOT_LEAK';
const valid = { userId: uid, basicId: '@fixture', displayName: privateMarker, pictureUrl: privateMarker, secretEcho: token };
const full = { ADMIN_EMAILS: 'operator@example.invalid', FIXTURE_EMAIL: 'operator@example.invalid', LINE_MESSAGING_CHANNEL_TOKEN: token, LINE_OFFICIAL_ACCOUNT_ID: '@fixture', LINE_LOGIN_ENABLED: 'false', LINE_NOTIFICATIONS_ENABLED: 'false' };
try {
  const built = await build({ stdin: { contents: "import {env} from 'cloudflare:workers'; import {GET} from './app/api/admin/line-connection/route'; const originalFetch=globalThis.fetch; globalThis.fetch=(...args)=>{if(args[1]?.redirect!=='manual'||args[1]?.cache!=='no-store'||!(args[1]?.signal instanceof AbortSignal)) throw new Error('missing request guard'); if(env.FIXTURE_NETWORK_ERROR==='timeout') return new Promise((_,reject)=>args[1].signal.addEventListener('abort',()=>reject(new Error('EXTERNAL_PRIVATE_MUST_NOT_LEAK')),{once:true})); if(env.FIXTURE_NETWORK_ERROR) throw new Error('EXTERNAL_PRIVATE_MUST_NOT_LEAK'); return originalFetch(...args);}; export default {fetch:GET};", resolveDir: resolve('.'), loader: 'ts' }, outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], metafile: true,
    plugins: [{ name: 'fixture-session-only', setup(build) {
      build.onResolve({ filter: /^\.\/app-auth$/ }, args => args.importer.endsWith('/app/admin-auth.ts') ? { path: 'session', namespace: 'fixture' } : undefined);
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: "import {env} from 'cloudflare:workers'; export async function getAppAccess(){ if(env.FIXTURE_EMAIL==='throw') throw new Error('EXTERNAL_PRIVATE_MUST_NOT_LEAK'); return env.FIXTURE_EMAIL ? {user:{email:env.FIXTURE_EMAIL}} : null; }", loader: 'ts' }));
    } }],
  });
  for (const file of ['app/admin-auth.ts', 'app/admin-emails.ts']) assert.ok(built.metafile.inputs[file], `real auth wiring: ${file}`);
  const cases = [];
  const add = (name, overrides, status, body, upstream = valid, upstreamStatus = 200, calls = 1) => cases.push({ name, overrides, status, body, upstream, upstreamStatus, calls });
  add('anonymous', { FIXTURE_EMAIL: '' }, 404, { ok: false, error: 'not_found' }, valid, 200, 0);
  add('ordinary member', { FIXTURE_EMAIL: 'member@example.invalid' }, 404, { ok: false, error: 'not_found' }, valid, 200, 0);
  add('empty admin allowlist', { ADMIN_EMAILS: '' }, 404, { ok: false, error: 'not_found' }, valid, 200, 0);
  add('auth failure', { FIXTURE_EMAIL: 'throw' }, 503, { ok: false, error: 'connection_check_failed' }, valid, 200, 0);
  for (const overrides of [{ LINE_MESSAGING_CHANNEL_TOKEN: '' }, { LINE_MESSAGING_CHANNEL_TOKEN: 'bad\nheader' }, { LINE_OFFICIAL_ACCOUNT_ID: '' }, { LINE_OFFICIAL_ACCOUNT_ID: 'no-at' }, { LINE_BOT_USER_ID: 'bad' }]) add('invalid configuration', overrides, 503, { ok: false, error: 'configuration_incomplete' }, valid, 200, 0);
  add('flags off, discover identity', {}, 200, { ok: true, botUserId: uid, basicId: '@fixture', botIdMatches: null });
  add('matching configured identity', { LINE_BOT_USER_ID: uid }, 200, { ok: true, botUserId: uid, basicId: '@fixture', botIdMatches: true });
  add('different configured identity', { LINE_BOT_USER_ID: other }, 409, { ok: false, error: 'configured_bot_id_mismatch', botUserId: uid, basicId: '@fixture', botIdMatches: false });
  for (const upstream of [{ ...valid, basicId: '@another' }, { ...valid, userId: uid.toUpperCase() }, { ...valid, userId: uid.slice(1) }, { ...valid, userId: 42 }, {}]) add('invalid bot identity', {}, 502, { ok: false, error: 'bot_identity_mismatch' }, upstream);
  for (const upstream of [[], null, '"string"']) add('not an object', {}, 502, { ok: false, error: 'invalid_line_response' }, upstream);
  add('malformed JSON', {}, 503, { ok: false, error: 'connection_check_failed' }, '{broken');
  add('oversized body', {}, 502, { ok: false, error: 'invalid_line_response' }, 'x'.repeat(32769));
  for (const status of [201, 204, 301, 302, 307, 401, 403, 429, 500, 503]) add(`upstream ${status}`, {}, 502, { ok: false, error: 'line_unavailable' }, privateMarker, status);
  add('outbound service failure', {}, 502, { ok: false, error: 'line_unavailable' }, new Error(privateMarker));
  add('fetch network exception', { FIXTURE_NETWORK_ERROR: 'true' }, 503, { ok: false, error: 'connection_check_failed' }, valid, 200, 0);
  add('request timeout', { FIXTURE_NETWORK_ERROR: 'timeout' }, 503, { ok: false, error: 'connection_check_failed' }, valid, 200, 0);
  for (const test of cases) {
    let calls = 0;
    const mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', bindings: { ...full, ...test.overrides }, outboundService: request => {
      calls++;
      assert.equal(request.url, 'https://api.line.me/v2/bot/info');
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('authorization'), `Bearer ${token}`);
      if (test.upstream instanceof Error) throw test.upstream;
      const body = test.upstreamStatus === 204 ? null : typeof test.upstream === 'string' ? test.upstream : JSON.stringify(test.upstream);
      return new Response(body, { status: test.upstreamStatus, headers: { Location: 'https://must-not-follow.invalid/', 'Content-Type': 'application/json' } });
    } });
    try {
      const response = await mf.dispatchFetch('https://fixture.invalid/api/admin/line-connection?url=https://must-not-fetch.invalid/');
      const raw = await response.text();
      assert.equal(response.status, test.status, test.name);
      assert.deepEqual(JSON.parse(raw), test.body, test.name);
      assert.ok(response.headers.get('cache-control').includes('no-store'));
      assert.equal(calls, test.calls, test.name);
      assert.ok(!raw.includes(token) && !raw.includes(privateMarker), test.name);
    } finally { await mf.dispose(); }
  }
  console.log(`PASS: ${cases.length} isolated diagnostic cases; actual admin allowlist/auth wiring, fixed official destination, no redirects, no external data leakage. No live LINE requests.`);
} finally { rmSync(dir, { recursive: true, force: true }); }
