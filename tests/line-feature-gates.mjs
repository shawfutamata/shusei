import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-gates-'));
try {
  await build({ stdin: { contents: "import {lineRecoveryReady,lineLoginReady,lineSignupReady,lineMessagingReady} from './app/line-auth'; export default {fetch(){return Response.json({recovery:lineRecoveryReady(),login:lineLoginReady(),signup:lineSignupReady(),notifications:lineMessagingReady()});}};", resolveDir: resolve('.'), loader: 'ts' }, outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'] });
  // 本番の設定値を読まない。秘密値・メール送信先とも、このテスト専用の偽物。
  const full = {
    RESEND_API_KEY: 'fake-mail', AUTH_FROM_EMAIL: 'test@example.invalid', AUTH_CODE_PEPPER: 'test-only',
    LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), LINE_TOKEN_KEY_VERSION: 'v1',
    LINE_DATA_POLICY_READY: 'true', ACCOUNT_ERASURE_ENABLED: 'false', LINE_LOGIN_ENABLED: 'true', LINE_SIGNUP_ENABLED: 'true', LINE_NOTIFICATIONS_ENABLED: 'true',
    LINE_LOGIN_CHANNEL_ID: 'test', LINE_LOGIN_CHANNEL_SECRET: 'test', LINE_PROVIDER_ID: 'provider-a', LINE_MESSAGING_PROVIDER_ID: 'provider-a',
    LINE_MESSAGING_CHANNEL_TOKEN: 'test', LINE_MESSAGING_CHANNEL_SECRET: 'test', LINE_BOT_USER_ID: 'test',
  };
  const expected = (recovery, login, signup, notifications) => ({ recovery, login, signup, notifications });
  const enabled = expected(true, true, true, true), disabled = expected(false, false, false, false);
  const cases = [
    ['no configuration', {}, disabled],
    ['obsolete static token cannot replace Login secret', { ...full, LINE_LOGIN_CHANNEL_SECRET: '', LINE_DEAUTH_CHANNEL_TOKEN: 'must-not-be-used' }, disabled],
    ['malformed Login ID', { ...full, LINE_LOGIN_CHANNEL_ID: 'bad\nvalue' }, disabled],
    ['malformed Login secret', { ...full, LINE_LOGIN_CHANNEL_SECRET: ' ' }, disabled],
    ['all configuration, erasure off', full, enabled],
    ['all flags off, existing user recovery preserved', { ...full, LINE_DATA_POLICY_READY: 'false', LINE_LOGIN_ENABLED: 'false', LINE_SIGNUP_ENABLED: 'false', LINE_NOTIFICATIONS_ENABLED: 'false' }, expected(true, false, false, false)],
    ['different Messaging provider', { ...full, LINE_MESSAGING_PROVIDER_ID: 'provider-b' }, expected(true, true, true, false)],
    ['erasure flag does not open LINE', { ACCOUNT_ERASURE_ENABLED: 'true' }, disabled],
    ['short encryption key', { ...full, LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16, 7).toString('base64') }, disabled],
    ['noncanonical encryption key', { ...full, LINE_TOKEN_ENCRYPTION_KEY: full.LINE_TOKEN_ENCRYPTION_KEY + '\n' }, disabled],
    ['invalid key version', { ...full, LINE_TOKEN_KEY_VERSION: '../v1' }, disabled],
  ];
  for (const name of ['LINE_LOGIN_CHANNEL_ID', 'LINE_LOGIN_CHANNEL_SECRET', 'LINE_PROVIDER_ID', 'LINE_TOKEN_ENCRYPTION_KEY', 'LINE_TOKEN_KEY_VERSION']) {
    cases.push([`missing ${name}`, { ...full, [name]: '' }, disabled]);
  }
  for (const name of ['RESEND_API_KEY', 'AUTH_FROM_EMAIL', 'AUTH_CODE_PEPPER']) {
    cases.push([`missing ${name}`, { ...full, [name]: '' }, expected(true, true, false, true)]);
  }
  for (const name of ['LINE_MESSAGING_PROVIDER_ID', 'LINE_MESSAGING_CHANNEL_TOKEN', 'LINE_MESSAGING_CHANNEL_SECRET', 'LINE_BOT_USER_ID']) {
    cases.push([`missing ${name}`, { ...full, [name]: '' }, expected(true, true, true, false)]);
  }
  for (const value of ['', 'false', 'TRUE', '1', ' true ']) {
    cases.push([`policy flag ${JSON.stringify(value)}`, { ...full, LINE_DATA_POLICY_READY: value }, expected(true, false, false, false)]);
    cases.push([`login flag ${JSON.stringify(value)}`, { ...full, LINE_LOGIN_ENABLED: value }, expected(true, false, false, false)]);
    cases.push([`signup flag ${JSON.stringify(value)}`, { ...full, LINE_SIGNUP_ENABLED: value }, expected(true, true, false, true)]);
    cases.push([`notifications flag ${JSON.stringify(value)}`, { ...full, LINE_NOTIFICATIONS_ENABLED: value }, expected(true, true, true, false)]);
  }
  for (const [name, bindings, result] of cases) {
    const mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', bindings,
      outboundService: () => { throw new Error('External requests are forbidden in feature gate tests'); },
    });
    try { assert.deepEqual(await (await mf.dispatchFetch('https://fixture.example/')).json(), result, name); }
    finally { await mf.dispose(); }
  }
  console.log(`PASS: ${cases.length} isolated configuration cases; missing secrets/mismatched providers/malformed flags stay closed, and disabling rollout flags preserves the configured unlink recovery path.`);
} finally { rmSync(dir, { recursive: true, force: true }); }
