import Link from 'next/link';

// 規約類への導線。ログイン前でも読めるところに置く。
export default function LegalLinks() {
  return <nav className="legal-links" aria-label="規約とポリシー">
    <Link href="/terms">利用規約</Link>
    <Link href="/privacy">プライバシーポリシー</Link>
    <Link href="/refund">返金・キャンセル</Link>
    <Link href="/tokushoho">特定商取引法に基づく表記</Link>
    <Link href="/support">サポート</Link>
  </nav>;
}
