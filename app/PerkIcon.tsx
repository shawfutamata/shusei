// ランク特典のアイコン。文字だけだと一覧で見分けがつかないので、
// 1つずつ形を変えてある。線の太さは下のメニューのアイコンとそろえた。
const paths: Record<string, React.ReactNode> = {
  // 紋章
  crest: <><path d="M12 3.2 19 6v5.4c0 4-2.8 7.2-7 8.6-4.2-1.4-7-4.6-7-8.6V6z" /><path d="m9.4 11.6 1.9 1.9 3.4-3.6" /></>,
  // 紹介の実績
  record: <><path d="M5 19.2V12M12 19.2V7.4M19 19.2v-4.6" /><path d="M3.4 19.6h17.2" /></>,
  // 募集の延長
  extend: <><circle cx="12" cy="12.4" r="7.6" /><path d="M12 8.2v4.4l3 1.8" /><path d="M12 2.6v2.2" /></>,
  // おすすめ業種の枠
  industries: <><rect x="3.6" y="3.9" width="7" height="7" rx="1.6" /><rect x="13.4" y="3.9" width="7" height="7" rx="1.6" /><rect x="3.6" y="13.6" width="7" height="7" rx="1.6" /><path d="M16.9 14.2v6M13.9 17.2h6" /></>,
  // 注目ピン
  pin: <><path d="M12 21.2v-6" /><path d="M8 3.4h8l-1 6.2 2.6 2.4c.5.5.2 1.3-.5 1.3H6.9c-.7 0-1-.8-.5-1.3L9 9.6z" /></>,
  // トップバナーへの出稿
  ad: <><rect x="2.7" y="4.4" width="18.6" height="11.3" rx="2.2" /><path d="M6.4 8.6h7.4M6.4 11.8h4.6" /><path d="M12 15.7v3.9M8.6 19.6h6.8" /></>,
  // 掲載文章の上限なし
  longtext: <><path d="M5.4 3.6h9l4.2 4.2v12.6H5.4z" /><path d="M14.2 3.6v4.4h4.4" /><path d="M8.4 12h7.2M8.4 15.4h7.2M8.4 18h4.4" /></>,
  // 動画
  video: <><rect x="2.8" y="6" width="13.4" height="12" rx="2.4" /><path d="m16.2 11 4.8-2.8v7.6L16.2 13z" /></>,
  // 業種別プロモーション
  promo: <><path d="M4.2 9.4h3.2l7.6-4.2v13.6l-7.6-4.2H4.2z" /><path d="M4.2 9.4v5.2" /><path d="M18.4 9.2a4 4 0 0 1 0 5.6" /><path d="M8 14.6v4.6h3" /></>,
  // 探しごとの写真
  photos: <><rect x="3.4" y="6.4" width="17.2" height="13.2" rx="2.4" /><path d="M6.6 6.4V4.6h10.8v1.8" /><circle cx="12" cy="13" r="3.4" /></>,
  // 広告期間の延長
  'ad-long': <><rect x="2.6" y="5.4" width="18.8" height="9.4" rx="2.2" /><path d="M6.2 9h6.4" /><path d="M6.2 18.8h9.2m0 0-2.6-2.4m2.6 2.4-2.6 2.4" /></>,
  // 出稿枠の先取り
  'ad-ahead': <><rect x="3.4" y="5" width="17.2" height="15.4" rx="2.4" /><path d="M3.4 9.6h17.2M8.2 3.2v3.4M15.8 3.2v3.4" /><path d="m10.2 15.6 1.6 1.6 3-3.2" /></>,
  // 殿堂入り
  hall: <><path d="M8.4 3.4h7.2v4.4a3.6 3.6 0 0 1-7.2 0z" /><path d="M8.4 4.8H5.6v1.4a3 3 0 0 0 2.8 3M15.6 4.8h2.8v1.4a3 3 0 0 1-2.8 3" /><path d="M12 11.4v4.2M8.6 20.4h6.8l-.9-4.8H9.5z" /></>,
};

export default function PerkIcon({ perk }: { perk: string }) {
  return <svg className="perk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {paths[perk] ?? paths.crest}
  </svg>;
}
