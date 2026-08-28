// public/mark.svg から、アイコンのPNGを書き出す。
// ロゴを描き直したらこれを実行して差し替える。
//   node scripts/build-icons.mjs
import { chromium } from 'playwright-core';
import { readFileSync, copyFileSync } from 'node:fs';

const svg = readFileSync('public/mark.svg', 'utf8');
const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

// PWAのmaskableは外周が切られるので、中央8割に収める。透過が要る所は背景なし。
const targets = [
  { path: 'public/icon-192.png', size: 192, pad: 0.2, background: '#ffffff' },
  { path: 'public/icon-512.png', size: 512, pad: 0.2, background: '#ffffff' },
  { path: 'public/apple-touch-icon.png', size: 180, pad: 0.14, background: '#ffffff' },
  { path: 'mobile/assets/mark.png', size: 512, pad: 0, background: null },
];

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-sandbox'] });
for (const { path, size, pad, background } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size * (1 - pad));
  await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background ?? 'transparent'}">
    <div style="width:${inner}px;height:${inner}px">${svg}</div>
  </body>`);
  await page.screenshot({ path, omitBackground: !background });
  await page.close();
  console.log(`${path} ${size}x${size}`);
}
await browser.close();

copyFileSync('public/mark.svg', 'public/favicon.svg');
console.log('public/favicon.svg');
