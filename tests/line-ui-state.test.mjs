// 実TSXのイベントと状態遷移を独立実行する。DOM・ブラウザ描画・HTTP・実LINE/メールは使わない。
// React hookと要素ツリーの最小ハーネスなので、レイアウト・実ブラウザ合格の代わりにはならない。
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundles = new Map();
for (const [name, path] of [['privacy', 'app/account/privacy/PrivacyForm.tsx'], ['settings', 'app/settings/line/LineSettings.tsx']]) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react', 'next/link'], loader: { '.css': 'empty', '.module.css': 'empty' }, jsx: 'transform', jsxFactory: '__ui.createElement', jsxFragment: '__ui.Fragment', tsconfigRaw: { compilerOptions: { jsx: 'react', paths: { '@/*': ['./*'] } } } });
  bundles.set(name, result.outputFiles[0].text);
}
const linkedStatus = { withdrawalReady: true, enabled: true, notificationsReady: true, linked: true, displayName: '', notifyMessage: false, notifyOffer: false, canUnlink: true, canEnable: true, friendUrl: '' };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function children(node) { return (node?.children || []).flat(Infinity); }
function textOf(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : children(node).map(textOf).join(''); }
function all(node, predicate) { if (!node || typeof node !== 'object') return []; return [...(predicate(node) ? [node] : []), ...children(node).flatMap(child => all(child, predicate))]; }
function fixture(kind, props = {}) {
  const slots = [], effects = [], requests = [], navigations = [], focus = [], lateUpdates = [], timers = new Map();
  const listeners = new Map(), reloads = [], focusAttempts = [];
  let triggerButtonLabel = null;
  let timerId = 0;
  let cursor = 0, tree, mounted = true, dirty = false;
  class Element { constructor(label) { this.label = label; this.disabled = false; this.isConnected = true; } focus() { focusAttempts.push({ label: this.label, disabled: this.disabled, connected: this.isConnected }); if (!this.disabled && this.isConnected) focus.push(this.label); } }
  const trigger = new Element('privacy trigger');
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { if (!mounted) lateUpdates.push(index); slots[index] = typeof next === 'function' ? next(slots[index]) : next; dirty = true; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, dependencies) { const index = cursor++, prior = slots[index]; if (!prior || !dependencies || dependencies.some((value, i) => !Object.is(value, prior.dependencies[i]))) { slots[index] = { dependencies, effect, cleanup: prior?.cleanup }; effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); }); } },
  };
  const loaded = { exports: {} };
  const context = { module: loaded, exports: loaded.exports, require(name) { if (name === 'react') return hooks; if (name === 'next/link') return 'a'; throw Error(`Unexpected dependency: ${name}`); }, __ui: { Fragment: Symbol('Fragment'), createElement(type, props, ...children) { return { type, props: props || {}, children }; } }, AbortController, URL, URLSearchParams, setTimeout(fn, ms) { assert.equal(ms,20000); const id=++timerId; timers.set(id,fn); return id; }, clearTimeout(id) { timers.delete(id); }, document: { activeElement: trigger }, HTMLElement: Element, window: { addEventListener(type, fn) { if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn); }, removeEventListener(type, fn) { listeners.get(type)?.delete(fn); }, location: { reload() { reloads.push(true); }, assign(url) { navigations.push(url); } } }, fetch(url, options = {}) { assert.ok(['/api/account/privacy', '/api/line/settings', '/api/auth/line/start'].includes(url), `only mocked local endpoints: ${url}`); const wait = deferred(); const request = { url, options, body: options.body ? (url === '/api/auth/line/start' ? Object.fromEntries(new URLSearchParams(options.body)) : JSON.parse(options.body)) : undefined, ...wait }; requests.push(request); return wait.promise; } };
  vm.runInNewContext(bundles.get(kind), context, { filename: `${kind}.test-bundle.cjs` });
  const component = loaded.exports.default;
  function render() {
    assert.ok(mounted, 'unmounted component must not render again');
    do { dirty = false; cursor = 0; tree = component(props); if (triggerButtonLabel) { const triggerNode = all(tree, node => node.type === 'button' && textOf(node) === triggerButtonLabel)[0]; trigger.disabled = Boolean(triggerNode?.props.disabled); trigger.isConnected = Boolean(triggerNode); } for (const node of all(tree, node => node.props.ref)) node.props.ref.current = new Element(textOf(node)); while (effects.length) effects.shift()(); } while (dirty);
    return tree;
  }
  const nodes = predicate => all(render(), predicate);
  const button = label => { const matches = nodes(node => node.type === 'button' && textOf(node) === label); assert.equal(matches.length, 1, `one button: ${label}`); return matches[0]; };
  function submit(label) {
    render(); const node = all(tree, node => node.type === 'button' && textOf(node) === label)[0]; assert.ok(node && !node.props.disabled, `enabled submit: ${label}`);
    const form = all(tree, candidate => candidate.type === 'form' && all(candidate, child => child === node).length)[0]; assert.ok(form, `form: ${label}`); form.props.onSubmit({ preventDefault() {} });
  }
  function change(predicate, value) { const node = nodes(predicate)[0]; assert.ok(node, 'input exists'); assert.ok(!node.props.disabled, 'input enabled'); node.props.onChange({ target: { value, checked: value } }); }
  async function settle(commit = true) { for (let i = 0; i < 8; i++) await Promise.resolve(); if (mounted && commit) render(); }
  async function respond(index, data, ok = true) { assert.ok(requests[index], `request ${index}`); requests[index].resolve({ ok, json: async () => data }); await settle(); }
  async function reject(index, message = '通信に失敗しました。') { requests[index].reject(new Error(message)); await settle(); }
  function unmount() { mounted = false; trigger.isConnected = false; for (const slot of slots) slot?.cleanup?.(); }
  render();
  return { kind, focusAttempts, focusElsewhere() { context.document.activeElement = new Element('different control'); }, async respondWithoutCommit(index, data) { requests[index].resolve({ ok: true, json: async () => data }); await settle(false); }, strictEffects() { for(const slot of slots) if(slot?.effect) { slot.cleanup?.(); slot.cleanup=slot.effect(); } }, reloads, pageEvent(type,persisted=true) { for(const fn of listeners.get(type)||[])fn({persisted}); }, expireOAuth() { for(const fn of timers.values()) fn(); }, render, nodes, button, click(label) { const node = button(label); assert.ok(!node.props.disabled, `enabled button: ${label}`); assert.equal(typeof node.props.onClick, 'function', `click handler: ${label}`); if (kind === 'settings' && ['メールで本人確認して連携解除', '退会の本人確認へ'].includes(label)) triggerButtonLabel = label; node.props.onClick(kind === 'settings' && ['メールで本人確認して連携解除', '退会の本人確認へ'].includes(label) ? { currentTarget: trigger } : undefined); }, submit, change, settle, respond, reject, unmount, requests, navigations, focus, lateUpdates, text: () => textOf(render()) };
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
    if (kind === 'settings') { assert.match(f.focus.at(-1), /通知停止や、既にLINEへ送信した解除処理は取り消されません/); f.click('メールで本人確認して連携解除'); }
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

const lineUrl = 'https://access.line.me/oauth2/v2.1/authorize?state=fixture';
async function oauthFixture(kind, action) {
  if(action === 'unlink_recovery') { const f = await ready(kind); await pending(f); return f; }
  const f = fixture('settings'); await f.respond(0, { ...linkedStatus, linked: action === 'preferences' });
  f.change(node => node.type === 'input' && node.props.name === (action === 'link' ? 'consent' : 'message'), true); return f;
}
const oauthLabel = action => action === 'link' ? 'LINEを連携する' : action === 'preferences' ? 'LINEで確認して設定を保存' : 'LINEで本人確認して解除を完了';
for(const [kind, action] of [['settings','link'],['settings','preferences'],['settings','unlink_recovery'],['privacy','unlink_recovery']]) {
  test(`${kind} ${action}: explicit POST, double click lock and fixed destination`, async () => {
    const f = await oauthFixture(kind, action), button = f.button(oauthLabel(action)), before = f.requests.length;
    button.props.onClick(); button.props.onClick(); assert.equal(f.requests.length, before+1);
    const req = f.requests.at(-1); assert.equal(req.url, '/api/auth/line/start'); assert.equal(req.body.action,action); assert.equal(req.body.consent,'yes');
    assert.equal(req.options.redirect,'error'); assert.equal(req.options.credentials,'same-origin'); assert.equal(req.options.cache,'no-store'); assert.equal(req.options.headers.Accept,'application/json');
    if(action==='preferences') { assert.equal(req.body.message,'yes'); assert.equal(req.body.offer,undefined); }
    await f.respond(before,{authorizeUrl:lineUrl}); assert.deepEqual(f.navigations,[lineUrl]);
  });
  test(`${kind} ${action}: error visible and retryable`, async () => {
    const f=await oauthFixture(kind,action);f.click(oauthLabel(action));await f.reject(f.requests.length-1);
    assert.match(f.text(),/完了は確認できていません/);assert.equal(f.button(oauthLabel(action)).props.disabled,action==='preferences'?undefined:false);assert.deepEqual(f.navigations,[]);
  });
  test(`${kind} ${action}: unmount suppresses delayed navigation`, async () => {
    const f=await oauthFixture(kind,action);f.click(oauthLabel(action));const index=f.requests.length-1;f.unmount();assert.equal(f.requests[index].options.signal.aborted,true);
    await f.respond(index,{authorizeUrl:lineUrl});assert.deepEqual(f.navigations,[]);assert.deepEqual(f.lateUpdates,[]);
  });
}
for(const kind of ['settings','privacy']) {
  for(const destination of ['https://evil.example/oauth2/v2.1/authorize','https://user@access.line.me/oauth2/v2.1/authorize','https://access.line.me/other','https://access.line.me/oauth2/v2.1/authorize#bad']) {
    test(`${kind}: rejects unsafe OAuth destination ${destination}`,async()=>{
      const f=await oauthFixture(kind,'unlink_recovery');f.click(oauthLabel('unlink_recovery'));await f.respond(f.requests.length-1,{authorizeUrl:destination});assert.deepEqual(f.navigations,[]);assert.match(f.text(),/完了は確認できていません/);
    });
  }
  test(`${kind}: cancel aborts OAuth and ignores late successful start`,async()=>{
    const f=await oauthFixture(kind,'unlink_recovery');f.click(oauthLabel('unlink_recovery'));const index=f.requests.length-1;
    f.click(cancelLabel(kind));assert.equal(f.requests[index].options.signal.aborted,true);assert.equal(f.requests.at(-1).body.action,'cancel');
    await f.respond(f.requests.length-1,{canceled:true});await f.respond(index,{authorizeUrl:lineUrl});assert.deepEqual(f.navigations,[]);assert.match(f.text(),/送信した解除処理は取り消されません/);
  });
}
test('settings: unchecked consent blocks link and both OFF bypass OAuth',async()=>{
  const f=fixture('settings');await f.respond(0,{...linkedStatus,linked:false});const button=f.button('LINEを連携する');assert.equal(button.props.disabled,true);button.props.onClick();assert.equal(f.requests.length,1);
  const g=fixture('settings');await g.respond(0,linkedStatus);g.click('LINE通知を停止');assert.equal(g.requests.at(-1).url,'/api/line/settings');assert.deepEqual(g.requests.at(-1).body,{action:'preferences',message:false,offer:false});await g.respond(1,linkedStatus);
});

for(const kind of ['settings','privacy']) test(`${kind}: OAuth timeout cannot navigate on late response`,async()=>{
  const f=await oauthFixture(kind,'unlink_recovery');f.click(oauthLabel('unlink_recovery'));const index=f.requests.length-1;
  f.expireOAuth();assert.equal(f.requests[index].options.signal.aborted,true);await f.respond(index,{authorizeUrl:lineUrl});assert.deepEqual(f.navigations,[]);assert.match(f.text(),/完了は確認できていません/);
});

for(const [kind,action] of [['settings','link'],['settings','preferences'],['settings','unlink_recovery'],['privacy','unlink_recovery']]) test(`${kind} ${action}: form submit uses guarded JSON entry too`,async()=>{
  const f=await oauthFixture(kind,action);f.submit(oauthLabel(action));assert.equal(f.requests.at(-1).body.action,action);await f.respond(f.requests.length-1,{authorizeUrl:lineUrl});assert.deepEqual(f.navigations,[lineUrl]);
});

for(const [kind,action] of [['settings','link'],['settings','preferences'],['settings','unlink_recovery'],['privacy','unlink_recovery']]) {
  for(const late of ['success','failure']) test(`${kind} ${action}: BFCache pagehide/restore rejects late ${late}`,async()=>{
    const f=await oauthFixture(kind,action);f.pageEvent('pageshow',false);assert.equal(f.reloads.length,0);
    f.click(oauthLabel(action));const index=f.requests.length-1;f.pageEvent('pagehide');assert.equal(f.requests[index].options.signal.aborted,true);
    f.pageEvent('pageshow');assert.equal(f.reloads.length,1);
    if(late==='success')await f.respond(index,{authorizeUrl:lineUrl});else await f.reject(index);
    assert.deepEqual(f.navigations,[]);assert.doesNotMatch(f.text(),/本人確認画面を開けませんでした/);
    const before=f.requests.length;f.button(oauthLabel(action)).props.onClick();assert.equal(f.requests.length,before,'old document locked until reload');
    f.unmount();f.pageEvent('pageshow');assert.equal(f.reloads.length,1,'listeners removed');
    const fresh=await oauthFixture(kind,action);fresh.click(oauthLabel(action));await fresh.respond(fresh.requests.length-1,{authorizeUrl:lineUrl});assert.deepEqual(fresh.navigations,[lineUrl],'fresh document is usable');
  });
}
for(const kind of ['settings','privacy']) test(`${kind}: pagehide invalidates sent privacy response without claiming cancellation`,async()=>{
  const f=await ready(kind);await sent(f);f.submit(confirmLabel(kind));const index=f.requests.length-1;
  f.pageEvent('pagehide');f.pageEvent('pageshow');await f.respond(index,{done:true,signedOut:true});
  assert.equal(f.reloads.length,1);assert.deepEqual(f.navigations,[]);assert.doesNotMatch(f.text(),/LINE連携を解除しました|本人確認をキャンセルしました/);
});
test('settings: pagehide aborts initial status read',async()=>{
  const f=fixture('settings');f.pageEvent('pagehide');assert.equal(f.requests[0].options.signal.aborted,true);f.pageEvent('pageshow');await f.respond(0,linkedStatus);assert.equal(f.reloads.length,1);assert.match(f.text(),/設定を読み込み中/);
});

for(const [kind,action] of [['settings','link'],['settings','preferences'],['settings','unlink_recovery'],['privacy','unlink_recovery']]) test(`${kind} ${action}: StrictMode effect replay does not retain lock`,async()=>{
  const f=await oauthFixture(kind,action);f.strictEffects();
  if(kind==='settings')await f.respond(f.requests.length-1,{...linkedStatus,linked:action!=='link'});
  if(action==='preferences')f.change(node=>node.type==='input'&&node.props.name==='message',true);
  f.click(oauthLabel(action));assert.equal(f.requests.at(-1).url,'/api/auth/line/start');await f.respond(f.requests.length-1,{authorizeUrl:lineUrl});assert.deepEqual(f.navigations,[lineUrl]);
});

// 設定画面の簡素化でも、短い同意ラベルと別ページリンクを同意操作と混同しない。
test('settings design: short consent is unchecked and details link does not authorize', async () => {
  const f = fixture('settings'); await f.respond(0, { ...linkedStatus, linked: false });
  const checkbox = f.nodes(n => n.type === 'input' && n.props.name === 'consent')[0];
  assert.equal(checkbox.props.checked, false); assert.equal(checkbox.props.required, true);
  assert.match(f.text(), /LINE情報の取扱いに同意する.*24時間を超えて保存/); assert.match(f.text(), /ログイン・連携管理に使います/);
  const links = f.nodes(n => n.type === 'a' && n.props.href === '/settings/line/about');
  assert.ok(links.length); for (const link of links) { assert.equal(link.props.onClick, undefined); assert.equal(link.props.target, undefined); }
  assert.equal(f.button('LINEを連携する').props.disabled, true); assert.equal(f.requests.length, 1);
});
test('settings design: general OFF keeps stop and unlink reachable outside closed details', async () => {
  const f = fixture('settings'); await f.respond(0, { ...linkedStatus, enabled: false, notificationsReady: false });
  assert.match(f.text(), /LINE連携済み/); assert.match(f.text(), /新しいLINE連携は準備中/);
  const details = f.nodes(n => n.type === 'details');
  for (const label of ['LINE通知をすべて停止', 'メールで本人確認して連携解除']) {
    const button = f.button(label); assert.equal(button.props.disabled, false); assert.ok(details.every(detail => !all(detail, node => node.type === 'button' && textOf(node) === label).length));
  }
});
test('settings design: irreversible warnings and errors stay outside disclosures', async () => {
  const f = await ready('settings');
  const confirmation = f.nodes(n => n.type === 'section' && n.props['aria-label'] === '操作の確認')[0];
  assert.match(textOf(confirmation), /LINEでログインした端末はログアウト/); assert.match(textOf(confirmation), /会員情報・投稿・登録メールは残ります/); assert.match(textOf(confirmation), /同じGoogleアカウント/);
  assert.ok(f.nodes(n => n.type === 'details').every(detail => !all(detail, node => node.type === 'section' && node.props['aria-label'] === '操作の確認').length));
  request(f); await f.reject(f.requests.length - 1); const alert = f.nodes(n => n.props.role === 'alert')[0]; assert.ok(alert); assert.ok(f.focus.includes(textOf(alert)));
});
test('settings design: saved notification summary does not claim unsaved draft is active', async () => {
  const f = fixture('settings'); await f.respond(0, linkedStatus);
  f.change(n => n.type === 'input' && n.props.name === 'message', true);
  const summary = f.nodes(n => n.type === 'dl')[0]; assert.match(textOf(summary), /LINE通知の設定オフ/); assert.doesNotMatch(textOf(summary), /通知がオン/); assert.match(f.text(), /変更はまだ保存されていません/);
  assert.equal(f.nodes(n => n.type === 'input' && n.props.type === 'checkbox' && n.props.name === 'consent').length, 0, 'notification selection is separate from link consent');
});
test('settings design: unavailable notification service never claims stored preferences are active', async () => {
  const f = fixture('settings'); await f.respond(0, { ...linkedStatus, enabled: false, notificationsReady: false, notifyMessage: true });
  const summary = f.nodes(n => n.type === 'dl')[0]; assert.match(textOf(summary), /LINE通知の設定準備中/); assert.doesNotMatch(textOf(summary), /通知がオン/);
});

// 実ブラウザ同様、disabled中の元ボタンへのfocusは無効。取消成功後のDOM更新が必要。
for (const purpose of ['unlink', 'withdraw']) test(`settings cancel focus: ${purpose} returns once only after the entry is enabled`, async () => {
  const f = fixture('settings'); await f.respond(0, linkedStatus);
  f.click(purpose === 'unlink' ? 'メールで本人確認して連携解除' : '退会の本人確認へ');
  f.click('キャンセル'); f.render();
  const before = f.focus.filter(label => label === 'privacy trigger').length;
  await f.respond(f.requests.length - 1, { canceled: true });
  assert.equal(f.focus.filter(label => label === 'privacy trigger').length, before + 1);
  assert.equal(f.focusAttempts.filter(attempt => attempt.label === 'privacy trigger' && attempt.disabled).length, 0);
  f.render(); f.render(); assert.equal(f.focus.filter(label => label === 'privacy trigger').length, before + 1);
});

test('settings cancel focus: pending cancellation keeps the irreversible-result message as final focus', async () => {
  const f = await ready('settings'); await pending(f); f.click('キャンセル'); f.render();
  const before = f.focus.filter(label => label === 'privacy trigger').length;
  await f.respond(f.requests.length - 1, { canceled: true });
  assert.match(f.focus.at(-1), /通知停止や、既にLINEへ送信した解除処理は取り消されません/);
  assert.equal(f.focus.filter(label => label === 'privacy trigger').length, before);
});
for (const mode of ['error', 'malformed']) test(`settings cancel focus: ${mode} does not restore entry focus`, async () => {
  const f = await ready('settings'); f.click('キャンセル'); f.render();
  await f.respond(f.requests.length - 1, mode === 'error' ? { error: 'fixture error' } : {}, mode !== 'error');
  assert.equal(f.focus.filter(label => label === 'privacy trigger').length, 0);
  assert.match(f.focus.at(-1), /キャンセルを確認できませんでした/);
  assert.equal(f.nodes(n => n.props['aria-label'] === '操作の確認').length, 1);
});
test('settings cancel focus: page leave discards a successful cancellation queued before commit', async () => {
  const f = await ready('settings'); f.click('キャンセル'); f.render();
  await f.respondWithoutCommit(f.requests.length - 1, { canceled: true });
  f.pageEvent('pagehide'); f.render();
  assert.equal(f.focus.filter(label => label === 'privacy trigger').length, 0);
});
test('settings cancel focus: a new action cannot inherit the previous cancellation focus job', async () => {
  const f = await ready('settings'); const next = f.button('退会の本人確認へ').props.onClick;
  f.click('キャンセル'); f.render(); await f.respondWithoutCommit(f.requests.length - 1, { canceled: true });
  next(); f.render();
  assert.equal(f.focus.filter(label => label === 'privacy trigger').length, 0);
  assert.equal(f.focus.at(-1), '退会の確認');
});

test('settings cancel focus: mouse activation uses the clicked entry even if another element was active', async () => {
  const f = fixture('settings'); await f.respond(0, linkedStatus); f.focusElsewhere();
  f.click('メールで本人確認して連携解除'); f.click('キャンセル'); f.render();
  await f.respond(f.requests.length - 1, { canceled: true });
  assert.equal(f.focus.at(-1), 'privacy trigger'); assert.ok(!f.focus.includes('different control'));
});
