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

export function matchesIndustry(tags: string[], filter: string) {
  if (filter === 'all') return true;
  const group = industryGroups.find((item) => item.name === filter);
  if (!group) return tags.includes(filter);
  return tags.some((tag) => tag === group.name || (group.children as readonly string[]).includes(tag));
}
