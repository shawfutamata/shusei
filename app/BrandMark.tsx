// ロゴマーク。正は public/mark.svg（アイコンのPNGもそこから書き出している）。
// 透過SVGなので、地色の上でもそのまま置ける。
export default function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  // SVGなので next/image を通す意味がない。
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src="/mark.svg" alt="" width={34} height={34} />;
}
