// 広告のバナー。**出稿する人は絵を作らない。**
// タイトル・説明文・画像を入れてもらい、並べ方はこちらで決める。
// ホームのカルーセルでも、入稿画面のプレビューでも、この同じ部品を使う。
// 見えているものが、そのまま載る。

export type AdBannerContent = {
  title: string;
  description: string;
  imageUrl: string;
  /** 「PR」の横に出す名前。会社名が無ければ会員名。 */
  by: string;
};

export default function AdBanner({ ad, className = '' }: { ad: AdBannerContent; className?: string }) {
  return <div className={`ad-banner${ad.imageUrl ? '' : ' is-plain'} ${className}`.trim()}>
    {ad.imageUrl && <img src={ad.imageUrl} alt="" aria-hidden="true" />}
    <span className="ad-banner-tag">PR<em>{ad.by}</em></span>
    <div className="ad-banner-copy">
      <b>{ad.title || 'こんな人を探しています'}</b>
      {ad.description && <span>{ad.description}</span>}
    </div>
  </div>;
}
