// ホームに置く、毎日ガチャの横長バナー（1200×400）を書き出す。
//   npm i --no-save sharp は不要。Chromium で描いて WebP に変換する。
//   node scripts/build-gacha-banner.mjs
//
// **絵ではなくコードで持っている。** 文言や賞の中身を変えるたびに画像を
// 描き直すのは続かないし、盤のコマ数（A賞1・B賞4・はずれ7）が本体と
// ずれると、バナーが嘘をつくことになる。ここは app/gacha.ts と同じ数で
// 描いてあるので、確率を変えたらこの SEGMENTS も直すこと。
//
// 出力先は public/gacha/daily.webp。差し替えたい絵が別にあるなら、
// そのファイルを直接置き換えてもよい（このスクリプトを使わなくても動く）。
import { chromium } from 'playwright-core';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSER = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const OUT = 'public/gacha/daily.webp';
const work = tmpdir();
// 盤はアプリと同じ並び（A賞1・B賞4・はずれ7）。見た目と本当の確率をそろえる。
const SEGMENTS = ['d0','d1','d0','d3','d0','d1','d0','d1','d0','d0','d1','d0'];
const PRIZE = { d3: { short: 'A賞', cls: 'top' }, d1: { short: 'B賞', cls: 'win' }, d0: { short: 'はずれ', cls: 'miss' } };
const R = 100;
function slice(i, n) {
  const span = (Math.PI * 2) / n, a0 = i * span, a1 = (i + 1) * span;
  const p = (a) => `${(R * Math.sin(a)).toFixed(2)} ${(-R * Math.cos(a)).toFixed(2)}`;
  return `M0 0L${p(a0)}A${R} ${R} 0 0 1 ${p(a1)}Z`;
}
const wheel = SEGMENTS.map((key, i) => {
  const prize = PRIZE[key], span = 360 / SEGMENTS.length, mid = (i + 0.5) * span;
  const flip = mid > 90 && mid < 270;
  const letters = [...prize.short];
  const tspans = letters.map((ch, n) => `<tspan x="0" y="${(n - (letters.length - 1) / 2) * 16}">${ch}</tspan>`).join('');
  return `<g class="${prize.cls}"><path d="${slice(i, SEGMENTS.length)}"/>`
    + `<text transform="rotate(${mid}) translate(0 -72) rotate(${flip ? 180 : 0})">${tspans}</text></g>`;
}).join('');

const confetti = [
  [120, 40, 14, '#ffd34d', 18], [300, 300, 12, '#ffffff', -12], [520, 60, 13, '#ff9c3d', 30],
  [700, 330, 12, '#ffd34d', -25], [200, 350, 11, '#ffffff', 40], [880, 40, 13, '#ffd34d', 15],
  [1140, 300, 12, '#ff9c3d', -20], [60, 230, 11, '#ffffff', 25], [430, 20, 12, '#ffd34d', -35],
  [980, 360, 11, '#ffffff', 10], [1170, 90, 12, '#ffd34d', -15], [640, 15, 10, '#ffffff', 20],
].map(([x, y, s, c, r]) => `<i style="left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${c};transform:rotate(${r}deg)"></i>`).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:400px; overflow:hidden;
    font-family:"IPAPGothic","IPAGothic",sans-serif; }
  .banner { position:relative; width:1200px; height:400px; overflow:hidden;
    background:linear-gradient(115deg,#0a4fbd 0%,#1478d6 52%,#1b8fe0 100%); }
  /* 後光。中心は盤のあたりに置く。 */
  .rays { position:absolute; left:76%; top:50%; width:1700px; height:1700px;
    transform:translate(-50%,-50%); opacity:.5;
    background:repeating-conic-gradient(from 0deg, rgba(255,255,255,.16) 0deg 7deg, rgba(255,255,255,0) 7deg 14deg); }
  .glow { position:absolute; left:76%; top:50%; width:900px; height:900px; transform:translate(-50%,-50%);
    background:radial-gradient(circle, rgba(255,255,255,.28), rgba(255,255,255,0) 62%); }
  .dots i { position:absolute; border-radius:2px; opacity:.9; }
  .copy { position:absolute; left:44px; top:30px; width:770px; }
  /* 見出しは白抜き＋濃い縁。青の上に白だけだと沈む。 */
  .ribbon { display:inline-flex; align-items:center; gap:14px; height:52px; padding:0 26px 0 20px;
    background:linear-gradient(180deg,#ffd34d,#f3ad14); color:#3a2500;
    clip-path:polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%);
    font-size:29px; font-weight:900; letter-spacing:.02em; }
  .ribbon b { padding:3px 12px; border-radius:6px; background:#12305e; color:#fff; font-size:27px; }
  h1 { margin:14px 0 0; color:#fff; font-size:60px; font-weight:900; letter-spacing:-.01em; line-height:1.1;
    -webkit-text-stroke:9px #102f66; paint-order:stroke fill;
    text-shadow:0 6px 0 rgba(6,24,58,.45); }
  .hit { display:flex; align-items:flex-end; gap:14px; margin-top:6px; }
  /* 金色の文字は**2枚重ね**にする。1枚に -webkit-text-stroke と
     background-clip:text を同時にかけると、縁が文字を塗りつぶしてしまう。 */
  .days { position:relative; display:inline-block; font-size:112px; font-weight:900;
    line-height:1; letter-spacing:-.02em;
    filter:drop-shadow(0 7px 0 rgba(6,24,58,.5)); }
  .days i, .days b { font-style:normal; font-weight:900; }
  .days i { position:absolute; left:0; top:0; color:#102f66;
    -webkit-text-stroke:11px #102f66; }
  .days b { position:relative;
    background:linear-gradient(180deg,#fff6cf 6%,#ffd34d 40%,#f0a91a 62%,#ffe89a 100%);
    -webkit-background-clip:text; background-clip:text; color:transparent; }
  .win { padding-bottom:14px; color:#fff; font-size:52px; font-weight:900;
    -webkit-text-stroke:8px #102f66; paint-order:stroke fill; text-shadow:0 5px 0 rgba(6,24,58,.45); }
  .prizes { margin-top:16px; display:inline-block; padding:11px 30px 11px 24px;
    background:linear-gradient(180deg,#123a76,#0d2b58); color:#fff;
    clip-path:polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%);
    font-size:30px; font-weight:900; letter-spacing:.01em; }
  .prizes em { color:#ffd34d; font-style:normal; }
  /* 盤。アプリと同じ形・同じコマ数（A賞1・B賞4・はずれ7）。 */
  .wheel { position:absolute; right:38px; top:50%; width:318px; height:318px; transform:translateY(-50%); }
  .wheel svg { width:100%; height:100%; display:block;
    filter:drop-shadow(0 10px 22px rgba(4,16,38,.42)); }
  .rim { fill:none; stroke:#0f5fc4; stroke-width:13; }
  .rim-out { fill:none; stroke:#fff; stroke-width:7; }
  .wheel path { stroke:#fff; stroke-width:1.6; }
  .wheel text { font-size:15px; font-weight:900; text-anchor:middle; dominant-baseline:central; }
  .miss path { fill:#f4f7fc; } .miss text { fill:#5a6b84; }
  .win2 path { fill:#1265c8; } .win2 text { fill:#fff; }
  .top path { fill:#f0b429; } .top text { fill:#3f2b00; }
  /* 針は**白い面の上に白**では消える。濃い縁を後ろに1枚敷いて浮かせる。 */
  .pin { position:absolute; left:50%; top:2px; z-index:2; width:38px; height:46px;
    transform:translateX(-50%); background:#0d2b58; clip-path:polygon(50% 100%, 0 0, 100% 0);
    filter:drop-shadow(0 3px 5px rgba(4,16,38,.45)); }
  .pin::after { content:''; position:absolute; left:50%; top:4px; width:28px; height:34px;
    transform:translateX(-50%); background:#fff; clip-path:polygon(50% 100%, 0 0, 100% 0); }
  .go { position:absolute; left:50%; top:50%; width:118px; height:118px; transform:translate(-50%,-50%);
    border:6px solid #fff; border-radius:50%; display:grid; place-items:center;
    background:linear-gradient(160deg,#ff9a52,#f0731f 52%,#dd5a09); color:#fff;
    font-size:22px; font-weight:900; letter-spacing:.06em; box-shadow:0 8px 18px rgba(4,16,38,.4); }
</style>
<div class="banner">
  <span class="rays"></span><span class="glow"></span>
  <span class="dots">${confetti}</span>
  <div class="copy">
    <span class="ribbon">毎日1回 <b>無料</b></span>
    <h1>ルーレットで広告が無料に</h1>
    <div class="hit"><span class="days"><i>3日分</i><b>3日分</b></span><span class="win">が当たる</span></div>
    <div class="prizes"><em>A賞</em> バナー広告3日分 ／ <em>B賞</em> 1日分</div>
  </div>
  <div class="wheel">
    <span class="pin"></span>
    <svg viewBox="-118 -118 236 236">${wheel.replace(/class="win"/g, 'class="win2"')}<circle class="rim" r="104"/><circle class="rim-out" r="112"/></svg>
    <span class="go">START</span>
  </div>
</div>`;
const page0 = join(work, 'gacha-banner.html');
writeFileSync(page0, html);
const browser = await chromium.launch({ executablePath: BROWSER });
const page = await browser.newPage({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 2 });
await page.goto(`file://${page0}`, { waitUntil: 'networkidle' });
const shot = join(work, 'gacha-banner.png');
await page.screenshot({ path: shot });
await browser.close();

// 2倍で描いて1200×400に縮める（縁がなめらかになる）。WebPへの変換は Pillow。
const { execFileSync } = await import('node:child_process');
const convert = [
  'from PIL import Image',
  `im = Image.open(${JSON.stringify(shot)}).convert('RGB').resize((1200, 400), Image.LANCZOS)`,
  `im.save(${JSON.stringify(OUT)}, 'WEBP', quality=86, method=6)`,
].join('\n');
execFileSync('python3', ['-c', convert]);
unlinkSync(shot);
unlinkSync(page0);
console.log(`${OUT} を書き出しました（1200×400）`);
