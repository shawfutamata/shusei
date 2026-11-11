import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// ホームから省いた条件は、詳細ボタンの遷移先でも確認できるように残す。
const board = await readFile(new URL('../app/BoardClient.tsx', import.meta.url), 'utf8');
const detailModal = board.slice(board.indexOf("{modal === 'perks' &&"), board.indexOf("{modal === 'adDetail' &&"));
assert.match(detailModal, /招待リンク・コードから会員登録した方が対象/);
assert.match(detailModal, /広告の割引は重複せず/);
assert.match(detailModal, /adsFree &&.*campaignUntilLabel\(\).*無料期間終了後/s);
assert.doesNotMatch(board, /招待コードをお持ちの方はこちら/);
assert.match(board, /このコードは招待リンクに含まれています/);

// ブラウザを起動しない回帰テスト。表示内容としきい値を本物の定義で確かめる。
const result = await build({
  stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import assert from 'node:assert/strict';
    import ReferralBenefits from './app/ReferralBenefits';
    import { freeCampaign } from './app/campaign';
    const render = (level, invitedCount, compact = false) => renderToStaticMarkup(
      <ReferralBenefits level={level} invitedCount={invitedCount} compact={compact} onInvite={() => {}} onDetails={() => {}} />
    );
    const plain = html => html.replace(/<[^>]*>/g, '');
    assert.match(plain(render(1, 0, true)), /あと10人の登録で GOLD/);
    assert.match(plain(render(1, 9)), /あと1人の登録で GOLD/);
    assert.match(plain(render(2, 10)), /あと20人の登録で PLATINUM/);
    assert.match(plain(render(3, 30)), /あと20人の登録で DIAMOND/);
    assert.match(plain(render(4, 0)), /現在 DIAMOND・最高ランクです/);
    assert.doesNotMatch(render(4, 50), /undefined|NaN/);
    assert.match(render(1, 0), /累計.*10.*人の登録/);
    assert.match(render(1, 0), /リンクを送るだけでは人数に含まれません/);
    assert.match(render(1, 0), /リファラル/);
    assert.doesNotMatch(render(1, 0), /1ヶ月.*無料/);
    // ホームは青いバナー＋短い要約。画像に書かれた固定ランクや長文を戻さない。
    assert.doesNotMatch(render(1, 0, true), /referral-benefits-v1.png|bannerConditions/);
    assert.match(plain(render(1, 0, true)), /仲間を招待して、TASUKIをもっと便利に/);
    assert.match(render(1, 0, true), /aria-label="現在のランク SILVER"/);
    assert.match(plain(render(1, 0, true)), /GOLDで使える特典/);
    assert.doesNotMatch(plain(render(1, 0, true)), /最高ランク達成|予算での絞り込み|広告30% OFF|現在の特典/);
    assert.match(render(2, 10, true), /aria-label="現在のランク GOLD"/);
    assert.match(render(2, 10, true), /aria-label="現在の特典"/);
    assert.match(plain(render(2, 10, true)), /募集の延長.*掲載文章の上限なし/);
    assert.doesNotMatch(plain(render(2, 10, true)), /最高ランク達成|広告10% OFF|広告30% OFF/);
    assert.match(render(3, 30, true), /aria-label="現在のランク PLATINUM"/);
    assert.match(plain(render(3, 30, true)), /予算での絞り込み.*広告10% OFF/);
    assert.doesNotMatch(plain(render(3, 30, true)), /最高ランク達成|広告30% OFF/);
    assert.match(render(4, 0, true), /aria-label="現在のランク DIAMOND"/);
    assert.match(plain(render(4, 0, true)), /DIAMOND.*最高ランク達成/);
    assert.match(plain(render(4, 50, true)), /予算での絞り込み.*広告30% OFF/);
    assert.doesNotMatch(plain(render(4, 0, true)), /あと.*人|広告10% OFF/);
    for (const level of [0, -1, 5, NaN, undefined]) {
      assert.match(plain(render(level, 0, true)), /ランク情報を確認できません/);
      assert.doesNotMatch(plain(render(level, 0, true)), /最高ランク達成|現在のランク|現在の特典|広告30% OFF/);
      assert.doesNotMatch(plain(render(level, 0, true)), /undefined|NaN/);
    }
    for (const count of [-1, NaN, undefined]) {
      assert.match(plain(render(1, count, true)), /招待人数を確認できません/);
      assert.doesNotMatch(plain(render(1, count, true)), /あと10人|undefined|NaN/);
    }
    assert.match(plain(render(1, 0, true)), /招待リンクを共有.*特典と条件を見る/);
    const noInvite = renderToStaticMarkup(<ReferralBenefits compact level={1} invitedCount={0} onDetails={() => {}} />);
    assert.doesNotMatch(noInvite, /招待リンクを共有/);
    assert.match(noInvite, /特典と条件を見る/);
    freeCampaign.until = '2099-12-31';
    assert.match(plain(render(3, 30, true)), /広告10% OFF無料期間終了後/);
    assert.match(plain(render(4, 50, true)), /広告30% OFF無料期間終了後/);
    assert.match(plain(render(1, 0, true)), /広告掲載は2099年12月31日まで無料/);
    assert.match(render(1, 0), /広告無料期間の終了後/);
    assert.match(render(1, 0), /ランクにかかわらず広告掲載料が無料/);
    freeCampaign.until = '';
    assert.doesNotMatch(plain(render(1, 0, true)), /広告掲載は.*無料/);
    assert.doesNotMatch(plain(render(4, 50, true)), /無料期間終了後|広告掲載は.*無料/);
    assert.match(plain(render(4, 50, true)), /広告30% OFF/);
    assert.doesNotMatch(render(1, 0), /広告無料期間の終了後|広告掲載料が無料/);
    assert.match(render(1, 0), /広告が30%OFF/);
    console.log('招待特典: 青いバナー・全ランクの実特典・次のランク・未知の値・最高ランク・対象条件・広告無料期間の表示切替 OK');
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
  plugins: [{ name: 'css-module-test', setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default new Proxy({}, { get: (_, key) => key });', loader: 'js' }));
  } }],
});
new Function('require', result.outputFiles[0].text)(createRequire(import.meta.url));
