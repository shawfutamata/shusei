// capture-states.mjs が出したJSONから、クリックで画面を切り替えられる1枚のHTMLを作る。
//   npm run dev                                    # 別ターミナル
//   node scripts/capture-states.mjs preview-states.json
//   node scripts/build-preview.mjs preview-states.json preview.html
//
// 画面のHTMLとCSSは本物のアプリから取り出したものをそのまま使う。
// クリックの対応付けだけをこちらで書いていて、送信や保存は動かない。
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const data = JSON.parse(readFileSync(SRC, 'utf8'));
const states = data.states;

const text = (html, selector) => {
  const match = html.match(new RegExp(`<${selector}[^>]*>([\\s\\S]*?)</${selector}>`));
  return match ? match[1].replace(/<[^>]+>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim() : '';
};

// 詳細・紹介フォームは投稿タイトルで引けるようにする
const detailTitles = {};
const introTitles = {};
const clean = (value) => value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim();
for (const key of Object.keys(states)) {
  const match = key.match(/^(detail|intro):(\d+)$/);
  if (!match) continue;
  if (match[1] === 'detail') {
    const section = states[key].slice(states[key].indexOf('need-detail'));
    detailTitles[text(section, 'h3')] = key;
  } else {
    // 紹介フォームの見出しは「〈探しごとのタイトル〉への紹介です。」
    const lead = states[key].match(/class="modal-lead"[^>]*>([\s\S]*?)<\/p>/);
    const title = lead ? clean(lead[1]).replace(/^「/, '').replace(/」への紹介です。$/, '') : '';
    introTitles[title] = key;
  }
}
const industries = Object.keys(states).filter((key) => key.startsWith('industry:')).map((key) => key.slice('industry:'.length));

const screens = [
  { group: 'ログイン前', items: [
    ['login', 'ログイン画面'],
    ['join', '招待リンクを受け取る'],
    ['join:invalid', '招待リンクが無効'],
    ['login:pending', '登録して承認待ち'],
    ['login:notmember', '会員でないアカウント'],
    ['denied', '利用権限が停止中'],
  ] },
  { group: '無料会員として', items: [
    ['home', 'ホーム'],
    ['search', '困りごと一覧'],
    ['status:closed', '募集終了だけ'],
    ['mypage', 'マイページ・プラン・招待'],
    ['modal:post:limit', '今月ぶんの投稿を使い切った'],
  ] },
  { group: '有料会員として', items: [
    ['mypage:pro', 'マイページ（有料）'],
  ] },
  { group: 'モーダル', items: [
    ['modal:post', '探しごとを投稿'],
    ['modal:responses', '届いた紹介'],
    ['modal:cards', '個人名刺帳'],
  ] },
];

const payload = JSON.stringify({ css: data.css, states, detailTitles, introTitles, industries, selectValues: data.selectValues ?? {}, venuesByPrefecture: data.venuesByPrefecture ?? {} })
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const nav = screens.map(({ group, items }) => `
      <section class="rail-group">
        <h2>${group}</h2>
        <ul>${items.map(([key, label]) => `<li><button type="button" data-state="${key}"><span>${label}</span><code>${key}</code></button></li>`).join('')}</ul>
      </section>`).join('');

const html = `<title>GIVE HUB プレビュー</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap">
<style>
  :root {
    --void:#12161d; --panel:#1a1f28; --raised:#222834; --line:#2f3745; --line-soft:#252c37;
    --ink:#e8ecf3; --dim:#8e9aab; --faint:#5f6b7c; --beam:#6f9dff; --beam-dim:#3a5aa8; --warn:#e2b04a;
    --rail:250px;
    --sans:"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;
    --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--void); color:var(--ink); font-family:var(--sans); font-size:14px; line-height:1.7; -webkit-font-smoothing:antialiased; }
  code, .mono { font-family:var(--mono); font-variant-numeric:tabular-nums; }
  :where(button):focus-visible { outline:2px solid var(--beam); outline-offset:2px; }

  .lab { min-height:100vh; display:grid; grid-template-columns:var(--rail) minmax(0,1fr); }

  .rail { min-width:0; padding:26px 20px 40px; display:flex; flex-direction:column; gap:26px; border-right:1px solid var(--line); background:var(--panel); }
  .mark { display:flex; align-items:center; gap:10px; }
  .mark span { width:32px; height:32px; display:grid; place-items:center; border-radius:9px; background:linear-gradient(140deg,#1d4ed8,#38bdf8); color:#fff; font-weight:900; font-size:16px; }
  .mark b { font-size:14px; letter-spacing:.04em; }
  .mark small { display:block; color:var(--faint); font-size:10px; font-weight:500; letter-spacing:.12em; }
  .rail-group h2 { margin:0 0 8px; color:var(--faint); font-size:10px; font-weight:700; letter-spacing:.18em; }
  .rail-group ul { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:2px; }
  .rail-group button { width:100%; padding:7px 10px; display:flex; align-items:baseline; justify-content:space-between; gap:8px; border:0; border-radius:7px; background:transparent; color:var(--dim); font:inherit; font-size:13px; text-align:left; cursor:pointer; }
  .rail-group button span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
  .rail-group code { flex:0 0 auto; }
  .rail-group button:hover { background:var(--raised); color:var(--ink); }
  .rail-group button[aria-current="true"] { background:var(--beam-dim); color:#fff; }
  .rail-group code { color:var(--faint); font-size:9.5px; }
  .rail-group button[aria-current="true"] code { color:#cddafb; }
  .rail-note { margin-top:auto; padding-top:20px; border-top:1px solid var(--line-soft); color:var(--faint); font-size:11px; line-height:1.75; }

  .stage { min-width:0; padding:26px 30px 60px; display:flex; flex-direction:column; align-items:center; gap:18px; }
  .stage-head { width:100%; max-width:880px; display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; }
  .stage-head h1 { margin:0; font-size:17px; font-weight:700; letter-spacing:.01em; }
  .stage-head p { flex:1 1 260px; margin:0; color:var(--dim); font-size:12px; }
  .toolbar { display:flex; align-items:center; gap:8px; }
  .toolbar button { padding:6px 13px; border:1px solid var(--line); border-radius:8px; background:var(--raised); color:var(--ink); font:inherit; font-size:12px; cursor:pointer; }
  .toolbar button:hover { border-color:var(--beam-dim); }
  .toolbar button:disabled { opacity:.4; cursor:not-allowed; }
  .now { padding:5px 10px; border-radius:7px; background:var(--panel); color:var(--beam); font-family:var(--mono); font-size:11px; }

  .device { position:relative; width:458px; padding:16px; border:1px solid var(--line); border-radius:46px; background:linear-gradient(160deg,#252c38,#171c24); box-shadow:0 40px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06); }
  .device iframe { width:430px; height:932px; display:block; border:0; border-radius:32px; background:#e8effa; }

  .flash { position:fixed; left:50%; bottom:26px; transform:translateX(-50%) translateY(14px); max-width:min(92vw,420px); padding:11px 16px; border:1px solid rgba(226,176,74,.4); border-radius:10px; background:#2a2417; color:var(--warn); font-size:12.5px; line-height:1.6; opacity:0; transition:opacity .18s ease, transform .18s ease; pointer-events:none; z-index:9; }
  .flash.on { opacity:1; transform:translateX(-50%) translateY(0); }

  .legend { width:100%; max-width:880px; display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; }
  .legend section { padding:15px 17px; border:1px solid var(--line-soft); border-radius:12px; background:var(--panel); }
  .legend h3 { margin:0 0 7px; font-size:12px; font-weight:700; letter-spacing:.02em; }
  .legend h3::before { content:''; display:inline-block; width:7px; height:7px; margin-right:8px; border-radius:2px; vertical-align:middle; }
  .legend .live h3::before { background:#4ade80; }
  .legend .flat h3::before { background:var(--warn); }
  .legend .next h3::before { background:var(--beam); }
  .legend p, .legend li { margin:0; color:var(--dim); font-size:12px; line-height:1.75; }
  .legend code { overflow-wrap:anywhere; }
  .legend ul { margin:0; padding-left:1.1em; display:flex; flex-direction:column; gap:3px; }

  @media (max-width:900px) {
    .lab { grid-template-columns:minmax(0,1fr); }
    .rail { padding:12px 14px; flex-direction:row; align-items:center; gap:16px; overflow-x:auto; border-right:0; border-bottom:1px solid var(--line); scrollbar-width:thin; }
    .rail > * { flex:0 0 auto; }
    .mark small { display:none; }
    .rail-group h2 { display:none; }
    .rail-group ul { flex-direction:row; gap:6px; }
    .rail-group button { padding:6px 12px; border:1px solid var(--line); background:var(--raised); white-space:nowrap; }
    .rail-group code { display:none; }
    .rail-note { display:none; }
    .stage { padding:20px 14px 50px; }
    .device { width:100%; max-width:462px; padding:10px; border-radius:34px; }
    .device iframe { width:100%; height:min(880px,78vh); border-radius:24px; }
  }
  @media (prefers-reduced-motion:reduce) { .flash { transition:none; } }
</style>

<div class="lab">
  <aside class="rail">
    <div class="mark"><span>G</span><div><b>GIVE HUB</b><small>PREVIEW</small></div></div>
    ${nav}
    <p class="rail-note">画面のHTMLとCSSは、ローカルで動かした本物のGIVE HUBから、そのまま取り出したものです。<br>データは動作確認用の見本です。</p>
  </aside>

  <main class="stage">
    <div class="stage-head">
      <h1>触って確かめるプレビュー</h1>
      <p>下のスマホの中を、そのままスクロールして、ボタンを押してみてください。</p>
      <div class="toolbar">
        <span class="now mono" id="now">home</span>
        <button type="button" id="back" disabled>戻る</button>
        <button type="button" id="reset">最初から</button>
      </div>
    </div>

    <div class="device"><iframe id="screen" title="GIVE HUB の画面"></iframe></div>

    <div class="legend">
      <section class="live">
        <h3>いま押せるところ</h3>
        <ul>
          <li>下のメニュー5つ（ホーム・困りごと・＋・名刺・マイページ）</li>
          <li>トップのバナーと、その下の丸いページ送り</li>
          <li>「業種から探す」の16マス</li>
          <li>一覧の絞り込みタブ（すべて／案件／協業先／相談）</li>
          <li>投稿カード → 詳細 →「この人を紹介できる」</li>
          <li>右上の自分の名前 → マイページ</li>
          <li>マイページの所属会場（都道府県 → 会場、その他は自由入力）</li>
          <li>一覧の「募集状況」と「業種」の絞り込み</li>
          <li>マイページの招待カードと、招待リンクを受け取る画面（左のリスト）</li>
          <li>無料会員と有料会員のマイページ（左のリストで切り替え）</li>
        </ul>
      </section>
      <section class="flat">
        <h3>まだ動かないところ</h3>
        <p>保存・投稿・紹介の送信と、写真の登録です。ここはサーバーにつながって初めて動くところなので、このプレビューでは押すと注意が出ます。見た目と画面の流れの確認に使ってください。</p>
      </section>
      <section class="next">
        <h3>本物を動かすには</h3>
        <p>いまの本番サイトは所有者だけが見られる状態なので、そのままステージングとして使えます。そこへデプロイすれば、Googleログインも含めて実際に動かせます。手順は <code>docs/release-runbook-ja.md</code> のW3〜W5にまとめてあります。</p>
      </section>
    </div>
  </main>
</div>

<div class="flash" id="flash" role="status" aria-live="polite"></div>

<script type="application/json" id="payload">${payload}</script>
<script>
(function () {
  const data = JSON.parse(document.getElementById('payload').textContent);
  const frame = document.getElementById('screen');
  const nowLabel = document.getElementById('now');
  const backButton = document.getElementById('back');
  const flash = document.getElementById('flash');
  const navButtons = Array.from(document.querySelectorAll('.rail-group button'));

  const navTargets = ['home', 'search', 'modal:post:limit', 'modal:cards', 'mypage'];
  const filterKeys = ['all', 'project', 'collaboration', 'consultation'];
  const bannerTargets = ['modal:post', 'modal:responses', 'mypage', 'modal:cards'];
  const isOverlay = (key) => /^(modal:|detail:|intro:)/.test(key);

  let current = '';
  let base = 'home';
  let history = [];
  const scrollMemory = {};
  let flashTimer = 0;

  function notice(message) {
    flash.textContent = message;
    flash.classList.add('on');
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => flash.classList.remove('on'), 3600);
  }

  function saveScroll() {
    const doc = frame.contentDocument;
    if (doc && current) scrollMemory[current] = doc.documentElement.scrollTop || doc.body.scrollTop || 0;
  }

  function render(key) {
    const doc = frame.contentDocument;
    doc.open();
    doc.write('\\u003c!doctype html\\u003e\\u003chtml lang="ja"\\u003e\\u003chead\\u003e\\u003cmeta charset="utf-8"\\u003e\\u003cstyle\\u003e' + data.css + '\\u003c/style\\u003e\\u003c/head\\u003e\\u003cbody\\u003e' + data.states[key] + '\\u003c/body\\u003e\\u003c/html\\u003e');
    doc.close();
    doc.addEventListener('click', route, true);
    doc.addEventListener('submit', (event) => { event.preventDefault(); notice('送信はプレビューでは動きません。本番のサイトでは保存されます。'); });
    restoreSelects(doc, key);
    wireVenuePicker(doc);
    wireBoardFilters(doc);
    // アプリのCSSは html { scroll-behavior:smooth } なので、位置の復元だけは即座に効かせる
    doc.documentElement.style.scrollBehavior = 'auto';
    const top = scrollMemory[key] ?? (isOverlay(key) ? (scrollMemory[base] ?? 0) : 0);
    doc.documentElement.scrollTop = top;
    doc.body.scrollTop = top;
  }

  function go(key, { push = true } = {}) {
    if (!data.states[key]) return notice('この画面はプレビューに入っていません。');
    saveScroll();
    if (push && current) history.push(current);
    if (!isOverlay(key)) base = key;
    current = key;
    render(key);
    nowLabel.textContent = key;
    backButton.disabled = history.length === 0;
    navButtons.forEach((button) => button.setAttribute('aria-current', String(button.dataset.state === key)));
  }

  function goByTitle(kind, title) {
    const map = kind === 'detail' ? data.detailTitles : data.introTitles;
    const key = map[(title || '').trim()];
    return key ? go(key) : notice('この投稿の画面はプレビューに入っていません。');
  }

  function indexIn(node) {
    return Array.prototype.indexOf.call(node.parentNode.children, node);
  }

  function route(event) {
    const target = event.target;
    if (!target.closest) return;
    const at = (selector) => target.closest(selector);

    if (at('.modal-close') || at('.cardbook-header > button')) { event.preventDefault(); return go(base); }
    if (target.classList && target.classList.contains('modal-backdrop')) { event.preventDefault(); return go(base); }

    const heart = at('.card-heart, .home-heart, .detail-heart');
    if (heart) {
      event.preventDefault(); event.stopPropagation();
      heart.classList.toggle('active');
      return notice('お気に入りの保存は本番のサイトで記録されます。');
    }

    const navButton = at('.bottom-nav > button');
    if (navButton) { event.preventDefault(); return go(navTargets[indexIn(navButton)]); }
    if (at('.mobile-brand')) { event.preventDefault(); return go('home'); }
    if (at('.header-profile') || at('.photo-required-banner')) { event.preventDefault(); return go('mypage'); }

    const dot = at('.carousel-dots button');
    if (dot) { event.preventDefault(); return go('home:banner:' + indexIn(dot)); }
    if (at('.hero-image-slide')) {
      event.preventDefault();
      const match = current.match(/^home:banner:(\\d+)$/);
      return go(bannerTargets[match ? Number(match[1]) : 0]);
    }

    const tile = at('.industry-grid > button');
    if (tile) { event.preventDefault(); return go('industry:' + data.industries[indexIn(tile)]); }
    if (at('.clear-industry')) { event.preventDefault(); return go('search:all'); }

    const filterButton = at('.filters button');
    if (filterButton) { event.preventDefault(); return go('search:' + filterKeys[indexIn(filterButton)]); }

    const detailIntro = at('.need-detail .submit-button');
    if (detailIntro) {
      event.preventDefault();
      const heading = at('.need-detail').querySelector('h3');
      return goByTitle('intro', heading && heading.textContent);
    }
    const introButton = at('.intro-button');
    if (introButton) {
      event.preventDefault(); event.stopPropagation();
      const heading = introButton.closest('.need-card').querySelector('h3');
      return goByTitle('intro', heading && heading.textContent);
    }
    const card = at('.need-card');
    if (card) { event.preventDefault(); const heading = card.querySelector('h3'); return goByTitle('detail', heading && heading.textContent); }
    const homeCard = at('.home-request-open');
    if (homeCard) { event.preventDefault(); const heading = homeCard.querySelector('.home-request-copy strong'); return goByTitle('detail', heading && heading.textContent); }

    if (at('.home-section-heading button')) { event.preventDefault(); return go('search'); }
    if (at('.google-button')) { event.preventDefault(); return notice('Googleログインは、実際のサイトに置いてからでないと動きません。'); }

    if (at('.profile-venue-select')) return;
    const boardSelect = at('.member-filters select');
    if (boardSelect) return;
    if (at('button') || at('a') || at('select') || at('input[type="file"]')) {
      event.preventDefault();
      notice('この操作はプレビューでは再現していません。本番のサイトでは動きます。');
    }
  }

  // selectの選択値はReactがDOMプロパティで持つので、保存したHTMLには残らない。撮影時の値を戻す。
  function restoreSelects(doc, key) {
    const values = data.selectValues[key];
    if (!values) return;
    doc.querySelectorAll('select').forEach((select, index) => {
      if (values[index] !== undefined) select.value = values[index];
    });
  }

  // 会場は都道府県で選択肢が入れ替わる。撮影しておいた組み合わせで、ここでも実際に切り替える。
  function wireVenuePicker(doc) {
    const picker = doc.querySelector('.profile-venue-select');
    if (!picker) return;
    const [prefectureSelect, venueSelect] = picker.querySelectorAll('select');
    if (!prefectureSelect || !venueSelect) return;

    const fill = (prefecture) => {
      const options = data.venuesByPrefecture[prefecture] || [{ value: '', label: '会場を選択' }, { value: '__other__', label: 'その他（自由入力）' }];
      venueSelect.innerHTML = '';
      options.forEach(({ value, label }) => {
        const option = doc.createElement('option');
        option.value = value; option.textContent = label;
        venueSelect.appendChild(option);
      });
      venueSelect.disabled = false;
    };

    prefectureSelect.addEventListener('change', () => { fill(prefectureSelect.value); toggleOther(); });
    venueSelect.addEventListener('change', toggleOther);

    function toggleOther() {
      const existing = picker.querySelector('.preview-venue-other');
      if (venueSelect.value !== '__other__') return existing && existing.remove();
      if (existing) return;
      const label = doc.createElement('label');
      label.className = 'wide preview-venue-other';
      label.innerHTML = '会場名 <small>正式な会場名を入力</small>';
      const input = doc.createElement('input');
      input.placeholder = '例：ひるのめぐろ会場';
      input.maxLength = 60;
      label.appendChild(input);
      picker.appendChild(label);
      input.focus();
    }
  }

  // 一覧の絞り込みのうち、撮影してある組み合わせは実際に切り替える。
  function wireBoardFilters(doc) {
    const selects = doc.querySelectorAll('.member-filters select');
    if (!selects.length) return;
    const [status, , , industry] = selects;
    if (status) status.addEventListener('change', () => go(status.value === 'open' ? 'search' : 'status:' + status.value));
    if (industry) industry.addEventListener('change', () => go(industry.value === 'all' ? 'search' : 'industry:' + industry.value));
    selects.forEach((select) => {
      if (select === status || select === industry) return;
      select.addEventListener('change', () => notice('会場・エリア・年商での絞り込みは、本番のサイトで動きます。'));
    });
  }

  navButtons.forEach((button) => button.addEventListener('click', () => go(button.dataset.state)));
  backButton.addEventListener('click', () => {
    const previous = history.pop();
    if (previous) go(previous, { push: false });
    backButton.disabled = history.length === 0;
  });
  document.getElementById('reset').addEventListener('click', () => { history = []; go('home', { push: false }); });

  go('home', { push: false });
})();
</script>
`;

writeFileSync(OUT, html);
console.log(`${OUT} ${(html.length / 1024 / 1024).toFixed(2)}MB / detail:${Object.keys(detailTitles).length} intro:${Object.keys(introTitles).length} industry:${industries.length}`);
