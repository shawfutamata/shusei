import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const source = readFileSync(new URL('../app/BoardClient.tsx', import.meta.url), 'utf8');
const banners = source.match(/const topBanners = \[([\s\S]*?)\] as const;/)?.[1];
assert.ok(banners);
assert.match(banners, /top-ad\.webp/);
for (const name of ['cleaning', 'moving', 'catering']) {
  assert.ok(!source.includes(`/banners/sample-${name}.webp`), `${name} sample must not be rendered`);
  assert.ok(existsSync(new URL(`../public/banners/sample-${name}.webp`, import.meta.url)), 'Original asset retained for recovery');
}
assert.match(source, /\.\.\.ordered\.map\(\(ad\) => \(\{ src: ad\.imageUrl/);
assert.match(source, /\.\.\.topBanners\.map/);
console.log('PASS: three samples removed; ad guidance and actual advertisements preserved; original assets retained');
