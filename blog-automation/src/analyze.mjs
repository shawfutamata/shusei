/**
 * 週次のSEO判断。
 *
 * 「毎週なんとなく1本書く」ではなく、Search Consoleの実績から
 * 「今週どの記事を書けば主要キーワードの1位維持に効くか」を決める。
 */

/** 全角・半角・大小文字を吸収した比較キー */
function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]+/g, '');
}

/**
 * @param {object} params
 * @param {Array} params.current 直近28日のクエリ別行
 * @param {Array} params.previous その前の28日のクエリ別行
 * @param {Array} params.pages 直近28日のページ×クエリ別行
 * @param {object} params.target config.target
 */
export function analyze({ current, previous, pages, target }) {
  const variants = new Set(target.keywordVariants.map(normalize));
  const isPrimary = (q) => variants.has(normalize(q));

  const prevByQuery = new Map(previous.map((r) => [normalize(r.keys[0]), r]));

  const primaryRows = current.filter((r) => isPrimary(r.keys[0]));
  const primary = primaryRows.length
    ? {
        impressions: primaryRows.reduce((a, r) => a + r.impressions, 0),
        clicks: primaryRows.reduce((a, r) => a + r.clicks, 0),
        // 順位は表示回数で重み付けしないと、表示1回の派生語に引きずられる
        position:
          primaryRows.reduce((a, r) => a + r.position * r.impressions, 0) /
          Math.max(1, primaryRows.reduce((a, r) => a + r.impressions, 0)),
      }
    : null;

  const prevPrimaryRows = previous.filter((r) => isPrimary(r.keys[0]));
  const previousPosition = prevPrimaryRows.length
    ? prevPrimaryRows.reduce((a, r) => a + r.position * r.impressions, 0) /
      Math.max(1, prevPrimaryRows.reduce((a, r) => a + r.impressions, 0))
    : null;

  // 主要キーワードで今いちばん露出しているページ＝守るべきページ
  const primaryPage = pages
    .filter((r) => isPrimary(r.keys[1] ?? r.keys[0]))
    .sort((a, b) => b.impressions - a.impressions)[0];

  // あと一歩で1ページ目 / 上位に届くクエリ。ここを取りにいくのが週次記事の主目的
  const opportunities = current
    .filter((r) => r.impressions >= 20 && r.position > 2 && r.position <= 25 && !isPrimary(r.keys[0]))
    .map((r) => {
      const prev = prevByQuery.get(normalize(r.keys[0]));
      return { ...r, query: r.keys[0], positionDelta: prev ? prev.position - r.position : null };
    })
    // 表示回数が多く、順位が上がりかけているものを優先
    .sort((a, b) => b.impressions / Math.max(3, b.position) - a.impressions / Math.max(3, a.position))
    .slice(0, 15);

  // 順位は良いのにクリックされない＝タイトルとdescriptionの問題。記事を書いても解決しない
  const ctrProblems = current
    .filter((r) => r.position <= 5 && r.impressions >= 50 && r.ctr < 0.03)
    .map((r) => ({ query: r.keys[0], position: r.position, impressions: r.impressions, ctr: r.ctr }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  // 先週まで無かった新しい検索需要
  const emerging = current
    .filter((r) => r.impressions >= 10 && !prevByQuery.has(normalize(r.keys[0])) && !isPrimary(r.keys[0]))
    .map((r) => ({ query: r.keys[0], impressions: r.impressions, position: r.position }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8);

  const lost = previous
    .filter((r) => r.impressions >= 30)
    .map((r) => {
      const now = current.find((c) => normalize(c.keys[0]) === normalize(r.keys[0]));
      if (!now) return null;
      const drop = now.position - r.position;
      return drop >= 3 ? { query: r.keys[0], from: r.position, to: now.position } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.to - b.from) - (a.to - a.from))
    .slice(0, 5);

  const defending = !primary || primary.position > target.watchPositionThreshold;

  return {
    primary: primary ? { ...primary, previousPosition } : null,
    primaryPage: primaryPage ? { url: primaryPage.keys[0], impressions: primaryPage.impressions, position: primaryPage.position } : null,
    defending,
    opportunities,
    ctrProblems,
    emerging,
    lost,
    decision: buildDecision({ defending, primary, target, opportunities, emerging, lost }),
  };
}

function buildDecision({ defending, primary, target, opportunities, emerging, lost }) {
  if (!primary) {
    return {
      mode: 'establish',
      topicQuery: target.primaryKeyword,
      supporting: target.secondaryKeywords.slice(0, 4),
      rationale: `「${target.primaryKeyword}」の表示がSearch Consoleにまだ出ていない。まず主要キーワードそのものを正面から扱う土台記事を作る。`,
    };
  }

  if (defending) {
    const threat = lost[0];
    return {
      mode: 'defend',
      topicQuery: target.primaryKeyword,
      supporting: [...(threat ? [threat.query] : []), ...opportunities.slice(0, 3).map((o) => o.query)],
      rationale:
        `「${target.primaryKeyword}」の平均掲載順位が ${primary.position.toFixed(2)} 位で、目標の ${target.targetPosition} 位を維持できていない。` +
        `主要ページを補強する内部リンク前提の記事を書き、検索意図の取りこぼしを埋める。`,
    };
  }

  const pick = opportunities[0] ?? emerging[0];
  return {
    mode: 'expand',
    topicQuery: pick?.query ?? target.secondaryKeywords[0],
    supporting: [...opportunities.slice(1, 4).map((o) => o.query), ...emerging.slice(0, 2).map((e) => e.query)],
    rationale: pick
      ? `「${target.primaryKeyword}」は ${primary.position.toFixed(2)} 位で維持できている。` +
        `次に取れる見込みが高い「${pick.query}」（表示${pick.impressions}回・現在${(pick.position ?? 0).toFixed(1)}位）を狙い、主要ページへ内部リンクで評価を集める。`
      : `主要キーワードは維持できている。関連トピックを増やしてサイト全体の関連性を広げる。`,
  };
}
