#!/usr/bin/env node
/**
 * 外部APIを呼ばない自己テスト。分析・薬機法チェック・Wix変換が壊れていないかを見る。
 *   node blog-automation/src/selftest.mjs
 */

import assert from 'node:assert/strict';
import { loadConfig } from './config.mjs';
import { analyze } from './analyze.mjs';
import { checkYakkiho, formatFindings } from './yakkiho.mjs';
import { markdownToRicos } from './wix.mjs';
import { parseGscCsv } from './gsc.mjs';
import { buildReport } from './report.mjs';

const config = loadConfig();
const row = (q, clicks, impressions, position) => ({ keys: [q], clicks, impressions, ctr: clicks / impressions, position });

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  NG  ${name}\n      ${error.message}`);
  }
};

console.log('薬機法チェック');
check('認証範囲外の効能を止める', () => {
  const r = checkYakkiho('マスターV4で坐骨神経痛が改善します。');
  assert.equal(r.ok, false);
});
check('医薬関係者の推薦を止める', () => {
  assert.equal(checkYakkiho('多くの医師が推奨しています。').ok, false);
});
check('効果の保証を止める', () => {
  assert.equal(checkYakkiho('誰でも必ず楽になります。').ok, false);
});
check('体験談を借りた効能表現を止める', () => {
  assert.equal(checkYakkiho('利用者は「長年の腰の痛みが治りました」と話します。').ok, false);
});
check('承認済みの効能はそのまま通す', () => {
  const r = checkYakkiho('血行を良くする、筋肉のこりをほぐす機器です。', ['血行を良くする', '筋肉のこりをほぐす']);
  assert.equal(r.ok, true, formatFindings(r));
});
check('通常の説明文は通す', () => {
  const r = checkYakkiho('マスターV4は背中の形状を測定し、一人ひとりに合わせた動きを行う管理医療機器です。体験会は無料です。');
  assert.equal(r.ok, true, formatFindings(r));
});

console.log('週次判断');
const previous = [row('マスターv4', 40, 900, 1.1), row('セラゼム 体験会', 5, 300, 8.4), row('脊椎ケア 機器', 2, 210, 11.0)];

check('1位を維持できていれば expand を選ぶ', () => {
  const current = [row('マスターv4', 50, 1000, 1.05), row('セラゼム 体験会', 8, 400, 6.2)];
  const a = analyze({ current, previous, pages: [], target: config.target });
  assert.equal(a.defending, false);
  assert.equal(a.decision.mode, 'expand');
});

check('順位が落ちていれば defend を選ぶ', () => {
  const current = [row('マスターv4', 20, 1000, 5.2), row('セラゼム 体験会', 8, 400, 6.2)];
  const a = analyze({ current, previous, pages: [], target: config.target });
  assert.equal(a.defending, true);
  assert.equal(a.decision.mode, 'defend');
  assert.equal(a.lost.length >= 1, true);
});

check('表示が無ければ establish を選ぶ', () => {
  const a = analyze({ current: [row('セラゼム 体験会', 8, 400, 6.2)], previous: [], pages: [], target: config.target });
  assert.equal(a.decision.mode, 'establish');
});

check('表記ゆれを同じキーワードとして数える', () => {
  const a = analyze({ current: [row('マスターＶ４', 10, 500, 1.2)], previous: [], pages: [], target: config.target });
  assert.notEqual(a.primary, null);
});

check('順位が良いのにCTRが低いクエリを拾う', () => {
  const a = analyze({ current: [row('マスターv4 口コミ', 1, 800, 2.0)], previous: [], pages: [], target: config.target });
  assert.equal(a.ctrProblems.length, 1);
});

console.log('入出力');
check('GSCのCSVを読める', () => {
  const rows = parseGscCsv('クエリ,クリック数,表示回数,CTR,掲載順位\nマスターv4,50,1000,5%,1.05\n"セラゼム, 体験会",8,400,2%,6.2\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].position, 1.05);
});

check('MarkdownをWixのリッチコンテンツへ変換できる', () => {
  const r = markdownToRicos('## 見出し\n\n本文**強調**と[リンク](https://example.com)\n\n1. 一\n2. 二\n');
  const types = r.nodes.map((n) => n.type);
  assert.deepEqual(types, ['HEADING', 'PARAGRAPH', 'ORDERED_LIST']);
  assert.equal(r.nodes[2].nodes.length, 2);
});

check('レポートを組み立てられる', () => {
  const a = analyze({ current: [row('マスターv4', 50, 1000, 1.05)], previous, pages: [], target: config.target });
  const text = buildReport({
    config,
    analysis: a,
    outline: { title: 'テスト' },
    publish: '未公開',
    compliance: { ok: true, blocks: [], warns: [], detail: '' },
    period: { currentStart: '2026-08-01', currentEnd: '2026-08-25' },
  });
  assert.match(text, /週次SEOレポート/);
  assert.match(text, /マスターv4/);
});

console.log(failures ? `\n${failures}件失敗しました` : '\nすべて通りました');
process.exit(failures ? 1 : 0);
