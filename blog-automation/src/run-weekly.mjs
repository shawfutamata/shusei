#!/usr/bin/env node
/**
 * 週次実行の本体。
 *
 *   node blog-automation/src/run-weekly.mjs                # 生成して公開まで
 *   node blog-automation/src/run-weekly.mjs --dry-run      # 生成のみ。公開しない
 *   node blog-automation/src/run-weekly.mjs --csv=gsc.csv  # GSCのAPIを使わずCSVで分析
 *
 * 公開を止める条件（安全側に倒す）:
 *   - --dry-run が指定されている
 *   - 薬機法チェックで重大な指摘が残っている
 *   - config.json の product.approvedEfficacy が未記入
 * いずれの場合も記事と画像は output/ に残るので、人が見て手で出せる。
 */

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, loadConfig, loadSecrets, missingSecrets } from './config.mjs';
import { getAccessToken, querySearchAnalytics, daysAgo, parseGscCsv } from './gsc.mjs';
import { analyze } from './analyze.mjs';
import { generateOutline, generateArticle, reviseArticle } from './claude.mjs';
import { generateImage } from './images.mjs';
import { checkYakkiho, formatFindings } from './yakkiho.mjs';
import { markdownToRicos, uploadImage, createDraftPost, publishDraftPost } from './wix.mjs';
import { buildReport } from './report.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.some((a) => a === `--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const dryRun = flag('dry-run');
const csvPath = value('csv');
const skipImage = flag('no-image');

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function collectSearchData(config, secrets) {
  const period = {
    currentStart: daysAgo(31),
    currentEnd: daysAgo(3),
    previousStart: daysAgo(59),
    previousEnd: daysAgo(32),
  };

  if (csvPath) {
    log(`CSVから分析します: ${csvPath}`);
    const rows = parseGscCsv(readFileSync(csvPath, 'utf8'));
    // CSVは1期間分しか取れないので、前期比較と ページ×クエリ は空になる
    return { current: rows, previous: [], pages: [], period };
  }

  log('Search Consoleから実績を取得します');
  const accessToken = await getAccessToken(secrets.googleServiceAccount);
  const siteUrl = config.site.gscSiteUrl;

  const [current, previous, pages] = await Promise.all([
    querySearchAnalytics({ accessToken, siteUrl, startDate: period.currentStart, endDate: period.currentEnd, dimensions: ['query'] }),
    querySearchAnalytics({ accessToken, siteUrl, startDate: period.previousStart, endDate: period.previousEnd, dimensions: ['query'] }),
    querySearchAnalytics({ accessToken, siteUrl, startDate: period.currentStart, endDate: period.currentEnd, dimensions: ['page', 'query'] }),
  ]);

  log(`取得: 今期 ${current.length}クエリ / 前期 ${previous.length}クエリ / ページ別 ${pages.length}行`);
  return { current, previous, pages, period };
}

async function main() {
  const config = loadConfig();
  const secrets = loadSecrets();

  const missing = missingSecrets(secrets, {
    needGsc: !csvPath,
    needImage: !skipImage,
    needWix: !dryRun,
  });
  if (missing.length) {
    console.error('必要な設定が足りていません:\n' + missing.map((m) => `  - ${m}`).join('\n'));
    process.exit(1);
  }

  const { current, previous, pages, period } = await collectSearchData(config, secrets);
  const analysis = analyze({ current, previous, pages, target: config.target });
  log(`判定: ${analysis.decision.mode} / 中心クエリ「${analysis.decision.topicQuery}」`);

  log('構成案を作成します');
  const outline = await generateOutline({
    apiKey: secrets.anthropicApiKey,
    model: config.models.analysis,
    config,
    analysis,
  });
  log(`タイトル: ${outline.title}`);

  log('本文を執筆します');
  let article = await generateArticle({
    apiKey: secrets.anthropicApiKey,
    model: config.models.article,
    config,
    outline,
    analysis,
  });

  const approvedPhrases = config.product.approvedEfficacy ? config.product.approvedEfficacy.split(/[、,]/) : [];
  let compliance = checkYakkiho(article, approvedPhrases);

  if (!compliance.ok) {
    log(`薬機法チェックで${compliance.blocks.length}件の指摘。書き直します`);
    article = await reviseArticle({
      apiKey: secrets.anthropicApiKey,
      model: config.models.article,
      config,
      article,
      findings: formatFindings(compliance),
    });
    compliance = checkYakkiho(article, approvedPhrases);
  }
  compliance.detail = formatFindings(compliance);
  log(compliance.ok ? '薬機法チェック: 重大な指摘なし' : `薬機法チェック: ${compliance.blocks.length}件の指摘が残った`);

  let image = null;
  if (!skipImage) {
    log('アイキャッチ画像を生成します');
    image = await generateImage({
      apiKey: secrets.openaiApiKey,
      model: config.models.image,
      size: config.models.imageSize,
      prompt: outline.imagePrompt,
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const dir = join(ROOT, 'output', `${stamp}-${outline.slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'article.md'), `# ${outline.title}\n\n${article}\n`);
  writeFileSync(join(dir, 'outline.json'), JSON.stringify(outline, null, 2));
  writeFileSync(join(dir, 'analysis.json'), JSON.stringify(analysis, null, 2));
  if (image) writeFileSync(join(dir, 'eyecatch.png'), image.buffer);
  log(`生成物を保存しました: ${dir}`);

  const blockedByEfficacy = config.safety.requireApprovedEfficacy && !config.product.approvedEfficacy;
  const blockedByCompliance = config.safety.blockPublishOnYakkihoHit && !compliance.ok;

  let publishNote;
  if (dryRun) {
    publishNote = '未公開（--dry-run 指定）';
  } else if (blockedByEfficacy) {
    publishNote =
      '**未公開**。config.json の product.approvedEfficacy（認証書に書かれた効能・効果の文言）が空のため、' +
      '効能表現の適否を機械判定できない。ここを埋めるまで自動公開はしない';
  } else if (blockedByCompliance) {
    publishNote = `**未公開**。薬機法チェックの指摘が${compliance.blocks.length}件残っている。output/ の記事を人が確認すること`;
  } else {
    log('Wixへ投稿します');
    let wixMediaId = null;
    if (image) {
      wixMediaId = await uploadImage({
        ...secrets.wix,
        buffer: image.buffer,
        mimeType: image.mimeType,
        fileName: `${outline.slug}.png`,
      });
    }

    const draft = await createDraftPost({
      ...secrets.wix,
      title: outline.title,
      richContent: markdownToRicos(article, { wixMediaId, altText: outline.title }),
      seo: { title: outline.title, description: outline.metaDescription },
    });

    await publishDraftPost({ ...secrets.wix, draftPostId: draft.id });
    publishNote = `公開しました（Wix draftPost id: ${draft.id}）`;
    log(publishNote);
  }

  const report = buildReport({ config, analysis, outline, publish: publishNote, compliance, period });
  writeFileSync(join(dir, 'report.md'), report);
  writeFileSync(join(ROOT, 'output', 'latest-report.md'), report);
  console.log(`\n${report}`);

  // 公開を止めた場合は、気づかれずに素通りしないよう異常終了にする
  if (!dryRun && (blockedByEfficacy || blockedByCompliance)) process.exit(2);
}

main().catch((error) => {
  console.error(`失敗しました: ${error.message}`);
  process.exit(1);
});
