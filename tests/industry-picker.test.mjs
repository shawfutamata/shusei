// 実コンポーネントを実行し、ブラウザ操作に依存しない選択・入力・スクロール要求を検証する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import * as industries from '../app/industry-options.ts';
const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync('app/IndustryPicker.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let values = [], index = 0, effects = [], priorDeps = [], focusCalls = 0, scrollCalls = [], reducedMotion = false;
const element = { focus: () => focusCalls++, scrollIntoView: (value) => scrollCalls.push(value) };
const hooks = {
  useRef: () => ({ current: element }),
  useState: (initial) => { const i = index++; if (!(i in values)) values[i] = initial; return [values[i], (v) => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
  useEffect: (fn, deps) => { const i = index++; if (!priorDeps[i] || deps.some((v, j) => v !== priorDeps[i][j])) effects.push(fn); priorDeps[i] = deps; },
};
const compiledModule = { exports: {} };
runInNewContext(code, { module: compiledModule, exports: compiledModule.exports, require: (name) => name === 'react' ? hooks : name === './industry-options' ? industries : require(name), window: { matchMedia: () => ({ matches: reducedMotion }) } });
const Picker = compiledModule.exports.default;
let props = { legend: '自分の業種', note: '6個まで', selected: [], activeGroup: 'IT・システム', allowCustom: true, onGroupChange: (v) => { props.activeGroup = v; }, onToggle: (v) => { props.selected = props.selected.includes(v) ? props.selected.filter(x => x !== v) : [...props.selected, v]; } };
function render() { index = 0; effects = []; const result = Picker(props); for (const effect of effects) effect(); return result; }
function walk(node) { if (!node || typeof node !== 'object') return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(walk)]; }
const text = (node) => !node ? '' : typeof node !== 'object' ? String(node) : [node.props?.children].flat(Infinity).map(text).join('');
function button(tree, label, role) { return walk(tree).find(n => n.type === 'button' && text(n).startsWith(label) && (!role || n.props.role === role)); }
let tree = render(); assert.equal(scrollCalls.length, 0);
button(tree, '小売・EC', 'tab').props.onClick(); tree = render(); assert.equal(props.activeGroup, '小売・EC'); assert.equal(scrollCalls.length, 1); assert.equal(focusCalls, 1); assert.equal(scrollCalls[0].behavior, 'smooth');
button(tree, '花屋').props.onClick(); tree = render(); assert.deepEqual(props.selected, ['花屋']); assert.equal(scrollCalls.length, 1);
reducedMotion = true; button(tree, '小売・EC', 'tab').props.onClick(); tree = render(); assert.equal(scrollCalls.length, 2); assert.equal(scrollCalls[1].behavior, 'auto');
button(tree, 'その他', 'tab').props.onClick(); tree = render();
function fill(value) { walk(tree).find(n => n.type === 'input').props.onChange({ target: { value } }); tree = render(); }
button(tree, 'この業種を追加').props.onClick(); tree = render(); assert.match(text(tree), /業種名を入力/);
fill('  楽器の修理  '); button(tree, 'この業種を追加').props.onClick(); tree = render(); assert.deepEqual(props.selected, ['花屋', '楽器の修理']); assert.equal(walk(tree).find(n => n.type === 'input').props.value, '');
fill('楽器の修理'); button(tree, 'この業種を追加').props.onClick(); tree = render(); assert.match(text(tree), /選択済み/); assert.equal(props.selected.length, 2);
props.selected = ['花屋', '楽器の修理', '和食', 'イタリアン', '寿司', '中華料理']; fill('別の仕事'); button(tree, 'この業種を追加').props.onClick(); tree = render(); assert.match(text(tree), /6個まで/); assert.equal(props.selected.length, 6);
props.selected = ['花屋']; fill('楽器の修理'); let prevented = false; walk(tree).find(n => n.type === 'input').props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault: () => { prevented = true; } }); assert.equal(prevented, false); assert.deepEqual(props.selected, ['花屋']);
walk(tree).find(n => n.type === 'input').props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault: () => { prevented = true; } }); tree = render(); assert.equal(prevented, true); assert.deepEqual(props.selected, ['花屋', '楽器の修理']);
button(tree, '飲食・食品', 'tab').props.onClick(); tree = render(); assert.match(renderToStaticMarkup(tree), /飲食店のジャンル/); assert.ok(button(tree, 'イタリアン')); assert.ok(button(tree, '飲食店'));
props.activeGroup = 'その他'; props.allowCustom = false; tree = render(); assert.equal(walk(tree).filter(n => n.type === 'input').length, 0);
console.log('PASS 実業種コンポーネント: 大分類クリック・再クリック・動きを抑える設定・自由記入・重複・上限・IME・料理ジャンル');
