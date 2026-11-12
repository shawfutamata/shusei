// 隔離Workerと偽LINE APIのみ。実token・本番Secrets・外部APIは使用しない。
import { Miniflare, Log, LogLevel } from 'miniflare';
import { Response } from 'undici';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-token-crypto-'));
const key = Buffer.alloc(32, 7).toString('base64');
const channelToken = 'fake-login-channel-token';
const token = 'fake.user-token+/with-URL-encoding==';
const binding = { memberId: 'member-a', providerId: 'provider-a', channelId: 'channel-a', subject: 'Usubject-a' };
const config = { LINE_TOKEN_ENCRYPTION_KEY: key, LINE_TOKEN_KEY_VERSION: 'key-v1' };
const fixtures = [], requests = [], mockErrors = [];
let mf;

try {
  await build({
    stdin: {
      contents: `import { encryptLineToken, decryptLineToken, lineTokenCryptoReady, validateLineTokenCryptoConfig, verifyLineUserToken, deauthorizeLineUser } from './db/line-token-crypto';
const actualNow = Date.now.bind(Date);
let clockShift = 0;
Date.now = () => actualNow() + clockShift;
const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
AbortSignal.timeout = ms => { if (ms !== 10000) throw new Error('incorrect_api_timeout'); return nativeTimeout(ms); };
globalThis.fetch = (url, init) => {
  if (init.redirect !== 'manual' || init.cache !== 'no-store' || !(init.signal instanceof AbortSignal)) throw new Error('unsafe_fetch_options');
  return nativeFetch(url, init);
};
export default { async fetch(request) {
  const input = await request.json();
  try {
    let result;
    switch (input.action) {
      case 'config': result = { ready: lineTokenCryptoReady(), config: validateLineTokenCryptoConfig(input.config) }; break;
      case 'encrypt': result = await encryptLineToken(input.token, input.binding); break;
      case 'decrypt': result = await decryptLineToken(input.sealed, input.binding); break;
      case 'verify': result = await verifyLineUserToken(input.token, input.channelId, input.subject); break;
      case 'deauthorize': {
        let calls = 0;
        result = await deauthorizeLineUser(input.token, input.omitGuard ? undefined : async () => {
          calls++;
          if (input.throwGuardAt === calls) throw new Error('private-guard-error');
          if (calls === 2) clockShift = input.advanceOnGuard ?? 0;
          return input.denyGuardAt !== calls;
        });
        break;
      }
      default: throw new Error('unknown_test_action');
    }
    return Response.json({ result });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'unknown' }, { status: 400 }); } finally { clockShift = 0; }
}};`,
      resolveDir: resolve('.'), loader: 'ts',
    },
    outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'],
  });

  const outboundService = async request => {
    const fixture = fixtures.shift();
    requests.push(request.url);
    try {
      assert.ok(fixture, 'every outbound request must have an explicit mock');
      const url = new URL(request.url);
      assert.equal(url.origin, 'https://api.line.me');
      assert.equal(url.pathname, fixture.path);
      assert.equal(request.method, fixture.path.endsWith('/deauthorize') || fixture.path.endsWith('/token') ? 'POST' : 'GET');
      if (fixture.path.endsWith('/verify')) {
        assert.deepEqual([...url.searchParams.entries()], [['access_token', token]], 'token encoded once, only for official verify endpoint');
        assert.equal(request.headers.get('authorization'), null);
      } else if (fixture.path === '/oauth2/v3/token') {
        assert.equal(url.search, '', 'Login credentials never appear in URL');
        assert.equal(request.headers.get('authorization'), null);
        assert.equal(request.headers.get('content-type'), 'application/x-www-form-urlencoded');
        assert.deepEqual([...new URLSearchParams(await request.text()).entries()], [
          ['grant_type', 'client_credentials'], ['client_id', 'fake-login-id'], ['client_secret', 'fake-login-secret'],
        ]);
      } else {
        assert.equal(url.search, '', 'no credential in userinfo/deauthorize URL');
        assert.equal(request.headers.get('authorization'), `Bearer ${fixture.path.endsWith('/deauthorize') ? channelToken : token}`);
      }
      if (fixture.path.endsWith('/deauthorize')) {
        assert.equal(request.headers.get('content-type'), 'application/json');
        assert.deepEqual(await request.json(), { userAccessToken: token }, 'official JSON payload, never Messaging token or refresh token');
      }
    } catch (error) { mockErrors.push(error.message); throw error; }
    if (fixture.networkError) throw new Error('mock_network_unavailable');
    return new Response(fixture.status === 204 ? null : fixture.raw ?? JSON.stringify(fixture.body ?? {}), {
      status: fixture.status ?? 200, headers: fixture.headers ?? { 'content-type': 'application/json' },
    });
  };

  const bindings = { ...config, LINE_LOGIN_CHANNEL_ID: 'fake-login-id', LINE_LOGIN_CHANNEL_SECRET: 'fake-login-secret', LINE_DEAUTH_CHANNEL_TOKEN: 'obsolete-static-must-not-be-used', LINE_MESSAGING_CHANNEL_TOKEN: 'fake-messaging-must-not-be-used' };
  mf = new Miniflare({
    log: new Log(LogLevel.NONE),
    workers: [
      ['good', bindings],
      ['wrong-key', { ...bindings, LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64') }],
      ['new-version', { ...bindings, LINE_TOKEN_KEY_VERSION: 'key-v2' }],
      ['missing-config', { LINE_DEAUTH_CHANNEL_TOKEN: 'obsolete-static-must-not-be-used', LINE_MESSAGING_CHANNEL_TOKEN: 'fake-messaging-must-not-be-used' }],
      ['missing-login-secret', { ...bindings, LINE_LOGIN_CHANNEL_SECRET: '' }],
      ['missing-login-id', { ...bindings, LINE_LOGIN_CHANNEL_ID: '' }],
    ].map(([name, workerBindings]) => ({
      name, modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22',
      bindings: workerBindings, outboundService,
    })),
  });
  const workers = Object.fromEntries(await Promise.all(['good', 'wrong-key', 'new-version', 'missing-config', 'missing-login-secret', 'missing-login-id'].map(async name => [name, await mf.getWorker(name)])));
  const call = async (action, data = {}, name = 'good') => {
    const response = await workers[name].fetch('https://fixture.example/', { method: 'POST', body: JSON.stringify({ action, ...data }) });
    return { status: response.status, body: await response.json() };
  };
  const good = async (action, data = {}, name = 'good') => {
    const response = await call(action, data, name);
    assert.equal(response.status, 200, JSON.stringify(response));
    return response.body.result;
  };
  const rejected = async (action, data, name = 'good', error = 'line_token_decryption_failed') => {
    assert.deepEqual(await call(action, data, name), { status: 400, body: { error } });
  };

  assert.deepEqual(await good('config'), { ready: true, config: { ready: true, keyVersion: 'key-v1' } });
  assert.deepEqual(await good('config', {}, 'missing-config'), { ready: false, config: { ready: false, reason: 'missing_key' } });
  for (const [value, reason] of [
    ['', 'missing_key'], ['not-a-key', 'invalid_key'], [Buffer.alloc(31).toString('base64'), 'invalid_key'],
    [Buffer.alloc(33).toString('base64'), 'invalid_key'], [key.trimEnd() + '\n', 'invalid_key'],
    [key.slice(0, -1), 'invalid_key'], [key.slice(0, 42) + 'd=', 'invalid_key'],
    [Buffer.alloc(32, 255).toString('base64url'), 'invalid_key'],
  ]) {
    assert.deepEqual((await good('config', { config: { ...config, LINE_TOKEN_ENCRYPTION_KEY: value } })).config, { ready: false, reason });
  }
  for (const version of ['', ' v1', 'v1\n', 'x'.repeat(65), 1, null]) {
    assert.deepEqual((await good('config', { config: { ...config, LINE_TOKEN_KEY_VERSION: version } })).config, { ready: false, reason: 'invalid_key_version' });
  }

  const sealed = await good('encrypt', { token, binding });
  assert.deepEqual(Object.keys(sealed).sort(), ['ciphertext', 'iv', 'keyVersion']);
  assert.equal(sealed.keyVersion, 'key-v1');
  assert.equal(Buffer.from(sealed.iv, 'base64').length, 12);
  assert.equal(Buffer.from(sealed.ciphertext, 'base64').length, token.length + 16);
  assert.ok(!JSON.stringify(sealed).includes(token));
  assert.equal(await good('decrypt', { sealed, binding }), token);
  const fresh = await Promise.all(Array.from({ length: 24 }, () => good('encrypt', { token, binding })));
  assert.equal(new Set(fresh.map(value => value.iv)).size, fresh.length, 'every encryption gets a fresh 96-bit IV');
  assert.equal(new Set(fresh.map(value => value.ciphertext)).size, fresh.length);

  for (const property of ['memberId', 'providerId', 'channelId', 'subject']) {
    await rejected('decrypt', { sealed, binding: { ...binding, [property]: 'someone-else' } });
  }
  const collision = { memberId: 'a:b', providerId: 'c', channelId: 'd', subject: 'e' };
  const collisionToken = await good('encrypt', { token, binding: collision });
  await rejected('decrypt', { sealed: collisionToken, binding: { ...collision, memberId: 'a', providerId: 'b:c' } });
  for (const property of ['iv', 'ciphertext']) {
    const bytes = Buffer.from(sealed[property], 'base64'); bytes[0] ^= 1;
    await rejected('decrypt', { sealed: { ...sealed, [property]: bytes.toString('base64') }, binding });
  }
  const tag = Buffer.from(sealed.ciphertext, 'base64'); tag[tag.length - 1] ^= 1;
  await rejected('decrypt', { sealed: { ...sealed, ciphertext: tag.toString('base64') }, binding });
  for (const malformed of [
    null, {}, { ...sealed, keyVersion: 'key-v2' }, { ...sealed, iv: '' }, { ...sealed, iv: Buffer.alloc(11).toString('base64') },
    { ...sealed, iv: Buffer.alloc(13).toString('base64') }, { ...sealed, iv: '!' + sealed.iv.slice(1) },
    { ...sealed, ciphertext: Buffer.alloc(16).toString('base64') }, { ...sealed, ciphertext: sealed.ciphertext + '\n' },
    { ...sealed, ciphertext: 'A'.repeat(22000) }, { ...sealed, ciphertext: false },
  ]) await rejected('decrypt', { sealed: malformed, binding });
  await rejected('decrypt', { sealed, binding }, 'wrong-key');
  await rejected('decrypt', { sealed, binding }, 'new-version');
  await rejected('decrypt', { sealed: { ...sealed, keyVersion: 'key-v2' }, binding }, 'new-version');
  await rejected('decrypt', { sealed, binding }, 'missing-config');
  await rejected('encrypt', { token, binding }, 'missing-config', 'line_token_crypto_unavailable');
  for (const invalid of ['', 'token\nheader', 'has space', 'あ', 'a'.repeat(16385), null]) {
    await rejected('encrypt', { token: invalid, binding }, 'good', 'line_token_invalid');
  }
  for (const invalid of [null, {}, { ...binding, memberId: '' }, { ...binding, providerId: ' p' }, { ...binding, subject: 'U\u0000x' }]) {
    await rejected('encrypt', { token, binding: invalid }, 'good', 'line_token_binding_invalid');
  }
  assert.equal(requests.length, 0, 'cryptography never sends a network request');

  const verifyPath = '/oauth2/v2.1/verify', userPath = '/oauth2/v2.1/userinfo', deauthorizePath = '/user/v1/deauthorize';
  const validClaims = { client_id: binding.channelId, expires_in: 3600, scope: 'profile openid' };
  const verifyFixture = body => ({ path: verifyPath, body });
  const checkApi = async (action, expected, responses, data = {}, name = 'good') => {
    const count = requests.length;
    fixtures.push(...responses);
    const result = await good(action, { token, channelId: binding.channelId, subject: binding.subject, ...data }, name);
    assert.deepEqual(mockErrors, []);
    assert.equal(result, expected, `${action}: requests=${requests.length - count}, remaining=${fixtures.length}`);
    assert.equal(fixtures.length, 0, 'expected calls completed');
    assert.equal(requests.length - count, responses.length, 'no automatic retry or extra endpoint');
    assert.deepEqual(mockErrors, []);
  };
  await checkApi('verify', 'valid', [verifyFixture(validClaims), { path: userPath, body: { sub: binding.subject, unknownFutureField: true } }]);
  await checkApi('verify', 'valid', [verifyFixture({ ...validClaims, scope: 'openid' }), { path: userPath, body: { sub: binding.subject } }]);
  for (const claims of [
    { ...validClaims, client_id: 'wrong-audience' }, { ...validClaims, client_id: 1 },
    ...[0, -1, '3600', null].map(expires_in => ({ ...validClaims, expires_in })),
    ...['profile', 'notopenid', '', null].map(scope => ({ ...validClaims, scope })), {},
  ]) await checkApi('verify', 'invalid', [verifyFixture(claims)]);
  for (const body of [{ sub: 'wrong-user' }, {}, { sub: 1 }]) {
    await checkApi('verify', 'invalid', [verifyFixture(validClaims), { path: userPath, body }]);
  }
  for (const path of [verifyPath, userPath]) {
    const prefix = path === userPath ? [verifyFixture(validClaims)] : [];
    for (const status of path === userPath ? [400, 401, 403] : [400, 401]) await checkApi('verify', 'invalid', [...prefix, { path, status, body: { error: 'raw-provider-secret-must-not-escape' } }]);
    for (const status of path === userPath ? [429, 500, 503, 204] : [403, 429, 500, 503, 204]) await checkApi('verify', 'unavailable', [...prefix, { path, status }]);
    await checkApi('verify', 'unavailable', [...prefix, { path, networkError: true }]);
    await checkApi('verify', 'unavailable', [...prefix, { path, raw: 'not json provider response' }]);
    await checkApi('verify', 'unavailable', [...prefix, { path, body: [] }]);
    await checkApi('verify', 'unavailable', [...prefix, { path, status: 302, headers: { location: 'https://untrusted.example/' } }]);
  }
  await checkApi('verify', 'invalid', [], { token: '' });
  await checkApi('verify', 'invalid', [], { subject: '' });
  await checkApi('verify', 'invalid', [], { channelId: '' });

  const issuePath = '/oauth2/v3/token';
  const issued = { token_type: 'Bearer', access_token: channelToken, expires_in: 900 };
  const issuance = { path: issuePath, body: issued };
  await checkApi('deauthorize', 'accepted', [issuance, { path: deauthorizePath, status: 204 }]);
  // 同じ処理をもう一度呼んでも以前のstateless tokenをcacheしない。
  await checkApi('deauthorize', 'accepted', [issuance, { path: deauthorizePath, status: 204 }]);
  await checkApi('deauthorize', 'rejected', [issuance, { path: deauthorizePath, status: 400, body: { message: 'invalid token' } }]);
  for (const status of [200, 201, 202, 401, 403, 404, 408, 429, 500, 503]) {
    await checkApi('deauthorize', 'unavailable', [issuance, { path: deauthorizePath, status, raw: 'raw-provider-secret-must-not-escape' }]);
  }
  await checkApi('deauthorize', 'unavailable', [issuance, { path: deauthorizePath, networkError: true }]);
  for (const status of [301, 302, 303, 307, 308]) {
    await checkApi('deauthorize', 'unavailable', [issuance, { path: deauthorizePath, status, headers: { location: 'https://untrusted.example/' } }]);
    await checkApi('deauthorize', 'unavailable', [{ path: issuePath, status, headers: { location: 'https://untrusted.example/' } }]);
  }
  for (const status of [201, 202, 204, 400, 401, 403, 404, 408, 429, 500, 503]) {
    await checkApi('deauthorize', 'unavailable', [{ path: issuePath, status, raw: 'raw-channel-secret-must-not-escape' }]);
  }
  for (const body of [
    {}, [], 'not-object', 1, false,
    ...['bearer', 'Basic', '', null].map(token_type => ({ ...issued, token_type })),
    ...['', 'bad token', 'bad\r\nheader', null, 1, 'a'.repeat(16385)].map(access_token => ({ ...issued, access_token })),
    ...[0, -1, '900', 901, 30 * 86400, 0.5, null].map(expires_in => ({ ...issued, expires_in })),
  ]) await checkApi('deauthorize', 'unavailable', [{ path: issuePath, body }]);
  for (const raw of ['not-json-with-private-information', 'null', '']) await checkApi('deauthorize', 'unavailable', [{ path: issuePath, raw }]);
  await checkApi('deauthorize', 'unavailable', [{ path: issuePath, networkError: true }]);
  for (const name of ['missing-config', 'missing-login-secret', 'missing-login-id']) await checkApi('deauthorize', 'unavailable', [], {}, name);
  await checkApi('deauthorize', 'rejected', [], { token: '\r\ninvalid' });
  await checkApi('deauthorize', 'unavailable', [], { omitGuard: true });
  for (const key of ['denyGuardAt', 'throwGuardAt']) {
    await checkApi('deauthorize', 'unavailable', [], { [key]: 1 });
    await checkApi('deauthorize', 'unavailable', [issuance], { [key]: 2 });
  }
  // test Worker内の時計だけを進める。実際に15分待つことも期限切れtokenを送ることもしない。
  await checkApi('deauthorize', 'unavailable', [issuance], { advanceOnGuard: 900000 });
  await checkApi('deauthorize', 'unavailable', [{ path: issuePath, body: { ...issued, expires_in: 1 } }], { advanceOnGuard: 1001 });
  assert.deepEqual(mockErrors, []);
  console.log('PASS: AES-256-GCM round trip, random IV, full identity/version AAD, tampering/wrong key/malformed rejection, safe config validation, LINE token audience/scope/expiry/subject checks, mocked outage/redirect/error handling, on-demand stateless issuance with strict response validation, pre/post guards and expiry, no static/cache fallback, JSON deauthorize and 204-only success; no real LINE requests.');
} finally {
  if (mf) await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}
