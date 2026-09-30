import type { MeetingConversion } from '@/db/meeting-conversion';

const pct = (value: number, total: number) => total ? Math.round(value / total * 1000) / 10 : 0;

export default function MeetingConversionPanel({ data, loading }: { data: MeetingConversion | null; loading: boolean }) {
  if (loading || !data) return <section className="viz-card conversion-panel"><h2>例会からTASUKIへ</h2><p className="viz-empty">利用状況を集計しています…</p></section>;
  const steps = [
    { label: '例会で登録', value: data.people, detail: `${data.events}例会・新規アカウント ${data.newAccounts}人`, tone: 'base' },
    { label: '希望に回答', value: data.answered, detail: `登録者の ${pct(data.answered, data.people)}%`, tone: 'answer' },
    { label: 'TASUKIを開く', value: data.opened, detail: `登録者の ${pct(data.opened, data.people)}%`, tone: 'open' },
    { label: '投稿・オファー・送信', value: data.used, detail: `登録者の ${pct(data.used, data.people)}%`, tone: 'used' },
  ];
  return <section className="viz-card conversion-panel">
    <div className="viz-card-head">
      <div><p className="conversion-eyebrow">ACQUISITION → ACTIVATION</p><h2>例会からTASUKIへ</h2>
        <p className="viz-lead">例会で会社情報を登録した人が、その後どこまで使い始めたかを追跡します。</p></div>
      <span className="conversion-period">{data.includeTests ? '体験テストを含む' : '体験テストを除く'}</span>
    </div>
    {!data.people ? <p className="viz-empty">この期間の例会登録者はいません。テスト例会を確認する場合は上の切替をオンにしてください。</p>
      : <>
        <div className="conversion-overview">
          <div className="conversion-primary"><span>TASUKI利用開始率</span><strong>{pct(data.used, data.people)}<small>%</small></strong>
            <p>{data.people}人中 {data.used}人が投稿・オファー・メッセージ送信を行いました。</p></div>
          <ol className="conversion-steps">{steps.map((step, index) => <li key={step.label} className={`conversion-step ${step.tone}`}>
            <span className="conversion-step-index">0{index + 1}</span><span className="conversion-step-label">{step.label}</span>
            <strong>{step.value}<small>人</small></strong><span className="conversion-step-detail">{step.detail}</span>
            <span className="conversion-step-bar"><i style={{ width: `${pct(step.value, data.people)}%` }} /></span>
          </li>)}</ol>
        </div>
        <div className="conversion-extra"><span>プロフィールを自分で更新 <b>{data.profileUpdated}人</b></span><span>まだ投稿・送信していない人 <b>{data.people - data.used}人</b></span></div>
      </>}
    <div className="conversion-event-head"><h3>例会別の利用状況</h3><small>同じ人が複数の例会に参加した場合、上段は1人、下段は各例会で数えます</small></div>
    {!data.byEvent.length ? <p className="viz-empty">表示できる例会はありません。</p> :
      <div className="viz-table-wrap"><table className="viz-table conversion-table">
        <thead><tr><th>例会</th><th className="is-num">登録</th><th className="is-num">回答</th><th className="is-num">開いた</th><th>利用開始率</th></tr></thead>
        <tbody>{data.byEvent.map((event) => <tr key={event.id}>
          <td><b>{event.title}</b><small>{event.venue} · {event.date}</small></td>
          <td className="is-num">{event.people}</td><td className="is-num">{event.answered}</td><td className="is-num">{event.opened}</td>
          <td><div className="conversion-table-rate"><span className="conversion-table-bar"><i style={{ width: `${pct(event.used, event.people)}%` }} /></span><b>{pct(event.used, event.people)}%</b><small>{event.used}人</small></div></td>
        </tr>)}</tbody>
      </table></div>}
    <p className="viz-caption">期間は回答締切日で絞り込みます。「利用開始」は例会登録後の投稿・オファー・メッセージ送信です。TASUKIの閲覧とプロフィール更新は、この計測の導入後から記録します。過去の例会登録時刻がないものは、例会作成時刻を基準に集計しています。</p>
  </section>;
}
