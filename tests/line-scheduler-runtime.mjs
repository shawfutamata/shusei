import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-scheduler-'));
try {
  // 後日のWrangler再配備でも、定期専用Workerの公開入口を復活させない。
  const config = JSON.parse(readFileSync('wrangler.line-notifications.jsonc', 'utf8'));
  assert.equal(config.name, 'tasuki-line-notifications');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined);
  assert.deepEqual(config.triggers.crons, ['*/5 * * * *']);
  assert.deepEqual(config.services, [{ binding: 'TASUKI', service: 'tasuki' }]);
  await build({ entryPoints: [resolve('workers/line-notifications.ts')], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node' });
  const worker = (await import(pathToFileURL(join(dir, 'worker.mjs')).href)).default;
  assert.equal(worker.fetch, undefined);
  await assert.rejects(worker.scheduled({}, {}, { waitUntil() {} }), /not configured/);
  let pending, called = 0;
  const token = 'test-only-token'.repeat(3);
  await worker.scheduled({}, { LINE_NOTIFY_CRON_TOKEN: token, TASUKI: { async fetch(url, options) {
    called++; assert.equal(url, 'https://tasuki.club/api/admin/line-notifications'); assert.equal(options.method, 'POST'); assert.equal(options.headers.authorization, 'Bearer ' + token); return new Response('{}');
  } } }, { waitUntil(task) { pending = task; } });
  await pending; assert.equal(called, 1);
  await worker.scheduled({}, { LINE_NOTIFY_CRON_TOKEN: token, TASUKI: { async fetch() { return new Response('', { status: 403 }); } } }, { waitUntil(task) { pending = task; } });
  await assert.rejects(pending, /403/);
  console.log('PASS: scheduled retry uses dedicated credential/service endpoint and surfaces configuration/auth failures.');
} finally { rmSync(dir, { recursive: true, force: true }); }
