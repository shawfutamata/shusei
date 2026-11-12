// 本人指定のTASUKI連絡先を4画面の実SSRとmailtoで確認する。メールは送らない。
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

for (const file of ['company.ts', 'login/Welcome.tsx', 'support/page.tsx', 'privacy/page.tsx']) {
  const source = await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /info@tasuki\.club/, `old contact in ${file}`);
}
const built = await build({ stdin: { contents: `
  import React from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import assert from 'node:assert/strict';
  import { company } from './app/company';
  import Welcome from './app/login/Welcome';
  import Support from './app/support/page';
  import Privacy from './app/privacy/page';
  import Tokushoho from './app/tokushoho/page';
  const address = 's_futamata@colourjam-inc.com';
  assert.equal(company.email, address);
  for (const [name, element, links] of [
    ['welcome', <Welcome initialMessage="">fixture</Welcome>, true],
    ['support', <Support />, true], ['privacy', <Privacy />, false], ['tokushoho', <Tokushoho />, false]
  ]) {
    const html = renderToStaticMarkup(element);
    assert.ok(html.includes(address), name + ' contact is rendered');
    assert.ok(!html.includes('info@tasuki.club'), name + ' does not retain old contact');
    assert.ok(!html.includes('shaw_futamata@every-counts.com'), name + ' does not use Every Counts contact');
    if (links) assert.ok(html.includes('href="mailto:' + address + '"'), name + ' mailto matches visible contact');
  }
  console.log('PASS: TASUKI contact source and rendered Welcome/support/privacy/tokushoho match the owner-designated ColourJam address; mailto agrees; no email sent.');
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic', plugins: [{name: 'contact-ssr-test', setup(build) {
  build.onLoad({filter: /\.css$/}, () => ({contents:'', loader:'js'}));
}}] });
new Function('require', built.outputFiles[0].text)(createRequire(import.meta.url));
