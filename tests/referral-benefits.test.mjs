import { build } from 'esbuild';
import { createRequire } from 'node:module';

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
    assert.match(render(1, 0, true), /referral-benefits-v1.png/);
    assert.match(plain(render(1, 0, true)), /累計30人で予算の絞り込み・広告10%OFF、累計50人で広告30%OFF/);
    assert.match(plain(render(1, 0, true)), /招待リンク・コードからの会員登録が対象/);
    freeCampaign.until = '2099-12-31';
    assert.match(plain(render(1, 0, true)), /広告割引は無料期間終了後に適用/);
    assert.match(render(1, 0), /広告無料期間の終了後/);
    assert.match(render(1, 0), /ランクにかかわらず広告掲載料が無料/);
    freeCampaign.until = '';
    assert.doesNotMatch(plain(render(1, 0, true)), /全員の広告掲載料が無料/);
    assert.doesNotMatch(render(1, 0), /広告無料期間の終了後|広告掲載料が無料/);
    assert.match(render(1, 0), /広告が30%OFF/);
    console.log('招待特典: ランク境界・最高ランク・対象条件・無料月非表示・広告無料期間の表示切替 OK');
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
  plugins: [{ name: 'css-module-test', setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default new Proxy({}, { get: (_, key) => key });', loader: 'js' }));
  } }],
});
new Function('require', result.outputFiles[0].text)(createRequire(import.meta.url));
