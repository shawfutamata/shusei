import type { BoardRequest } from './data';

/**
 * 掲示板に置く、見本の探しごと。
 *
 * **データベースには入れない。** 本物の投稿と混ざって残り続けると、
 * 消すときに本物まで巻き込む危険がある。ここに書いたぶんだけが出るので、
 * 要らなくなったらこのファイルを空にすれば消える。
 *
 * **必ず「サンプル」と分かるようにする。** 本物の会員の投稿だと思って
 * オファーを送ろうとした人を、送ってから断るのは失礼にあたる。カードにも
 * 詳細にも札を出し、オファーのボタンは押せないようにしてある
 * （app/BoardClient.tsx）。
 *
 * 上に出る広告のサンプル（清掃・引越し・ケータリング）と話をそろえてある。
 * 「こういう探しごとがあって、こういう広告が出る」という一続きの絵にするため。
 */
const samples = [
  {
    id: 'sample-cleaning',
    category: 'project' as const,
    title: '店舗の定期清掃をお願いできる会社を探しています',
    description: '都内3店舗の床とトイレの清掃を、週1回でお願いできる会社を探しています。閉店後の作業になります。まずは1店舗から試させていただけると助かります。',
    budgetBand: 'monthly',
    budgetLabel: '月額5〜10万円（3店舗ぶん）',
    area: '東京都',
    industryTags: ['清掃・クリーニング'],
    authorName: '見本 太郎',
    authorCompany: 'サンプル商事株式会社',
    authorPositionTitle: '代表取締役',
    authorBusinessArea: '東京都',
    authorRevenueBand: 'revenue_10_30',
    offerCount: 2,
    referralCount: 1,
  },
  {
    id: 'sample-moving',
    category: 'collaboration' as const,
    title: 'オフィス移転を一緒に進めてくれる内装会社を探しています',
    description: '来春に事務所を移転します。引越しの手配はこちらで進めますが、レイアウトの設計と内装工事をお願いできる方を探しています。20名ほどの規模です。',
    budgetBand: 'm300to1000',
    budgetLabel: '300〜500万円',
    area: '東京都',
    industryTags: ['内装・リフォーム'],
    authorName: '見本 花子',
    authorCompany: 'サンプル製作所',
    authorPositionTitle: '専務取締役',
    authorBusinessArea: '東京都',
    authorRevenueBand: 'revenue_30_70',
    offerCount: 1,
    referralCount: 3,
  },
  {
    id: 'sample-catering',
    category: 'consultation' as const,
    title: '創立20周年の記念パーティーについて相談させてください',
    description: '来年で創立20周年になります。取引先を80名ほどお招きしての式を考えていて、会場とお食事の手配をどう進めればよいか、経験のある方にお話を伺いたいです。',
    budgetBand: 'negotiable',
    budgetLabel: '',
    area: '東京都',
    industryTags: ['イベント企画・運営'],
    authorName: '見本 一郎',
    authorCompany: '株式会社サンプル工業',
    authorPositionTitle: '代表取締役社長',
    authorBusinessArea: '東京都',
    authorRevenueBand: 'revenue_70_100',
    offerCount: 0,
    referralCount: 2,
  },
];

/**
 * 見本を掲示板の形にして返す。
 *
 * 期限は**開いた日から数えて決める**。決め打ちにすると、いつか必ず
 * 「募集終了」になって、見本のはずが止まった掲示板の見本になってしまう。
 */
export function sampleRequests(now = new Date()): BoardRequest[] {
  const day = 86400000;
  return samples.map((item, index) => ({
    ...item,
    thumbUrl: '', imageUrl: '', imageUrls: [], videoUrl: '',
    deadline: new Date(now.getTime() + (60 + index * 15) * day).toISOString().slice(0, 10),
    status: 'open',
    createdAt: new Date(now.getTime() - (index + 1) * day).toISOString(),
    myIntroCount: 0,
    introCount: item.offerCount + item.referralCount,
    pinnedUntil: '', extendedAt: '', promoIndustry: '', promoUntil: '',
    mine: false,
    // 会場は画面から外してあるので、見本にも入れない。型には残っているので空で埋める。
    authorVenue: '',
    authorAvatarUrl: '', authorFacebookUrl: '',
    sample: true,
  }));
}
