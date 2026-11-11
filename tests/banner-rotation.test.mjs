import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AD_ROTATE_MS, adPlacements } from '../app/ad-options.ts';

assert.equal(AD_ROTATE_MS, 5000);
assert.match(adPlacements.find((item) => item.key === 'banner').detail, /5秒ずつ/);
const source = readFileSync(new URL('../app/BoardClient.tsx', import.meta.url), 'utf8');
const hook = source.match(/useEffect\(\(\) => \{\n    if \(activeTab !== 'home' \|\| slides.length < 2 \|\| carouselPaused \|\| bannerSwipe.interacting\) return;([\s\S]*?)\n  \}, \[activeTab, slides.length, carouselPaused, bannerSwipe.interacting\]\);/);
assert.ok(hook, 'ホーム表示中だけ動かし、手動切替後は停止する条件を維持する');
const effect = new Function('activeTab', 'slides', 'carouselPaused', 'window', 'setCarouselIndex', 'AD_ROTATE_MS', 'bannerSwipe', `if (activeTab !== 'home' || slides.length < 2 || carouselPaused || bannerSwipe.interacting) return; ${hook[1]}`);
let index = 0;
let callback;
let interval;
let cleared = false;
const clock = { setInterval(fn, ms) { callback = fn; interval = ms; return 42; }, clearInterval(id) { assert.equal(id, 42); cleared = true; } };
const setIndex = (update) => { index = update(index); };
const cleanup = effect('home', [1, 2, 3], false, clock, setIndex, AD_ROTATE_MS, { interacting: false });
assert.equal(interval, 5000);
callback(); assert.equal(index, 1);
callback(); assert.equal(index, 2);
callback(); assert.equal(index, 0);
cleanup(); assert.equal(cleared, true);
for (const [tab, slides, paused] of [['work', [1, 2], false], ['home', [1], false], ['home', [], false], ['home', [1, 2], true]]) {
  interval = undefined;
  assert.equal(effect(tab, slides, paused, clock, setIndex, AD_ROTATE_MS, { interacting: false }), undefined);
  assert.equal(interval, undefined);
}
assert.equal(effect('home', [1, 2], false, clock, setIndex, AD_ROTATE_MS, { interacting: true }), undefined);
assert.match(source, /onClick=\{\(\) => \{ setCarouselPaused\(true\); setCarouselIndex\(index\); \}\}/);
assert.match(source, /aria-label="バナーを切り替える"/);
const mobile = readFileSync(new URL('../mobile/src/app/(tabs)/index.tsx', import.meta.url), 'utf8');
assert.match(mobile, /\}, 5000\);\n    return \(\) => clearInterval\(timer\);/);
console.log('PASS: バナー5秒設定・説明文・周回・ホーム以外/1枚以下/手動切替時の停止・cleanup・モバイル設定');
