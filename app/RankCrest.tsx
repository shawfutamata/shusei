// 会員証カードの中央にある紋章。月桂樹で挟んだランクごとのエンブレム。
// 色は指定せず currentColor を使う。ランクごとの配色は .rank-card 側が持っている。

// 左半分の月桂樹。茎は内側の下から外側の上へ弧を描き、葉は外向きに開く。
// 右半分は scaleX(-1) で鏡にする。
const laurelLeaves: [number, number, number][] = [[25, 39, -152], [21, 31.5, -157], [17.5, 24, -161], [14, 16.5, -165], [11, 9.5, -169]];

function Laurel({ flip = false }: { flip?: boolean }) {
  return (
    <svg className="rank-laurel" viewBox="0 0 34 46" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M28 43C23.5 35 15.5 21 9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {laurelLeaves.map(([x, y, rotate], index) => (
        <ellipse key={index} cx="0" cy="0" rx="6.4" ry="2.7" transform={`translate(${x} ${y}) rotate(${rotate}) translate(6 0)`} fill="currentColor" opacity="0.85" />
      ))}
    </svg>
  );
}

// ランクごとの意匠。SILVERは冠、GOLDは盾、PLATINUMは羅針星、
// DIAMONDは翼のある冠で、上に行くほど密度が上がるようにしてある。
const emblems: Record<string, React.ReactNode> = {
  SILVER: <>
    <path d="M11 32h22l3-17-8.5 6L22 9l-5.5 12L8 15z" fill="currentColor" opacity="0.9" />
    <path d="M11 35.5h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </>,
  GOLD: <>
    <path d="M22 4l15 5.5v12.5c0 9.5-6.4 15.8-15 19.5-8.6-3.7-15-10-15-19.5V9.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M15 26h14l2-10.5-5.5 4L22 12l-3.5 7.5-5.5-4z" fill="currentColor" opacity="0.9" />
  </>,
  PLATINUM: <>
    <path d="M22 3l16.5 9.75v19.5L22 42 5.5 32.25v-19.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M22 11l3 8.8 8.8 3-8.8 3-3 8.8-3-8.8-8.8-3 8.8-3z" fill="currentColor" opacity="0.9" />
  </>,
  DIAMOND: <>
    <path d="M13 30h18l2.5-13-7 4.5L22 8l-6.5 13.5-7-4.5z" fill="currentColor" opacity="0.9" />
    <path d="M13 33.5h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M11 20L2 13l3 10.5M33 20l9-7-3 10.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </>,
};

export default function RankCrest({ rank }: { rank: string }) {
  return (
    <div className="rank-crest" aria-hidden="true">
      <Laurel />
      <svg className="rank-emblem-mark" viewBox="0 0 44 46">{emblems[rank] ?? emblems.SILVER}</svg>
      <Laurel flip />
    </div>
  );
}

// カード左上の小さな冠。会員証の発行元を示す印。
export function CrownMark() {
  return (
    <svg className="rank-crown-mark" viewBox="0 0 24 20" aria-hidden="true">
      <path d="M3 15h18l2.2-12-6.6 4.2L12 1 7.4 7.2.8 3z" fill="currentColor" />
      <path d="M3.6 18h16.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
