// 規約類への導線。ログイン前でも読めるところに置く。
//
// **next/link ではなく素の <a> にしてある。** 行き先は掲示板の外にある
// 静かなページなので、クライアント側で切り替える利点が無い。逆に、
// ルーターが取りこぼすと「押しても何も起きない」になり、原因が見えにくい。
// ふつうのページ遷移なら、失敗すればブラウザがそう見せてくれる。
export default function LegalLinks() {
  return <nav className="legal-links" aria-label="規約とポリシー">
    <a href="/terms">利用規約</a>
    <a href="/privacy">プライバシーポリシー</a>
    <a href="/refund">返金・キャンセル</a>
    <a href="/tokushoho">特定商取引法に基づく表記</a>
    <a href="/support">サポート</a>
  </nav>;
}
