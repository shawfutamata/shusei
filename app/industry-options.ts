export const industryGroups = [
  { name: 'IT・システム', children: ['システム開発', 'アプリ開発', 'SaaS', 'ITインフラ', 'サイバーセキュリティ', 'AI・DX支援', 'ITサポート'] },
  { name: 'Web・広告', children: ['Webサイト制作', 'SEO対策', 'Web広告運用', 'SNS運用', 'PR・広報', 'マーケティング', 'ライティング'] },
  { name: '映像・写真', children: ['動画制作', '写真撮影', '映像編集', 'ライブ配信', 'ドローン撮影', '撮影スタジオ'] },
  { name: 'デザイン・印刷', children: ['グラフィックデザイン', 'ロゴ・ブランディング', 'イラスト制作', 'UI・UXデザイン', '印刷', '看板・サイン', 'パッケージ制作'] },
  { name: '建設・不動産', children: ['建築設計', '工務店・建設会社', '内装・リフォーム', '電気・設備工事', '不動産売買', '賃貸・物件管理', '外構・造園'] },
  { name: '製造・卸売', children: ['金属加工', '樹脂・プラスチック加工', 'OEM・受託製造', '機械・部品製造', '雑貨卸', '食品卸', '伝統工芸'] },
  { name: '小売・EC', children: ['アパレル', 'ジュエリー・宝飾', '革製品・革細工', '生活雑貨', '家具・インテリア', '化粧品', 'ECサイト運営', 'ギフト・贈答品'] },
  { name: '飲食・食品', children: ['飲食店', 'カフェ・喫茶店', '居酒屋・バー', '菓子・スイーツ', '食品製造', 'ケータリング', '農産物・生産者', '酒類'] },
  { name: '美容・健康', children: ['美容室・理容室', 'ネイル・まつげ', 'エステ・サロン', '整体・鍼灸', 'フィットネス', '健康食品', 'リラクゼーション'] },
  { name: '医療・福祉', children: ['病院・クリニック', '歯科', '薬局', '介護サービス', '障害福祉', '訪問看護', '医療機器'] },
  { name: '士業・コンサル', children: ['税理士・会計士', '社会保険労務士', '弁護士', '司法書士', '行政書士', '経営コンサルティング', '補助金・助成金支援'] },
  { name: '人材・教育', children: ['人材紹介・派遣', '求人広告', '採用支援', '企業研修・セミナー', 'スクール・教室', '学習塾', '保育・幼児教育'] },
  { name: '金融・保険', children: ['生命保険', '損害保険', '保険代理店', '銀行・融資', '資産運用', 'ファイナンシャルプランナー', '決済サービス'] },
  { name: '運輸・物流', children: ['一般運送', '軽貨物', '倉庫・保管', '引越し', '国際物流', '配送代行', 'レンタカー・車両'] },
  { name: 'イベント・エンタメ', children: ['イベント企画・運営', '会場・ホール', '音響・照明', '芸能・タレント', '音楽・演奏', '司会・MC', 'レジャー・体験'] },
  { name: 'その他', children: ['清掃・クリーニング', '警備', 'ペット関連', '冠婚葬祭', '旅行・観光', '自動車関連', '環境・リサイクル', 'その他サービス'] },
] as const;

export const industryGroupNames = industryGroups.map((group) => group.name);
export const detailedIndustries = industryGroups.flatMap((group) => group.children);

// Parent names remain valid so existing profiles and posts continue to work.
export const industries: readonly string[] = [...industryGroupNames, ...detailedIndustries];
export type Industry = string;

export function isIndustry(value: string): value is Industry {
  return industries.includes(value);
}

export function getIndustryGroup(value: string) {
  return industryGroups.find((group) => group.name === value || (group.children as readonly string[]).includes(value));
}

export const industryIconPaths: Record<string, string> = {
  'IT・システム': '/icons/industries/it-system.png', 'Web・広告': '/icons/industries/web-ad.png',
  '映像・写真': '/icons/industries/video-photo.png', 'デザイン・印刷': '/icons/industries/design-print.png',
  '建設・不動産': '/icons/industries/construction-realestate.png', '製造・卸売': '/icons/industries/manufacturing-wholesale.png',
  '小売・EC': '/icons/industries/retail-ec.png', '飲食・食品': '/icons/industries/food.png',
  '美容・健康': '/icons/industries/beauty-health.png', '医療・福祉': '/icons/industries/medical-welfare.png',
  '士業・コンサル': '/icons/industries/legal-consulting.png', '人材・教育': '/icons/industries/hr-education.png',
  '金融・保険': '/icons/industries/finance-insurance.png', '運輸・物流': '/icons/industries/transport-logistics.png',
  'イベント・エンタメ': '/icons/industries/event-entertainment.png', 'その他': '/icons/industries/other.png',
};

// Imported venue directories contain free-form industries rather than TASUKI's fixed choices.
// Only the pictogram is grouped; the original industry text remains visible to readers.
export function getIndustryIconSource(industry: string) {
  const group = getIndustryGroup(industry)?.name
    ?? ([
      ['士業・コンサル', /税理士|社労士|社会保険労務士|弁護士|司法書士|行政書士|会計士|登記|補助金|助成金/],
      ['美容・健康', /カウンセリング|美容|健康|整体|マッサージ|サプリ|トレーナー|スキンケア/],
      ['建設・不動産', /建設|建築|内装|リフォーム|不動産|測量|電気工事/],
      ['IT・システム', /システム|IT|情報サービス|アプリ|ソフトウェア/],
      ['Web・広告', /SNS|広告|宣伝|マーケティング|Web/],
      ['デザイン・印刷', /印刷|デザイン|出版|編集/],
      ['医療・福祉', /医療|介護|福祉|病院/],
      ['人材・教育', /保育|教育|人材|研修|セミナー/],
      ['飲食・食品', /飲食|食品|カフェ|BAR|食用花/],
      ['小売・EC', /小売|販売|ジュエリー|宝石|アパレル|化粧品|家具/],
      ['運輸・物流', /運送|引越し|物流|配送/],
      ['イベント・エンタメ', /イベント|タレント|女優|芸能/],
      ['製造・卸売', /製造|卸売|卸/],
      ['金融・保険', /金融|保険|融資/],
    ] as const).find(([, pattern]) => pattern.test(industry))?.[0]
    ?? 'その他';
  return industryIconPaths[group];
}

/** 名簿由来の自由記入も、複数業種なら個別に表示・照合する。中黒は業種名に含まれるため区切らない。 */
export function splitIndustryLabels(value: string): string[] {
  return [...new Set(value.split(/[、,，／/;；\n]+/).map((item) => item.trim()).filter(Boolean))];
}

export function matchesIndustry(tags: string[], filter: string) {
  if (filter === 'all') return true;
  const group = industryGroups.find((item) => item.name === filter);
  if (!group) return tags.includes(filter);
  return tags.some((tag) => tag === group.name || (group.children as readonly string[]).includes(tag));
}
