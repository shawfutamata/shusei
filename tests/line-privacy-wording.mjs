// Offline rendering assertions. Does not call application APIs or external services.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
for (const page of ['app/privacy/page.tsx','app/settings/line/about/page.tsx']) {
  const compiled = await build({entryPoints:[page],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime'],loader:{'.module.css':'empty'},jsx:'automatic'});
  const loaded={exports:{}};
  vm.runInNewContext(compiled.outputFiles[0].text,{module:loaded,exports:loaded.exports,require});
  const html=renderToStaticMarkup(React.createElement(loaded.exports.default));
  assert.match(html,/現在、オンライン退会/);
  assert.match(html,/LINE通知は現在準備中/);
  assert.match(html,/同意内容や同意日時などの記録は残ります/);
  assert.match(html,/バックアップ等の記録は同時に消去されるものではありません/);
  assert.doesNotMatch(html,/LINEのユーザーIDなど、解除の確認に使う記録は残ります/);
  assert.doesNotMatch(html,/「マイページ」からアカウントを削除すると/);
  console.log('PASS offline rendered wording:',page);
}
