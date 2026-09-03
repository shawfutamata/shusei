export const prefectures = [
  '北海道',
  '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県',
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const;

export type Prefecture = (typeof prefectures)[number];

// 地方ブロック。絞り込みは都道府県ではなくこの単位で選ぶ。
export const regions = [
  { name: '北海道', prefectures: ['北海道'] },
  { name: '東北', prefectures: ['青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
  { name: '関東', prefectures: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
  { name: '中部', prefectures: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
  { name: '近畿', prefectures: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
  { name: '中国', prefectures: ['鳥取県', '島根県', '岡山県', '広島県', '山口県'] },
  { name: '四国', prefectures: ['徳島県', '香川県', '愛媛県', '高知県'] },
  { name: '九州・沖縄', prefectures: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
] as const;

export type Region = (typeof regions)[number]['name'];

const regionByPrefecture = new Map<string, string>(
  regions.flatMap((region) => region.prefectures.map((prefecture) => [prefecture, region.name] as const)),
);

/** 都道府県から地方ブロックを引く。分からなければ空文字。 */
export function getRegion(prefecture: string) {
  return regionByPrefecture.get(prefecture.trim()) ?? '';
}

/**
 * 案件の「希望エリア」に出す選択肢。
 *
 * もとは自由記入だったので、書いた文字が絞り込みと噛み合わなかった
 * （「東京都・オンライン」と書いても、地方ブロックの絞り込みには乗らない）。
 * 都道府県から選んでもらえば、そのまま地方ブロックに畳める。
 */
export const ONLINE_AREA = 'オンライン・全国';

export const requestAreaOptions = [ONLINE_AREA, ...prefectures] as const;

/**
 * その希望エリアが、指定の地方ブロックに当てはまるか。
 * 「オンライン・全国」は場所を選ばないので、どのブロックでも当てはまる。
 */
/**
 * その案件が、選んだ都道府県に当てはまるか。
 *
 * **「オンライン・全国」はどこを選んでも当たる。** 場所を問わない募集を
 * 都道府県で切って隠してしまうと、いちばん受けやすい仕事が見つからなくなる。
 */
export function areaMatchesPrefecture(area: string, prefecture: string) {
  const value = area.trim();
  if (!value) return false;
  if (value === ONLINE_AREA) return true;
  return value === prefecture;
}

export function areaMatchesRegion(area: string, region: string) {
  const value = area.trim();
  if (!value) return false;
  if (value === ONLINE_AREA) return true;
  return getRegion(value) === region;
}
