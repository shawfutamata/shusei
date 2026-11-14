// 実コンポーネントの読取専用導線と状態を検証する。実ネットワーク・送信・ブラウザ描画は使わない。
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['app/LineConnectionCard.tsx'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', '*.css'], loader: { '.css': 'empty' }, jsx: 'transform', jsxFactory: '__ui.createElement', tsconfigRaw: { compilerOptions: { jsx: 'react' } } });
const base = { linked: false, enabled: true, canEnable: true, notificationsReady: true, notifyMessage: false, notifyOffer: false };
const all = (node, predicate) => !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => all(child, predicate))];
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).flat(Infinity).map(textOf).join('');
function fixture() {
  const slots = [], effects = [], requests = [], listeners = new Map(), timers = new Map(), late = [];
  let cursor = 0, tree, mounted = true, nextTimer = 0;
  const hooks = { useState(value) { const index = cursor++; if (!(index in slots)) slots[index] = value; return [slots[index], next => { if (!mounted) late.push(next); slots[index] = next; }]; }, useEffect(effect) { const index = cursor++; if (!(index in slots)) { slots[index] = { effect }; effects.push(() => slots[index].cleanup = effect()); } } };
  const loaded = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require(name) { if (name.endsWith('.css')) return {}; assert.equal(name, 'react'); return hooks; }, __ui: { createElement(type, props, ...children) { return { type, props: props || {}, children }; } }, AbortController, setTimeout(fn, ms) { assert.equal(ms, 15000); const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, window: { addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); }, removeEventListener(type, fn) { listeners.get(type)?.delete(fn); } }, fetch(url, options) { assert.equal(url, '/api/line/settings'); assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.body, undefined); return new Promise((resolve, reject) => requests.push({ options, resolve, reject })); } });
  const render = () => { cursor = 0; tree = loaded.exports.default(); while (effects.length) effects.shift()(); return tree; };
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); render(); };
  render();
  return { requests, late, timers, render, text: () => textOf(render()), links: () => all(render(), n => n.type === 'a'), event(type, persisted = true) { for (const fn of listeners.get(type) || []) fn({ persisted }); }, async response(index, body, ok = true) { requests[index].resolve({ ok, json: async () => body }); await settle(); }, async reject(index) { requests[index].reject(Error('network')); await settle(); }, expire() { for (const fn of [...timers.values()]) fn(); }, strict() { for (const slot of slots) if (slot?.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); } }, unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); } };
}
test('完成前のLINE導線はマイページに表示しない（連携管理機能は保持）', () => {
  const source = readFileSync('app/BoardClient.tsx', 'utf8'); assert.doesNotMatch(source, /<LineConnectionCard \/>/); assert.doesNotMatch(source, /import LineConnectionCard/); assert.doesNotMatch(source, /<LineSettingsLink/);
  const f = fixture(); assert.match(f.text(), /確認中/); assert.equal(f.links().length, 1); assert.equal(f.links()[0].props.href, '/settings/line'); assert.equal(f.requests.length, 1); assert.doesNotMatch(f.text(), /未連携/); f.unmount();
});
for (const [name, data, expected, label] of [
  ['一般OFF未連携', { enabled: false }, /新しいLINE連携は準備中/, 'LINE連携の設定を見る'],
  ['一般ON未連携', {}, /次の画面で説明を確認/, 'LINEを連携する'],
  ['会員利用不可', { canEnable: false }, /現在の会員状態/, 'LINE連携の設定を見る'],
  ['一般OFF連携済み', { linked: true, enabled: false, notificationsReady: false }, /連携済み.*LINE通知は準備中/, '通知設定・連携解除'],
  ['連携済み利用不可', { linked: true, canEnable: false }, /連携済み.*詳細は設定画面/, '通知設定・連携解除'],
  ['一般ON連携済み通知OFF', { linked: true }, /LINE通知：オフ/, '通知設定・連携解除'],
  ['メッセージ通知のみ', { linked: true, notifyMessage: true }, /設定あり.*届かない場合/, '通知設定・連携解除'],
  ['オファー通知のみ', { linked: true, notifyOffer: true }, /設定あり.*届かない場合/, '通知設定・連携解除'],
  ['全体OFFでは過去の通知同意から配信中と表示しない', { linked: true, enabled: false, notificationsReady: false, notifyMessage: true, notifyOffer: true }, /LINE通知は準備中/, '通知設定・連携解除'],
]) test(name, async () => { const f = fixture(); await f.response(0, { ...base, ...data, displayName: '非表示にするLINE名' }); assert.match(f.text(), expected); assert.equal(textOf(f.links()[0]), `${label}›`); assert.doesNotMatch(f.text(), /非表示にするLINE名/); assert.equal(f.requests.length, 1); assert.equal(f.timers.size, 0); f.unmount(); });
for (const [name, body, ok] of [['401', { error: 'Login' }, false], ['不正値', { ...base, linked: 'true' }, true], ['欠落', { linked: false }, true], ['null', null, true]]) test(`取得失敗を未連携と誤表示しない: ${name}`, async () => { const f = fixture(); await f.response(0, body, ok); assert.match(f.text(), /状態を確認できません/); assert.doesNotMatch(f.text(), /未連携/); assert.equal(f.links()[0].props.href, '/settings/line'); f.unmount(); });
test('通信エラーでも設定入口を残す', async () => { const f = fixture(); await f.reject(0); assert.match(f.text(), /状態を確認できません/); assert.equal(f.links().length, 1); f.unmount(); });
test('15秒で中断し遅延応答も破棄する', async () => { const f = fixture(); f.expire(); assert.equal(f.requests[0].options.signal.aborted, true); await f.response(0, { ...base, linked: true }); assert.match(f.text(), /状態を確認できません/); assert.doesNotMatch(f.text(), /連携済み/); f.unmount(); });
test('離脱後は古い応答を破棄しBackで最新状態を読む', async () => { const f = fixture(); f.event('pagehide'); assert.equal(f.requests[0].options.signal.aborted, true); f.event('pageshow'); assert.equal(f.requests.length, 2); await f.response(1, { ...base, linked: true }); await f.response(0, base); assert.match(f.text(), /連携済み/); assert.doesNotMatch(f.text(), /未連携/); f.unmount(); });
test('既に描画済みの連携状態も履歴復元で読み直す', async () => { const f = fixture(); await f.response(0, { ...base, linked: true }); f.event('pagehide'); f.event('pageshow'); assert.match(f.text(), /確認中/); assert.doesNotMatch(f.text(), /連携済み/); await f.response(1, base); assert.match(f.text(), /未連携/); f.unmount(); });
test('通常pageshowは二重読取しない', () => { const f = fixture(); f.event('pageshow', false); assert.equal(f.requests.length, 1); f.unmount(); });
test('StrictModeの古いeffect応答を反映しない', async () => { const f = fixture(); f.strict(); assert.equal(f.requests.length, 2); assert.equal(f.requests[0].options.signal.aborted, true); await f.response(1, base); await f.response(0, { ...base, linked: true }); assert.match(f.text(), /未連携/); f.unmount(); });
test('unmount後の応答は描画状態を変更しない', async () => { const f = fixture(); f.unmount(); await f.response(0, base); assert.equal(f.requests[0].options.signal.aborted, true); assert.equal(f.late.length, 0); assert.equal(f.timers.size, 0); });
