'use client';

import { useId, useState } from 'react';

/**
 * 管理画面のグラフ。外の描画ライブラリは入れず、SVGを直接書く。
 * Workersに載せる束を重くしたくないのと、この程度の形なら自分で描けるため。
 *
 * 色は3系統だけ（会員・投稿・紹介）。**色だけで見分けさせない**ので、
 * 凡例に必ず名前と数字を添える。色が分かりにくい人にも読めるようにするため。
 */

export type Point = { date: string; members: number; requests: number; introductions: number };

const series = [
  { key: 'members', label: '新しい会員', color: 'var(--viz-1)' },
  { key: 'requests', label: '探しごと', color: 'var(--viz-2)' },
  { key: 'introductions', label: '紹介', color: 'var(--viz-3)' },
] as const;

/** 日ごとの動きの折れ線。点にさわると、その日の数が出る。 */
export function TrendChart({ points }: { points: Point[] }) {
  const clip = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <p className="viz-empty">まだ数字がありません。</p>;

  const width = 720;
  const height = 220;
  const pad = { top: 14, right: 14, bottom: 26, left: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.flatMap((point) => [point.members, point.requests, point.introductions]));
  const x = (index: number) => pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;

  const totals = series.map((item) => ({ ...item, total: points.reduce((sum, point) => sum + point[item.key], 0) }));
  const ticks = [0, Math.round(max / 2), max].filter((value, index, all) => all.indexOf(value) === index);
  // さわらなくても数字が読めるようにする。**いちばん新しい日を既定で出す。**
  // 触って初めて数が出る作りだと、指で細い線を当てられない画面では
  // グラフがただの飾りになってしまう。
  const shown = hover === null ? points.length - 1 : hover;
  const active = points[shown];

  return <figure className="viz">
    <ul className="viz-legend">
      {totals.map((item) => <li key={item.key}>
        <i style={{ background: item.color }} aria-hidden="true" />
        <b>{item.label}</b><span>{item.total}件</span>
      </li>)}
    </ul>
    <div className="viz-scroll">
      {/* 1点あたり8px は確保する。90日ぶんを狭い画面に詰めると当たり判定が
          4px しかなくなり、指では押せない。足りないぶんは横スクロールにする。 */}
      <svg viewBox={`0 0 ${width} ${height}`} className="viz-svg"
        style={{ minWidth: `${Math.max(380, points.length * 8)}px` }} role="img"
        aria-label={`期間中の推移。新しい会員 ${totals[0].total}件、探しごと ${totals[1].total}件、紹介 ${totals[2].total}件。`}
        onPointerLeave={() => setHover(null)}>
        <defs><clipPath id={clip}><rect x={pad.left} y={pad.top} width={innerW} height={innerH} /></clipPath></defs>
        {ticks.map((value) => <g key={value}>
          <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="viz-grid" />
          <text x={pad.left - 7} y={y(value) + 4} className="viz-tick" textAnchor="end">{value}</text>
        </g>)}
        <g clipPath={`url(#${clip})`}>
          {series.map((item) => <polyline key={item.key} fill="none" stroke={item.color} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            points={points.map((point, index) => `${x(index)},${y(point[item.key])}`).join(' ')} />)}
        </g>
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((index, position, all) => all.indexOf(index) === position)
          .map((index) => <text key={index} x={x(index)} y={height - 8} className="viz-tick"
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>
            {points[index].date.slice(5).replace('-', '/')}
          </text>)}
        <line x1={x(shown)} x2={x(shown)} y1={pad.top} y2={pad.top + innerH} className="viz-cross" />
        {series.map((item) => <circle key={item.key} cx={x(shown)} cy={y(active[item.key])}
          r="4.5" fill={item.color} stroke="#fff" strokeWidth="2" />)}
        {/* さわる的は線より広く取る。指でも当たるように。
            スマホにはカーソルが無いので、pointer で拾う（マウスも指も同じ道）。 */}
        {points.map((point, index) => <rect key={point.date} x={x(index) - innerW / points.length / 2} y={pad.top}
          width={Math.max(6, innerW / points.length)} height={innerH} fill="transparent"
          onPointerEnter={() => setHover(index)} onPointerDown={() => setHover(index)}
          onTouchStart={() => setHover(index)} onFocus={() => setHover(index)} />)}
      </svg>
    </div>
    <figcaption className="viz-caption">
      <b>{active.date.replace(/-/g, '/')}</b>{hover === null && <em>（いちばん新しい日）</em>}
      <span className="viz-caption-values">新しい会員 {active.members}／探しごと {active.requests}／紹介 {active.introductions}</span>
      <small>グラフをなぞると、その日の数に変わります。</small>
    </figcaption>
  </figure>;
}

/** 横棒。順位を見せるためのもの。数字は必ず棒の外に書く。 */
export function BarList({ rows, unit = '件', color = 'var(--viz-1)' }: {
  rows: { label: string; value: number; note?: string }[]; unit?: string; color?: string;
}) {
  if (!rows.length) return <p className="viz-empty">まだ数字がありません。</p>;
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <ul className="viz-bars">
    {rows.map((row) => <li key={row.label}>
      <span className="viz-bar-label">{row.label}</span>
      <span className="viz-bar-track"><i style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: color }} /></span>
      <b className="viz-bar-value">{row.value.toLocaleString('ja-JP')}{unit}</b>
      {row.note && <small className="viz-bar-note">{row.note}</small>}
    </li>)}
  </ul>;
}
