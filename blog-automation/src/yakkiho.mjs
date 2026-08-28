/**
 * 薬機法 / 景表法チェッカー
 *
 * マスターV4は管理医療機器なので、記事の表現は「認証を受けた効能・効果」の
 * 範囲を出られない。生成AIは放っておくと範囲外の効能を書くため、公開前に
 * 機械的に止める。ここで検出したら自動公開は行わず、人のレビューに回す。
 *
 * 法的な最終判断はここではできない。これは「明らかな事故を止める網」であって、
 * 通過＝適法の保証ではない。
 */

/** @typedef {{ id: string, severity: 'block' | 'warn', pattern: RegExp, reason: string }} Rule */

const DISEASES =
  'がん|癌|腫瘍|糖尿病|高血圧|認知症|うつ|うつ病|ヘルニア|椎間板ヘルニア|坐骨神経痛|狭窄症|リウマチ|不妊|アトピー|喘息|花粉症|更年期障害|骨粗しょう症|骨粗鬆症|脳梗塞|心筋梗塞';

const CURE = '治る|治り|治せ|治療|完治|根治|治癒|解消|克服|改善|良くなる|効く|効果があ|効きます';

/** @type {Rule[]} */
export const RULES = [
  {
    id: 'disease-cure',
    severity: 'block',
    pattern: new RegExp(`(${DISEASES})[^。！？\\n]{0,30}(${CURE})`),
    reason: '疾病の治療・治癒を標榜している（薬機法66条1項／認証範囲外の効能効果）',
  },
  {
    id: 'cure-disease',
    severity: 'block',
    pattern: new RegExp(`(${CURE})[^。！？\\n]{0,30}(${DISEASES})`),
    reason: '疾病の治療・治癒を標榜している（薬機法66条1項／認証範囲外の効能効果）',
  },
  {
    id: 'immunity',
    severity: 'block',
    pattern: /免疫力[^。\n]{0,10}(上が|高ま|アップ|向上)|自然治癒力[^。\n]{0,10}(上が|高ま|アップ|向上)/,
    reason: '免疫力・自然治癒力の向上は認証された効能効果ではない',
  },
  {
    id: 'detox-autonomic',
    severity: 'block',
    pattern: /デトックス|毒素[^。\n]{0,6}(排出|出す)|自律神経[^。\n]{0,10}(整う|整え|正常)|ホルモンバランス[^。\n]{0,10}(整う|整え)/,
    reason: '医学的効果を示唆するが認証された効能効果の範囲外',
  },
  {
    id: 'guarantee',
    severity: 'block',
    pattern: /必ず[^。\n]{0,10}(治|改善|効|楽に)|誰でも[^。\n]{0,10}(治|改善|効)|100%[^。\n]{0,8}(安全|効果)|副作用[^。\n]{0,6}(は)?(一切)?(ありません|ない|なし)/,
    reason: '効果・安全性の保証表現（薬機法66条2項・景表法の優良誤認）',
  },
  {
    id: 'doctor-endorsement',
    severity: 'block',
    pattern: /(医師|医者|ドクター|専門医|大学教授)[^。\n]{0,12}(推奨|推薦|お墨付き|認めた|絶賛)/,
    reason: '医薬関係者による推薦表現は薬機法66条3項で明確に禁止',
  },
  {
    id: 'testimonial-efficacy',
    severity: 'block',
    pattern: new RegExp(`(体験者|お客様|利用者|愛用者|patient)?[^。\\n]{0,20}「[^」\\n]{0,40}(${CURE})[^」\\n]{0,20}」`),
    reason: '体験談の形で認証範囲外の効能効果を述べている（表現の主体を変えても違法性は消えない）',
  },
  {
    id: 'superlative',
    severity: 'warn',
    pattern: /日本一|世界一|No\.?1|ナンバーワン|最高の効果|唯一の|他社にはない/,
    reason: '最上級表現は客観的根拠がなければ景表法の優良誤認にあたる',
  },
  {
    id: 'medical-substitute',
    severity: 'warn',
    pattern: /(病院|通院|手術|薬|投薬)[^。\n]{0,12}(不要|いらな|やめ|代わり)/,
    reason: '医療の代替を示唆している。受診機会の妨げとして問題になる',
  },
  {
    id: 'weight-beauty',
    severity: 'warn',
    pattern: /痩せ|ダイエット効果|脂肪[^。\n]{0,8}(燃焼|落ち)|小顔|美肌/,
    reason: '痩身・美容効果は本機器の認証された効能効果ではない',
  },
];

/**
 * @param {string} text 記事本文（Markdown可）
 * @param {string[]} approvedPhrases 認証書に記載された効能・効果。ここに完全一致で
 *   含まれる語はルール判定から除外する（承認内の表現まで潰さないため）
 * @returns {{ ok: boolean, blocks: Array<{rule: string, severity: string, reason: string, excerpt: string}>, warns: Array<{rule: string, severity: string, reason: string, excerpt: string}> }}
 */
export function checkYakkiho(text, approvedPhrases = []) {
  let scanned = text;
  for (const phrase of approvedPhrases) {
    if (phrase && phrase.trim()) {
      scanned = scanned.split(phrase).join('〈承認済効能〉');
    }
  }

  const blocks = [];
  const warns = [];

  for (const rule of RULES) {
    const global = new RegExp(rule.pattern.source, 'g');
    let match;
    while ((match = global.exec(scanned)) !== null) {
      const start = Math.max(0, match.index - 25);
      const hit = {
        rule: rule.id,
        severity: rule.severity,
        reason: rule.reason,
        excerpt: scanned.slice(start, match.index + match[0].length + 25).replace(/\n/g, ' '),
      };
      (rule.severity === 'block' ? blocks : warns).push(hit);
      if (global.lastIndex === match.index) global.lastIndex += 1;
    }
  }

  return { ok: blocks.length === 0, blocks, warns };
}

/** 検出結果を人が読める日本語にする */
export function formatFindings({ blocks, warns }) {
  const lines = [];
  for (const hit of blocks) lines.push(`- 🚫 [${hit.rule}] ${hit.reason}\n      該当: …${hit.excerpt}…`);
  for (const hit of warns) lines.push(`- ⚠️ [${hit.rule}] ${hit.reason}\n      該当: …${hit.excerpt}…`);
  return lines.join('\n');
}
