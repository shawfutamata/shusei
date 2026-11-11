import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/BoardClient.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const detail = source.slice(source.indexOf("{modal === 'adDetail'"), source.indexOf("{modal === 'ads'"));
assert.ok(detail.length > 0, '広告詳細が存在する');
assert.doesNotMatch(detail, /<AdBanner\b/, '画像に文字を重ねるバナーを広告詳細で再利用しない');
assert.match(detail, /adDetail.imageUrl && <img className="ad-detail-image"/, '画像がない広告にも対応する');
assert.match(detail, /<h3>\{adDetail.title \|\| 'こんな人を探しています'\}<\/h3>/);
assert.equal((detail.match(/className="ad-detail-body"/g) || []).length, 1, '説明は本文へ一度だけ表示する');
assert.match(css, /\.ad-detail-image\s*\{[^}]*width:100%;[^}]*height:auto;/, '画像の縦横比を保ち全体を見せる');
assert.match(css, /\.ad-detail-heading\s*\{[^}]*display:grid;[^}]*gap:12px;/, 'PR・画像・見出しの間に余白を確保する');
assert.match(css, /\.ad-detail-heading h3\s*\{[^}]*overflow-wrap:anywhere;/, '長い連続文字も画面幅に収める');
console.log('PASS: 広告詳細の画像・見出し・説明の分離、画像なし、長い見出し、画像全体表示');
