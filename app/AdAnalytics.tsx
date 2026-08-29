'use client';

import { useMemo, useState } from 'react';
import type { AdDay, AdSlot } from '@/db/data';

// 出稿した人が「効いたのか」を読み取るところ。
//
// 表示とクリックは桁が違うので、1つのグラフに2本の軸を置かない。
// 同じ日付の目盛りを共有した2枚の棒グラフに分ける（読み違えようがない形）。
// 数字だけで見たい人のために、表も出せるようにしてある。

type Props = { slot: AdSlot; days: AdDay[] };

const BLUE = '#1478d6';
const ORANGE = '#f4501e';

export default function AdAnalytics({ slot, days }: Props) {
  const [asTable, setAsTable] = useState(false);
  const summary = useMemo(() => {
    const views = days.reduce((total, day) => total + day.views, 0);
    const clicks = days.reduce((total, day) => total + day.clicks, 0);
    const best = days.reduce<AdDay | null>((top, day) => (!top || day.views > top.views ? day : top), null);
    return { views, clicks, best, rate: views ? Math.round((clicks / views) * 1000) / 10 : 0 };
  }, [days]);

  if (!days.length) {
    return <p className="ad-analytics-empty">掲載開始日から、日ごとの実績を記録します。</p>;
  }

  return <section className="ad-analytics" aria-label="掲載の成果">
    <p className="ad-analytics-lead">
      <b>{summary.views.toLocaleString('ja-JP')}人</b>に表示され、<b>{summary.clicks.toLocaleString('ja-JP')}回</b>クリックされました
      <span>掲載期間 {formatRange(slot.startDate, slot.endDate)}／集計 {days.length}日分</span>
    </p>
    <ul className="ad-analytics-facts">
      <li><b>{summary.rate}%</b><span>クリック率</span></li>
      <li><b>{Math.round(summary.views / days.length)}人</b><span>1日あたりの平均表示数</span></li>
      {summary.best && summary.best.views > 0 && <li><b>{formatDay(summary.best.date)}</b><span>最も表示された日（{summary.best.views}人）</span></li>}
    </ul>

    {asTable
      ? <table className="ad-analytics-table">
          <thead><tr><th>日付</th><th>表示</th><th>クリック</th></tr></thead>
          <tbody>{[...days].reverse().map((day) => <tr key={day.date}>
            <td>{formatDay(day.date)}</td>
            <td>{day.views.toLocaleString('ja-JP')}</td>
            <td>{day.clicks.toLocaleString('ja-JP')}</td>
          </tr>)}</tbody>
        </table>
      : <>
          <DayBars title="表示された人数" days={days} pick={(day) => day.views} color={BLUE} unit="人" />
          <DayBars title="クリック数" days={days} pick={(day) => day.clicks} color={ORANGE} unit="回" compact />
        </>}

    <button className="ad-analytics-toggle" onClick={() => setAsTable(!asTable)}>{asTable ? 'グラフで表示' : '数値で表示'}</button>
  </section>;
}

/**
 * 1日1本の棒。棒は24pxまでで、あいだは背景色の2pxで空ける。
 * 目盛りの数字は端だけに置く。全部に付けると読まれなくなる。
 */
function DayBars({ title, days, pick, color, unit, compact }: {
  title: string; days: AdDay[]; pick: (day: AdDay) => number; color: string; unit: string; compact?: boolean;
}) {
  const [hover, setHover] = useState(-1);
  const values = days.map(pick);
  const top = Math.max(1, ...values);
  const height = compact ? 54 : 96;
  const slot = 100 / days.length;
  const barWidth = Math.min(slot * 0.72, 4.4);
  const peak = values.indexOf(top);

  return <figure className="ad-chart">
    <figcaption><span>{title}</span><b>{top.toLocaleString('ja-JP')}{unit}</b></figcaption>
    <div className="ad-chart-plot" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={`${title}の日ごとの推移`}>
        <line x1="0" y1={height - 0.5} x2="100" y2={height - 0.5} stroke="#e2e8f2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {days.map((day, index) => {
          const value = pick(day);
          const barHeight = value === 0 ? 0 : Math.max(2, (value / top) * (height - 6));
          return <rect key={day.date}
            x={slot * index + (slot - barWidth) / 2} y={height - barHeight}
            width={barWidth} height={barHeight} rx="1.6"
            fill={color} opacity={hover === -1 || hover === index ? 1 : 0.32} />;
        })}
      </svg>
      {/* 指で押しやすいように、当たり判定は棒より広く取る */}
      <div className="ad-chart-hit">{days.map((day, index) => <button key={day.date} type="button"
        aria-label={`${formatDay(day.date)} ${pick(day)}${unit}`}
        onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(-1)}
        onFocus={() => setHover(index)} onBlur={() => setHover(-1)} />)}</div>
      {hover >= 0 && <span className="ad-chart-tip" style={{ left: `${Math.min(88, Math.max(2, slot * hover))}%` }}>
        <b>{formatDay(days[hover].date)}</b>{pick(days[hover]).toLocaleString('ja-JP')}{unit}
      </span>}
    </div>
    <p className="ad-chart-axis">
      <span>{formatDay(days[0].date)}</span>
      {days.length > 2 && peak > 0 && peak < days.length - 1 && <span className="ad-chart-peak">{formatDay(days[peak].date)}</span>}
      <span>{formatDay(days[days.length - 1].date)}</span>
    </p>
  </figure>;
}

function formatDay(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export function formatRange(startDate: string, endDate: string) {
  const [, sm, sd] = startDate.split('-');
  const [, em, ed] = endDate.split('-');
  return `${Number(sm)}月${Number(sd)}日〜${Number(em)}月${Number(ed)}日`;
}
