import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
const bannerCss = await readFile(new URL('../app/ReferralBenefits.module.css', import.meta.url), 'utf8');
const board = await readFile(new URL('../app/BoardClient.tsx', import.meta.url), 'utf8');

// 長いランク名でも人数ラベルを押し出さず、人数と単位を一緒に読める配置を保つ。
assert.match(css, /\.invite-stats\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /\.invite-stats>div:last-child\s*\{[^}]*grid-column:1\s*\/\s*-1/);
assert.match(css, /\.invite-stats dt\s*\{[^}]*white-space:nowrap/);
assert.match(css, /\.invite-stats dd\s*\{[^}]*white-space:nowrap/);
assert.match(board, /<dt>招待した人<\/dt><dd>\{referral\.invitedCount\}<small>人<\/small>/);
assert.match(board, /<dt>利用中<\/dt><dd>\{referral\.activeCount\}<small>人<\/small>/);
assert.match(board, /<dt>いまのランク<\/dt><dd>\{stats\.rank\}/);

// ホームの上下のバナーを同じ余白に揃える。画像を画面端まで広げない。
assert.match(css, /\.hero-carousel\s*\{[^}]*margin:0 14px/);
assert.match(bannerCss, /\.bannerPanel\s*\{[^}]*margin:\s*18px 14px/);
console.log('PASS: 招待人数2列＋ランク1行、ラベル/人数単位の改行防止、実データ表示、バナー左右14px');
