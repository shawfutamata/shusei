export type RequestItem = { id: string; category: 'project' | 'collaboration' | 'consultation'; title: string; description: string; budgetLabel: string; area: string; industryTags: string[]; deadline: string; authorName: string; authorCompany: string; authorVenue: string; introCount: number };
export type MemberStats = { displayName: string; venue: string; badge: string; introCount: number; points: number; rank: string; level: number; nextRankAt: number };
export const demoRequests: RequestItem[] = [
  { id: 'request-video-partner', category: 'collaboration', title: '店舗の採用課題を一緒に解決できる、動画制作会社を探しています', description: '飲食店向けの採用支援をしています。採用SNSの企画から撮影・編集まで、長く組める制作パートナーと出会いたいです。', budgetLabel: '月額20〜40万円', area: '東京都・オンライン', industryTags: ['映像・写真', 'Web・広告'], deadline: '2026-09-30', authorName: '田中 美咲', authorCompany: '株式会社ミナト', authorVenue: 'ひるのめぐろ会場', introCount: 1 },
  { id: 'request-salon-designer', category: 'project', title: '10月オープン予定の美容室に強い、内装デザイナーを探しています', description: '恵比寿の18坪の物件です。美容室の実績がある方をご紹介ください。', budgetLabel: '300〜450万円', area: '東京都', industryTags: ['美容・健康', '建設・不動産'], deadline: '2026-09-10', authorName: '佐藤 健一', authorCompany: 'SATO HAIR', authorVenue: '渋谷会場', introCount: 0 },
];
export const demoStats: MemberStats = { displayName: '二俣 将', venue: 'ひるのめぐろ会場', badge: '赤', introCount: 0, points: 0, rank: 'PEARL', level: 1, nextRankAt: 3 };
