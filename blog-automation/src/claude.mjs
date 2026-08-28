/**
 * 記事本文の生成（Anthropic Messages API）。
 *
 * claude.ai の画面を自動操作するのではなくAPIを使う。画面操作はログイン情報を
 * 機械に預ける必要があり、各社の利用規約にも反する。APIは正規の無人実行手段。
 */

const API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude({ apiKey, model, system, prompt, maxTokens = 8000 }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`記事生成に失敗しました (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return data.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

function complianceBrief(product) {
  const approved = product.approvedEfficacy
    ? `認証を受けた効能・効果は次の文言のみである: 「${product.approvedEfficacy}」`
    : '認証を受けた効能・効果の文言が未設定のため、効能・効果には一切言及してはならない';

  return `${product.name}は日本の${product.regulatoryClass}である。記事は薬機法の広告規制の対象になる。

${approved}
${product.certificationNumber ? `医療機器認証番号: ${product.certificationNumber}` : ''}

絶対に書いてはならないこと:
- 認証された効能・効果の範囲を超える表現（治る、改善する、解消する、予防できる 等）
- 具体的な疾病名と効果の結びつけ（ヘルニア、坐骨神経痛、がん、糖尿病 など）
- 免疫力向上、自然治癒力、デトックス、自律神経を整える、痩身、美容効果
- 医師・専門家による推薦や監修の示唆（薬機法66条3項で明確に禁止）
- 効果や安全性の保証（必ず、誰でも、副作用なし、100%）
- 体験談の形を借りた効能効果の表現。話者を変えても違法性は消えない
- 通院・服薬が不要になるという示唆
- 客観的根拠のない最上級表現（日本一、No.1、唯一）

書いてよいこと:
- 認証された効能・効果の文言の範囲内の説明
- 機器の構造、使い方、体験会の流れ、会社の姿勢
- 姿勢や生活習慣に関する一般的で穏当な情報（機器の効果と結びつけない）
- 読者が自分で判断するための事実`;
}

/**
 * 記事の骨子（構成案）を作る
 */
export async function generateOutline({ apiKey, model, config, analysis }) {
  const { decision } = analysis;
  const system = `あなたは日本語のSEO編集者で、薬機法の広告規制に精通している。${complianceBrief(config.product)}`;

  const prompt = `${config.site.company}のオウンドメディアに、今週公開する記事の構成案を作る。

## 今週の狙い（Search Consoleの実績から機械的に決定済み）
モード: ${decision.mode}
中心クエリ: ${decision.topicQuery}
補助クエリ: ${decision.supporting.join(' / ') || 'なし'}
根拠: ${decision.rationale}

## 死守する条件
- 主要キーワード「${config.target.primaryKeyword}」で検索順位1位を維持することが最終目的
- 主要ページ（${analysis.primaryPage?.url ?? config.site.blogBaseUrl}）へ内部リンクを送り、評価を集める
- 読者: ${config.editorial.audience}
- トーン: ${config.editorial.tone}
- 文字数: ${config.editorial.minChars}〜${config.editorial.maxChars}字
- 最後の行動喚起: ${config.editorial.callToAction}

## 出力形式（JSONのみ。前後に説明を書かない）
{
  "title": "32文字以内。中心クエリを自然に含む",
  "slug": "半角英数とハイフンのURL用文字列",
  "metaDescription": "120文字以内",
  "searchIntent": "この記事が答える検索意図を一文で",
  "sections": [{ "heading": "h2見出し", "points": ["この節で必ず触れる事実"] }],
  "internalLinks": [{ "anchor": "リンク文言", "reason": "なぜそこへ送るか" }],
  "imagePrompt": "アイキャッチ画像をChatGPT/DALLEに渡す英語のプロンプト。人物の症状や医療的効果を暗示しない、清潔で落ち着いた日本の施設の雰囲気",
  "faq": [{ "q": "想定質問", "a": "回答（効能効果に踏み込まない）" }]
}`;

  const text = await callClaude({ apiKey, model, system, prompt, maxTokens: 4000 });
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

/**
 * 構成案から本文を書く
 */
export async function generateArticle({ apiKey, model, config, outline, analysis }) {
  const system = `あなたは日本語のSEOライターで、薬機法の広告規制に精通している。${complianceBrief(config.product)}

規制の範囲内で、読者にとって本当に読む価値のある記事を書く。規制を避けるために内容を薄くしてはならない。`;

  const prompt = `次の構成案どおりに記事本文をMarkdownで書く。

${JSON.stringify(outline, null, 2)}

## 条件
- 中心キーワード「${analysis.decision.topicQuery}」と「${config.target.primaryKeyword}」を、不自然でない範囲で見出しと本文に配置する
- ${config.editorial.minChars}〜${config.editorial.maxChars}字
- h1は書かない（タイトルは別で扱う）。h2とh3で構成する
- 数字や手順など具体を入れる。一般論だけの水増しをしない
- 記事末に「${config.editorial.callToAction}」への案内を置く
- 記事末に、この機器が${config.product.regulatoryClass}であること、および個人の感じ方には差があることを示す注記を置く
- 出力はMarkdown本文のみ。前置きや講評を書かない`;

  return callClaude({ apiKey, model, system, prompt, maxTokens: 8000 });
}

/**
 * 薬機法チェックで止まった記事を、指摘を踏まえて書き直す
 */
export async function reviseArticle({ apiKey, model, config, article, findings }) {
  const system = `あなたは日本語の薬務コンプライアンス担当者兼編集者である。${complianceBrief(config.product)}`;

  const prompt = `次の記事に薬機法上の問題が見つかった。指摘箇所を修正する。

## 指摘
${findings}

## 修正方針
- 該当表現を削除するか、認証された効能・効果の範囲内の表現に書き換える
- 表現をぼかして逃げるのではなく、言えないことは言わない
- 指摘に関係のない部分は変更しない
- 出力は修正後のMarkdown本文のみ

## 記事
${article}`;

  return callClaude({ apiKey, model, system, prompt, maxTokens: 8000 });
}
