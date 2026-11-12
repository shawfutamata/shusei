import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const welcomeSource = await readFile(new URL('../app/login/Welcome.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(welcomeSource, /年内|2026年12月31日/);
const result = await build({
  stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import assert from 'node:assert/strict';
    import { freeCampaign, campaignRunning, adsFreeNow, campaignUntilLabel } from './app/campaign';
    import { currentPlan, campaignPlan, contractedPlan, bonusPlan, can, limits, isoDate, isoDateInJapan } from './app/entitlements';
    import { effectivePlanState } from './app/effective-plan';
    import { gachaOpen, giftExpiryFrom, adGacha } from './app/gacha';
    import Welcome from './app/login/Welcome';
    import ReferralBenefits from './app/ReferralBenefits';

    assert.equal(freeCampaign.until, '2027-02-28');
    assert.equal(campaignUntilLabel(), '2027年2月28日');
    const stored = { plan: 'free', planPeriodEnd: '' };
    const state = effectivePlanState('campaign-test@example.test', stored);
    assert.deepEqual(stored, { plan: 'free', planPeriodEnd: '' });
    assert.equal(state.campaignPeriodEnd, '2027-02-28');
    for (const [instant, active] of [
      ['2026-12-31T23:59:59.999+09:00', true],
      ['2027-01-01T00:00:00+09:00', true],
      ['2027-02-28T00:00:00+09:00', true],
      ['2027-02-28T23:59:59.999+09:00', true],
      ['2027-03-01T00:00:00+09:00', false],
      ['2027-03-01T08:59:59.999+09:00', false],
      ['2027-03-01T09:00:00+09:00', false],
    ]) {
      const now = new Date(instant);
      assert.equal(campaignRunning(now), active, instant);
      assert.equal(adsFreeNow(now), active, instant);
      assert.equal(campaignPlan(state, now), active ? 'standard' : 'free', instant);
      assert.equal(currentPlan(state, now), active ? 'standard' : 'free', instant);
      assert.equal(can(state, 'self_offer', now), active, instant);
      assert.equal(limits(state, now).newChatsPerMonth, active ? -1 : 3, instant);
      assert.equal(gachaOpen(now), !active, instant);
    }
    const edge = new Date('2027-03-01T00:00:00+09:00');
    assert.equal(isoDate(edge), '2027-02-28');
    assert.equal(isoDateInJapan(edge), '2027-03-01');
    // 契約と招待特典の期限判定は変更しない。キャンペーン終了で契約を消さない。
    const paid = { ...state, plan: 'standard', planPeriodEnd: '2027-02-28' };
    assert.equal(contractedPlan(paid, edge), 'standard');
    assert.equal(currentPlan(paid, edge), 'standard');
    assert.equal(bonusPlan({ ...state, bonusPlan: 'standard', bonusPeriodEnd: '2027-02-28' }, edge), 'standard');
    const expectedGiftEnd = new Date('2027-02-28T00:00:00Z');
    expectedGiftEnd.setUTCDate(expectedGiftEnd.getUTCDate() + adGacha.giftValidDays);
    assert.equal(giftExpiryFrom('2026-12-01'), expectedGiftEnd.toISOString().slice(0, 10));
    assert.equal(giftExpiryFrom('2027-02-28'), expectedGiftEnd.toISOString().slice(0, 10));
    const html = renderToStaticMarkup(<Welcome initialMessage="">test</Welcome>);
    assert.match(html, /2027年2月28日まで/);
    assert.match(html, /期間中は、全機能を完全無料で。/);
    assert.match(html, /期間中無料/);
    assert.doesNotMatch(html, /年内|2026年12月31日/);
    const referralHtml = renderToStaticMarkup(<ReferralBenefits level={1} invitedCount={0} compact onInvite={() => {}} onDetails={() => {}} />);
    assert.match(referralHtml, /2027年2月28日まで無料/);
    freeCampaign.until = '';
    assert.equal(campaignRunning(edge), false);
    assert.equal(adsFreeNow(edge), false);
    assert.equal(campaignUntilLabel(), '');
    console.log('PASS: 無料期間2027/2/28、日本時間の終了境界、機能/広告の一致、ガチャ/無料券、契約維持、LP/紹介表示');
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
  plugins: [{ name: 'isolated-campaign-test', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'cloudflare:workers', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const env = {};', loader: 'js' }));
    build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default new Proxy({}, { get: (_, key) => key });', loader: 'js' }));
    build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }],
});
new Function('require', result.outputFiles[0].text)(createRequire(import.meta.url));
