// 実TSXのイベントと状態遷移を独立実行する。DOM・ブラウザ描画・HTTP・実LINE/メールは使わない。
// React hookと要素ツリーの最小ハーネスなので、レイアウト・実ブラウザ合格の代わりにはならない。
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundles = new Map();
for (const [name, path] of [['privacy', 'app/account/privacy/PrivacyForm.tsx'], ['settings', 'app/settings/line/LineSettings.tsx']]) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'next/link'], loader: { '.css': 'empty' }, jsx: 'transform', jsxFactory: '__ui.createElement', jsxFragment: '__ui.Fragment', tsconfigRaw: { compilerOptions: { jsx: 'react', paths: { '@/*': ['./*'] } } } });
  bundles.set(name, result.outputFiles[0].text);
}
const linkedStatus = { withdrawalReady: true, enabled: true, notificationsReady: true, linked: true, displayName: '', notifyMessage: false, notifyOffer: false, canUnlink: true, canEnable: true, friendUrl: '' };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function children(node) { return (node?.children || []).flat(Infinity); }
function textOf(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : children(node).map(textOf).join(''); }
function all(node, predicate) { if (!node || typeof node !== 'object') return []; return [...(predicate(node) ? [node] : []), ...children(node).flatMap(child => all(child, predicate))]; }
function fixture(kind, props = {}) {
  const slots = [], effects = [], requests = [], navigations = [], focus = [], lateUpdates = [];
  let cursor = 0, tree, mounted = true, dirty = false;
  class Element { constructor(label) { this.label = label; } focus() { focus.push(this.label); } }
  const trigger = new Element('privacy trigger');
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { if (!mounted) lateUpdates.push(index); slots[index] = typeof next === 'function' ? next(slots[index]) : next; dirty = true; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, dependencies) { const index = cursor++, prior = slots[index]; if (!prior || !dependencies || dependencies.some((value, i) => !Object.is(value, prior.dependencies[i]))) { slots[index] = { dependencies, cleanup: prior?.cleanup }; effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  const loaded = { exports: {} };
  const context = { module: loaded, exports: loaded.exports, require(name) { if (name === 'react') return hooks; if (name === 'next/link') return 'a'; throw Error(`Unexpected dependency: ${name}`); }, __ui: { Fragment: Symbol('Fragment'), createElement(type, props, ...children) { return { type, props: props || {}, children }; } }, AbortController, document: { activeElement: trigger }, HTMLElement: Element, window: { location: { assign(url) { navigations.push(url); } } }, fetch(url, options = {}) { assert.ok(['/api/account/privacy', '/api/line/settings'].includes(url), `only mocked local endpoints: ${url}`); const wait = deferred(); const request = { url, options, body: options.body ? JSON.parse(options.body) : undefined, ...wait }; requests.push(request); return wait.promise; } };
  vm.runInNewContext(bundles.get(kind), context, { filename: `${kind}.test-bundle.cjs` });
  const component = loaded.exports.default;
  function render() {
    assert.ok(mounted, 'unmounted component must not render again');
    do { dirty = false; cursor = 0; tree = component(props); for (const node of all(tree, node => node.props.ref)) node.props.ref.current = new Element(textOf(node)); while (effects.length) effects.shift()(); } while (dirty);
    return tree;
  }
  const nodes = predicate => all(render(), predicate);
  const button = label => { const matches = nodes(node => node.type === 'button' && textOf(node) === label); assert.equal(matches.length, 1, `one button: ${label}`); return matches[0]; };
  function submit(label) {
    render(); const node = all(tree, node => node.type === 'button' && textOf(node) === label)[0]; assert.ok(node && !node.props.disabled, `enabled submit: ${label}`);
    const form = all(tree, candidate => candidate.type === 'form' && all(candidate, child => child === node).length)[0]; assert.ok(form, `form: ${label}`); form.props.onSubmit({ preventDefault() {} });
  }
  function change(predicate, value) { const node = nodes(predicate)[0]; assert.ok(node, 'input exists'); assert.ok(!node.props.disabled, 'input enabled'); node.props.onChange({ target: { value } }); }
  async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); if (mounted) render(); }
  async function respond(index, data, ok = true) { assert.ok(requests[index], `request ${index}`); requests[index].resolve({ ok, json: async () => data }); await settle(); }
  async function reject(index, message = '通信に失敗しました。') { requests[index].reject(new Error(message)); await settle(); }
  function unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); }
  render();
  return { kind, render, nodes, button, click(label) { const node = button(label); assert.ok(!node.props.disabled, `enabled button: ${label}`); assert.equal(typeof node.props.onClick, 'function', `click handler: ${label}`); node.props.onClick(); }, submit, change, settle, respond, reject, unmount, requests, navigations, focus, lateUpdates, text: () => textOf(render()) };
}
async function ready(kind, props = {}) {
  const f = fixture(kind, props);
  if (kind === 'settings') { await f.respond(0, linkedStatus); f.click('メールで本人確認して連携解除'); }
  else if (!props.initialPending) f.change(node => node.type === 'input' && node.props.type === 'email', 'member@example.invalid');
  return f;
}
const requestLabel = kind => kind === 'privacy' ? '確認コードを送る' : '確認コードをメールで送る';
const cancelLabel = kind => kind === 'privacy' ? 'キャンセルして入力し直す' : 'キャンセル';
const confirmLabel = kind => kind === 'privacy' ? '本人確認してLINE連携を解除' : 'LINE連携を解除する';
function request(f) { if (f.kind === 'privacy') f.submit(requestLabel(f.kind)); else f.click(requestLabel(f.kind)); }
async function sent(f) { request(f); await f.respond(f.requests.length - 1, { sent: true }); f.change(node => node.type === 'input' && node.props.autoComplete === 'one-time-code', '123456'); }
async function pending(f, recovery = true) { await sent(f); f.submit(confirmLabel(f.kind)); await f.respond(f.requests.length - 1, { pending: true, needsLineConfirmation: recovery }); }

for (const kind of ['privacy', 'settings']) {
  test(`${kind}: pending hides resend/code, recovery is shown only when needed`, async () => {
    const f = await ready(kind); await pending(f);
    assert.equal(f.nodes(node => node.type === 'input' && node.props.autoComplete === 'one-time-code').length, 0);
    assert.equal(f.nodes(node => node.type === 'button' && textOf(node) === '確認コードを再送').length, 0);
    assert.equal(f.button('LINEで本人確認して解除を完了').props.disabled, false);
    f.click('解除の処理を再試行');
    assert.equal(f.button('LINEで本人確認して解除を完了').props.disabled, true, 'recovery cannot run alongside retry');
    await f.respond(f.requests.length - 1, { pending: true, needsLineConfirmation: false });
    assert.equal(f.nodes(node => node.type === 'button' && textOf(node) === 'LINEで本人確認して解除を完了').length, 0);
    assert.match(f.text(), /運営窓口/); assert.deepEqual(f.navigations, []);
  });
  test(`${kind}: cancelled pending state resets and explains non-reversible external requests`, async () => {
    const f = await ready(kind); await pending(f); f.click(cancelLabel(kind)); await f.respond(f.requests.length - 1, { canceled: true });
    assert.equal(f.nodes(node => node.type === 'button' && textOf(node) === '解除の処理を再試行').length, 0);
    assert.match(f.text(), /既にLINEへ送信した解除処理は取り消されません/); assert.deepEqual(f.navigations, []);
    if (kind === 'settings') { assert.ok(f.focus.includes('privacy trigger')); f.click('メールで本人確認して連携解除'); }
    request(f); await f.respond(f.requests.length - 1, { sent: true });
    assert.equal(f.nodes(node => node.type === 'input' && node.props.autoComplete === 'one-time-code')[0].props.value, '', 'a new flow never reuses the cancelled code');
  });
  for (const action of ['request', 'confirm', 'retry']) {
    test(`${kind}: ${action} cannot race cancel or a second submission before rerender`, async () => {
      const f = await ready(kind);
      if (action !== 'request') await sent(f);
      if (action === 'retry') { f.submit(confirmLabel(kind)); await f.respond(f.requests.length - 1, { pending: true }); }
      const before = f.requests.length;
      let invoke;
      if (action === 'request') {
        if (kind === 'settings') invoke = f.button(requestLabel(kind)).props.onClick;
        else invoke = f.nodes(node => node.type === 'form')[0].props.onSubmit;
      } else if (action === 'retry') invoke = f.button('解除の処理を再試行').props.onClick;
      else invoke = f.nodes(node => node.type === 'form' && all(node, child => child.type === 'input' && child.props.autoComplete === 'one-time-code').length)[0].props.onSubmit;
      const cancel = (kind === 'settings' || action !== 'request') ? f.button(cancelLabel(kind)).props.onClick : null;
      invoke({ preventDefault() {} }); invoke({ preventDefault() {} }); cancel?.();
      assert.equal(f.requests.length, before + 1, 'in-flight operation and cancel are serialized');
      await f.respond(before, action === 'request' ? { sent: true } : { pending: true });
      f.click(cancelLabel(kind)); await f.respond(f.requests.length - 1, { canceled: true });
      assert.deepEqual(f.navigations, []);
      assert.equal(f.nodes(node => node.type === 'input' && node.props.autoComplete === 'one-time-code').length, 0);
    });
    test(`${kind}: ${action} response after unmount cannot revive state or navigate`, async () => {
      const f = await ready(kind);
      if (action !== 'request') await sent(f);
      if (action === 'retry') { f.submit(confirmLabel(kind)); await f.respond(f.requests.length - 1, { pending: true }); }
      if (action === 'request') request(f); else if (action === 'confirm') f.submit(confirmLabel(kind)); else f.click('解除の処理を再試行');
      f.unmount(); await f.respond(f.requests.length - 1, { done: true, signedOut: true });
      assert.deepEqual(f.navigations, [], 'old completion must not navigate from a newer screen'); assert.deepEqual(f.lateUpdates, [], 'old response must not update unmounted component');
    });
  }

  for (const action of ['request', 'confirm', 'retry', 'cancel']) for (const outcome of ['success', 'failure']) {
    test(`${kind}: ${action} delayed JSON ${outcome} after leaving the screen is ignored`, async () => {
      const f = await ready(kind);
      if (action !== 'request') await sent(f);
      if (action === 'retry' || action === 'cancel') { f.submit(confirmLabel(kind)); await f.respond(f.requests.length - 1, { pending: true }); }
      if (action === 'request') request(f);
      else if (action === 'confirm') f.submit(confirmLabel(kind));
      else f.click(action === 'retry' ? '解除の処理を再試行' : cancelLabel(kind));
      const body = deferred();
      f.requests.at(-1).resolve({ ok: true, json: () => body.promise }); await f.settle();
      if (kind === 'settings' || action !== 'request') assert.equal(f.button(cancelLabel(kind)).props.disabled, true, 'cancel stays disabled until the whole response is read');
      f.unmount();
      if (outcome === 'failure') body.reject(Error('late JSON failure'));
      else body.resolve({ sent: true, canceled: true, done: true, signedOut: true });
      await f.settle(); assert.deepEqual(f.navigations, []); assert.deepEqual(f.lateUpdates, []);
    });
  }
  for (const action of ['request', 'cancel']) {
    test(`${kind}: ${action} missing acknowledgement remains retryable`, async () => {
      const f = await ready(kind); if (action === 'cancel') await pending(f);
      if (action === 'request') request(f); else f.click(cancelLabel(kind));
      await f.respond(f.requests.length - 1, {});
      assert.equal(f.nodes(node => node.props.role === 'alert').length, 1); assert.deepEqual(f.navigations, []);
      if (action === 'cancel') assert.ok(f.button('解除の処理を再試行'));
      else assert.equal(f.nodes(node => node.type === 'input' && node.props.autoComplete === 'one-time-code').length, 0);
    });
  }
  test(`${kind}: completed withdrawal routes to account removal`, async () => {
    const f = await ready(kind, { withdrawalReady: true });
    if (kind === 'settings') f.click('退会の本人確認へ');
    else f.change(node => node.type === 'select', 'withdraw');
    await sent(f);
    f.submit(kind === 'privacy' ? '本人確認して退会する' : '退会して会員情報を削除する');
    assert.equal(f.requests.at(-1).body.purpose, 'withdraw');
    await f.respond(f.requests.length - 1, { done: true, signedOut: true });
    assert.deepEqual(f.navigations, ['/login/member?login=account_removed']);
  });
  for (const data of [{}, { done: false }, { signedOut: true }, { done: true, pending: true }]) {
    test(`${kind}: unconfirmed ${JSON.stringify(data)} never displays completion`, async () => {
      const f = await ready(kind); await sent(f); f.submit(confirmLabel(kind)); await f.respond(f.requests.length - 1, data);
      assert.deepEqual(f.navigations, []); assert.doesNotMatch(f.text(), /LINE連携を解除しました。/);
      assert.ok(f.nodes(node => node.props.role === 'alert').length || f.nodes(node => node.type === 'button' && textOf(node) === '解除の処理を再試行').length, 'remain retryable or report pending/error');
    });
  }
  test(`${kind}: verified done reaches the correct destination`, async () => {
    const f = await ready(kind); await sent(f); f.submit(confirmLabel(kind)); await f.respond(f.requests.length - 1, { done: true, signedOut: true });
    assert.deepEqual(f.navigations, ['/login/member?login=line_removed']);
  });
  for (const action of ['request', 'retry', 'cancel']) for (const failure of ['http', 'network', 'json']) {
    test(`${kind}: ${action} ${failure} failure retains a usable state`, async () => {
      const f = await ready(kind); if (action !== 'request') await pending(f, false);
      if (action === 'request') request(f); else f.click(action === 'retry' ? '解除の処理を再試行' : cancelLabel(kind));
      const index = f.requests.length - 1;
      if (failure === 'network') await f.reject(index);
      else if (failure === 'http') await f.respond(index, { error: '検証用の失敗' }, false);
      else { f.requests[index].resolve({ ok: true, json: async () => { throw Error('invalid JSON'); } }); await f.settle(); }
      assert.equal(f.nodes(node => node.props.role === 'alert').length, 1); assert.deepEqual(f.navigations, []);
      if (action !== 'request') assert.equal(f.button('解除の処理を再試行').props.disabled, false);
    });
  }
}
test('privacy: initialPending starts with recovery and without requesting another code', async () => {
  const f = await ready('privacy', { initialPending: true, initialMessage: '解除は未完了です。' });
  assert.equal(f.requests.length, 0); assert.equal(f.nodes(node => node.type === 'input' && node.props.type === 'email').length, 0);
  assert.ok(f.button('解除の処理を再試行')); assert.ok(f.button('LINEで本人確認して解除を完了')); assert.match(f.text(), /解除は未完了です/);
  f.click('解除の処理を再試行'); await f.respond(0, { pending: true, needsLineConfirmation: false });
  assert.equal(f.nodes(node => node.type === 'button' && textOf(node) === 'LINEで本人確認して解除を完了').length, 0);
});
test('settings: done without sign-out updates the linked UI only when confirmed', async () => {
  const f = await ready('settings'); await sent(f); f.submit(confirmLabel('settings')); await f.respond(f.requests.length - 1, { done: true, signedOut: false });
  assert.deepEqual(f.navigations, []); assert.match(f.text(), /LINE連携を解除しました/); assert.doesNotMatch(f.text(), /LINE連携済み/);
  assert.equal(f.nodes(node => node.props['aria-label'] === '操作の確認').length, 0);
});

for (const outcome of ['success', 'failure']) {
  test(`settings: loading status ${outcome} after unmount is ignored`, async () => {
    const f = fixture('settings'); f.unmount();
    assert.equal(f.requests[0].options.signal.aborted, true);
    if (outcome === 'success') await f.respond(0, linkedStatus); else await f.reject(0);
    assert.deepEqual(f.lateUpdates, []); assert.deepEqual(f.navigations, []);
  });
}
test('settings: notification stop and privacy actions use the same synchronous lock', async () => {
  const f = await ready('settings'); const stop = f.button('LINE通知をすべて停止').props.onClick;
  const send = f.button(requestLabel('settings')).props.onClick;
  const cancel = f.button(cancelLabel('settings')).props.onClick;
  const withdraw = f.button('退会の本人確認へ').props.onClick;
  const before = f.requests.length; stop(); stop(); send(); cancel(); withdraw();
  assert.equal(f.requests.length, before + 1); assert.equal(f.requests.at(-1).body.action, 'preferences');
  f.unmount(); await f.respond(before, linkedStatus);
  assert.deepEqual(f.lateUpdates, []); assert.deepEqual(f.navigations, []);
});
