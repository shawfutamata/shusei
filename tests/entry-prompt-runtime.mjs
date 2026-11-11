// 実API・隔離D1で自由記入、選択数制限、保存後の再読込を確かめる。本番には接続しない。
import { Miniflare } from 'miniflare';
import { Response, FormData } from 'undici';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const root = resolve('.');
const mf = new Miniflare({ modulesRoot: root + '/dist/server', modules: readdirSync(root + '/dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p)).sort((a,b) => a === 'index.js' ? -1 : b === 'index.js' ? 1 : 0).map(p => ({ type: 'ESModule', path: root + '/dist/server/' + p })), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], assets: { directory: root + '/dist/client', runWorkerFirst: true }, d1Databases: { DB: 'profile-photo-test' }, r2Buckets: ['AVATARS'], bindings: { AUTH_CODE_PEPPER: 'test-pepper', GOOGLE_CLIENT_ID: 'fake-client', GOOGLE_CLIENT_SECRET: 'fake-secret' }, outboundService: async request => {
  if (new URL(request.url).hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ id_token: 'x.' + Buffer.from(JSON.stringify({ email: 'profile@example.com', email_verified: true, name: 'Test Member' })).toString('base64url') + '.x' }), { headers: { 'content-type': 'application/json' } });
  return new Response('Denied', { status: 403 });
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB'), base = (await mf.ready).origin;
  const fetch = (path, options = {}) => worker.fetch(base + path, { redirect: 'manual', ...options });
  await fetch('/meeting/missing');
  await fetch('/api/mobile/auth/request-code', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'invalid' }) });
  await db.prepare('INSERT INTO members(id,email,display_name,company,membership_status,avatar_key,created_at) VALUES(?,?,?,?,?,?,?)').bind('profile-test', 'profile@example.com', 'Test Member', 'Test Company', 'active', '', new Date().toISOString()).run();
  const start = await fetch('/api/auth/google/start');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const oauthCookie = start.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const callback = await fetch('/api/auth/google/callback?' + new URLSearchParams({ state, code: 'fake' }), { headers: { cookie: oauthCookie } });
  const cookie = callback.headers.get('set-cookie').match(/member_session=[^;]+/)[0];
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
  try {
    for(const width of [360,390,430]) {
      const context=await browser.newContext({viewport:{width,height:850}});
      await context.addCookies([{name:'member_session',value:cookie.split('=')[1],url:base}]);
      const page=await context.newPage();
      await page.goto(base+'/');
      await page.getByRole('heading',{name:'仕事の相談をしよう！'}).waitFor();
      assert.equal(await page.getByRole('dialog').count(),1);
      await page.screenshot({path:'/tmp/tasuki-entry-'+width+'.png'});
      await page.getByRole('button',{name:'投稿してみる',exact:true}).click();
      await page.getByRole('heading',{name:'こんな人を探しています',exact:true}).waitFor();
      assert.equal(await page.getByRole('dialog').count(),1);
      assert.ok(await page.locator('.modal').evaluate(e=>e.scrollWidth<=e.clientWidth));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'/tmp/tasuki-post-width-'+width+'.png'});
      await page.getByRole('button',{name:'閉じる',exact:true}).click();
      await page.locator('.header-profile').click();
      await page.getByRole('button',{name:'ホーム',exact:true}).click();
      assert.equal(await page.getByRole('dialog').count(),0);
      await page.goto(base+'/?welcome=registered');
      await page.getByRole('heading',{name:'まずは投稿してみよう！'}).waitFor();
      assert.ok(!page.url().includes('welcome'));
      assert.equal(await page.getByRole('dialog').count(),1);
      await page.getByRole('button',{name:'あとで',exact:true}).click();
      assert.equal(await page.getByRole('dialog').count(),0);
      await page.reload();
      await page.getByRole('heading',{name:'仕事の相談をしよう！'}).waitFor();
      await page.getByRole('button',{name:'閉じる',exact:true}).click();
      await page.goto(base+'/legal');
      await page.goto(base+'/',{referer:base+'/legal'});
      await page.locator('.header-profile').waitFor();
      assert.equal(await page.getByRole('dialog').count(),0);
      await context.close();
    }
    console.log('PASS isolated production Worker: 360/390/430px entry/signup priority, post CTA, horizontal widths, close/later, in-app return, same-origin return, reload.');
  }finally{await browser.close();}
}finally{await mf.dispose();}
