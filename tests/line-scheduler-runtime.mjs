import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-scheduler-'));
try {
  await build({ entryPoints: [resolve('workers/line-notifications.ts')], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node' });
  const worker = (await import(pathToFileURL(join(dir, 'worker.mjs')).href)).default;
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
