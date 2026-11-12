// 詳細ページは静的描画のみ。実認証・送信・外部ネットワークなし。
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const built = await build({ entryPoints:['app/settings/line/about/page.tsx'], bundle:true, write:false, format:'cjs', platform:'node', loader:{'.css':'empty','.module.css':'empty'}, jsx:'transform', jsxFactory:'__ui.createElement', tsconfigRaw:{compilerOptions:{jsx:'react',paths:{'@/*':['./*']}}} });
const loaded={exports:{}};
vm.runInNewContext(built.outputFiles[0].text,{module:loaded,exports:loaded.exports,__ui:{createElement(type,props,...children){return {type,props:props||{},children};}}});
const tree=loaded.exports.default();
const all=(node,p)=>!node||typeof node!=='object'?[]:[...(p(node)?[node]:[]),...(node.children||[]).flat(Infinity).flatMap(child=>all(child,p))];
const text=node=>typeof node==='string'||typeof node==='number'?String(node):(node?.children||[]).flat(Infinity).map(text).join('');
const content=text(tree);
test('details page preserves full v4 disclosure without global consent revision',()=>{
  const source=readFileSync('app/line-data-consent.ts','utf8');assert.match(source,/LINE_DATA_CONSENT_VERSION = '2026-11-11-v4'/);
  const full=source.match(/LINE_LINK_DISCLOSURE = '([^']+)'/)[1];assert.ok(content.includes(full));
  for(const term of ['暗号化した認証トークン','24時間を超えて保存','友だち状態は照会・保存しません','LINE通知を有効にしません','メールのお知らせはLINE通知とは別','解除の確認に使う記録は残ります'])assert.ok(content.includes(term),term);
});
test('details page only provides same-site read and return links, no forms or action handlers',()=>{
  assert.equal(all(tree,n=>n.type==='form'||n.type==='input'||n.type==='button').length,0);
  for(const node of all(tree,n=>n.type==='a')){assert.match(node.props.href,/^\/(?!\/)/);assert.equal(node.props.onClick,undefined);assert.equal(node.props.target,undefined);}
  assert.equal(all(tree,n=>n.type==='a'&&n.props.href==='/settings/line').length,2);
  assert.match(content,/このページを開くだけで、同意や連携・通知が始まることはありません/);
});
test('details page separates unlink from withdrawal and avoids an unverified deletion promise',()=>{
  assert.match(content,/LINE連携の解除だけではTASUKIを退会しません/);assert.match(content,/バックアップ等の取扱いは運営窓口へ/);
  assert.match(content,/未確認の削除期限をお約束するものではありません/);
  assert.doesNotMatch(content,/全ての情報を即時削除|バックアップは\d+日/);
  for(const id of ['notifications','unlink','withdraw'])assert.equal(all(tree,n=>n.props.id===id).length,1);
});
