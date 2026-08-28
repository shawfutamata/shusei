// ロゴ（public/mark.svg）の紺・水色・橙にそろえてある。
export const AppColors = { blue: '#1478D6', blueDark: '#0F5FC4', sky: '#46C6FB', accent: '#F4501E', ink: '#13233F', muted: '#66758C', line: '#DCE5F2', paper: '#F5F8FD', white: '#FFFFFF', paleBlue: '#EAF3FF' };
export const rankThresholds = [0, 3, 6, 10, 20];
export const prefectures = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'] as const;
export const industryGroups = [
  ['IT・システム', 'laptop-outline'], ['Web・広告', 'megaphone-outline'], ['映像・写真', 'videocam-outline'], ['デザイン・印刷', 'color-palette-outline'],
  ['建設・不動産', 'home-outline'], ['製造・卸売', 'business-outline'], ['小売・EC', 'cart-outline'], ['飲食・食品', 'restaurant-outline'],
  ['美容・健康', 'cut-outline'], ['医療・福祉', 'medkit-outline'], ['士業・コンサル', 'scale-outline'], ['人材・教育', 'people-outline'],
  ['金融・保険', 'cash-outline'], ['運輸・物流', 'car-outline'], ['イベント・エンタメ', 'mic-outline'], ['その他', 'ellipsis-horizontal'],
] as const;
