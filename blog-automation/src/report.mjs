/** 週次レポート（人が読む用）。順位の推移と、今週なぜその記事にしたのかを残す */
export function buildReport({ config, analysis, outline, publish, compliance, period }) {
  const p = analysis.primary;
  const trend =
    p && p.previousPosition != null
      ? p.position < p.previousPosition
        ? `↑ ${(p.previousPosition - p.position).toFixed(2)}位 改善`
        : p.position > p.previousPosition
          ? `↓ ${(p.position - p.previousPosition).toFixed(2)}位 下落`
          : '横ばい'
      : '比較対象なし';

  const lines = [
    `# 週次SEOレポート ${period.currentStart} 〜 ${period.currentEnd}`,
    '',
    `## 主要キーワード「${config.target.primaryKeyword}」`,
    '',
    p
      ? [
          `- 平均掲載順位: **${p.position.toFixed(2)}位**（目標 ${config.target.targetPosition}位）`,
          `- 前期比: ${trend}`,
          `- 表示回数: ${p.impressions} / クリック: ${p.clicks}`,
          `- 主要ページ: ${analysis.primaryPage?.url ?? '特定できず'}`,
          analysis.defending
            ? '- 判定: **1位を維持できていない。防衛が必要**'
            : '- 判定: 維持できている',
        ].join('\n')
      : '- Search Consoleにこのキーワードの表示がまだ無い',
    '',
    '## 今週の記事',
    '',
    `- モード: ${analysis.decision.mode}`,
    `- 中心クエリ: ${analysis.decision.topicQuery}`,
    `- 理由: ${analysis.decision.rationale}`,
    outline ? `- タイトル: ${outline.title}` : '',
    '',
    '## 薬機法チェック',
    '',
    compliance
      ? compliance.ok
        ? `- 重大な指摘なし${compliance.warns.length ? `（要確認 ${compliance.warns.length}件）` : ''}`
        : `- **${compliance.blocks.length}件の重大な指摘。自動公開を停止した**`
      : '- 未実施',
    compliance?.detail ? `\n\`\`\`\n${compliance.detail}\n\`\`\`` : '',
    '',
    '## 公開',
    '',
    `- ${publish}`,
    '',
    '## あと一歩で上位に届くクエリ',
    '',
    analysis.opportunities.length
      ? ['| クエリ | 表示 | 順位 | 前期比 |', '|---|---|---|---|']
          .concat(
            analysis.opportunities
              .slice(0, 10)
              .map(
                (o) =>
                  `| ${o.query} | ${o.impressions} | ${o.position.toFixed(1)} | ${
                    o.positionDelta == null ? '新規' : `${o.positionDelta > 0 ? '↑' : '↓'}${Math.abs(o.positionDelta).toFixed(1)}`
                  } |`,
              ),
          )
          .join('\n')
      : '該当なし',
    '',
    '## 順位が落ちたクエリ',
    '',
    analysis.lost.length
      ? analysis.lost.map((l) => `- ${l.query}: ${l.from.toFixed(1)}位 → ${l.to.toFixed(1)}位`).join('\n')
      : '該当なし',
    '',
    '## 記事ではなくタイトルを直すべきもの（順位は良いがクリックされていない）',
    '',
    analysis.ctrProblems.length
      ? analysis.ctrProblems
          .map((c) => `- ${c.query}: ${c.position.toFixed(1)}位・表示${c.impressions}回なのにCTR ${(c.ctr * 100).toFixed(1)}%`)
          .join('\n')
      : '該当なし',
    '',
    '## 新しく出てきた検索需要',
    '',
    analysis.emerging.length ? analysis.emerging.map((e) => `- ${e.query}（表示${e.impressions}回）`).join('\n') : '該当なし',
    '',
  ];

  return lines.filter((l) => l !== '').join('\n');
}
