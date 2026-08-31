'use client';

import { useEffect, useState } from 'react';
import type { AdminAd, AdminAnalytics, AdminFeedback, AdminMember, AdminRequest, AdminSummary } from '@/db/admin';
import { placementName } from '@/app/ad-options';
import { BarList, TrendChart } from './Charts';

type AdminData = {
  summary: AdminSummary; members: AdminMember[]; requests: AdminRequest[];
  ads: AdminAd[]; feedback: AdminFeedback[];
};

const tabs = [
  { key: 'analytics', label: '分析' },
  { key: 'members', label: '会員' },
  { key: 'requests', label: '投稿' },
  { key: 'ads', label: '広告' },
  { key: 'feedback', label: 'ご意見' },
] as const;

const categoryNames: Record<string, string> = {
  project: '案件', collaboration: '協業先', consultation: '相談',
};

export default function AdminClient({ adminName, adminEmail, serviceName, initial }: {
  adminName: string; adminEmail: string; serviceName: string; initial: AdminData;
}) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<(typeof tabs)[number]['key']>('analytics');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [range, setRange] = useState(90);
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  /** 消す前に必ず一度止める。取り消せない操作なので。 */
  const [confirming, setConfirming] = useState<AdminRequest | null>(null);

  // 分析は集計が重いので、そのタブを開いたときだけ読む。
  useEffect(() => {
    if (tab !== 'analytics') return;
    let alive = true;
    fetch(`/api/admin/analytics?days=${range}`).then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setAnalytics(data as AdminAnalytics); })
      .catch(() => {});
    return () => { alive = false; };
  }, [tab, range]);

  async function reload(nextKeyword = keyword) {
    const response = await fetch(`/api/admin/data?q=${encodeURIComponent(nextKeyword)}`);
    if (!response.ok) return say('読み込めませんでした。');
    setData(await response.json() as AdminData);
  }

  function say(message: string) {
    setNote(message);
    window.setTimeout(() => setNote(''), 3200);
  }

  /** 操作は全部これを通す。押している間はボタンを止めて、二度押しを防ぐ。 */
  async function act(id: string, path: string, body: unknown, method: 'POST' | 'DELETE', done: string) {
    setBusy(id);
    const response = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    setBusy('');
    if (!response.ok) return say(result.error ?? 'うまくいきませんでした。');
    await reload();
    say(done);
  }

  const { summary } = data;
  return <main className="admin">
    <header className="admin-header">
      <div>
        <p>ADMIN</p>
        <h1>{serviceName} 管理画面</h1>
      </div>
      <span className="admin-who">{adminName}</span>
    </header>

    <dl className="admin-summary">
      <div><dt>会員</dt><dd>{summary.members}</dd><small>利用中 {summary.activeMembers}／停止 {summary.suspendedMembers}</small></div>
      <div><dt>探しごと</dt><dd>{summary.requests}</dd><small>募集中 {summary.openRequests}</small></div>
      <div><dt>オファー</dt><dd>{summary.introductions}</dd><small>やり取り {summary.comments}</small></div>
      <div><dt>掲載中の広告</dt><dd>{summary.liveAds}</dd><small>未読のご意見 {summary.newFeedback}</small></div>
    </dl>

    <nav className="admin-tabs" aria-label="管理する対象">
      {tabs.map((item) => <button key={item.key} className={tab === item.key ? 'selected' : ''}
        onClick={() => setTab(item.key)} aria-pressed={tab === item.key}>
        {item.label}
        {item.key !== 'analytics' && <span>{item.key === 'members' ? data.members.length : item.key === 'requests' ? data.requests.length
          : item.key === 'ads' ? data.ads.length : data.feedback.filter((row) => row.status === 'new').length}</span>}
      </button>)}
    </nav>

    {tab === 'analytics' && <section className="viz-panel">
      <div className="viz-range" role="group" aria-label="集計する期間">
        {[30, 90, 365].map((value) => <button key={value} className={range === value ? 'selected' : ''}
          onClick={() => { setAnalytics(null); setRange(value); }} aria-pressed={range === value}>{value === 365 ? '1年' : `${value}日`}</button>)}
        <a className="viz-export" href="/api/admin/export?type=members">会員をCSVで書き出す</a>
      </div>

      {!analytics ? <p className="viz-empty">集計しています…</p> : <>
        <section className="viz-card">
          <h2>動きの推移</h2>
          <p className="viz-lead">この{analytics.days}日間で、会員・探しごと・オファーがどれだけ増えたか。</p>
          <TrendChart points={analytics.timeline} />
        </section>

        <section className="viz-card">
          <h2>オファーが生まれているか</h2>
          <p className="viz-lead">投稿がオファーにつながった割合。<b>この数字がこのサービスの成否そのものです。</b></p>
          <dl className="viz-kpis">
            <div><dt>オファーがついた投稿</dt><dd>{analytics.matching.hitRate}<small>%</small></dd>
              <small>{analytics.matching.requests}件中 {analytics.matching.withIntro}件</small></div>
            <div><dt>届いたオファー</dt><dd>{analytics.matching.introductions}<small>件</small></dd>
              <small>1投稿あたり {analytics.matching.requests ? (analytics.matching.introductions / analytics.matching.requests).toFixed(1) : '0.0'}件</small></div>
            <div><dt>最初のオファーまで</dt><dd>{analytics.matching.medianDaysToFirstIntro ?? '—'}<small>日</small></dd>
              <small>まん中の人の日数</small></div>
            <div><dt>有料の会員</dt><dd>{analytics.paidMembers}<small>人</small></dd>
              <small>広告 {analytics.revenue.reduce((sum, row) => sum + row.adCount, 0)}件</small></div>
          </dl>
        </section>

        <div className="viz-grid">
          <section className="viz-card">
            <h2>足りていない業種</h2>
            <p className="viz-lead"><b>探されている数から、その業種の会員数を引いた差</b>です。差が大きい業種ほど、次に誘うべき相手がはっきりしています。</p>
            <BarList color="var(--viz-2)" unit="" rows={analytics.industryGap.slice(0, 8).map((row) => ({
              label: row.industry, value: row.gap,
              note: `探されている ${row.wanted}件 ／ 会員 ${row.supply}人`,
            }))} />
          </section>

          <section className="viz-card">
            <h2>会場ごとの動き</h2>
            <p className="viz-lead">会員が多くても、探しごとが出ていない会場があります。顔を出す先を決めるのに使えます。</p>
            <BarList unit="人" rows={analytics.venues.slice(0, 8).map((row) => ({
              label: row.venue, value: row.members,
              note: `探しごと ${row.requests}件 ／ オファー ${row.introductions}件`,
            }))} />
          </section>
        </div>

        {analytics.revenue.length > 0 && <section className="viz-card">
          <h2>広告の売上</h2>
          <p className="viz-lead">申し込みのときに実際に請求した額です。あとから計算し直していないので、Stripeの数字と一致します。</p>
          <BarList color="var(--viz-3)" unit="円" rows={analytics.revenue.map((row) => ({
            label: row.month.replace('-', '年') + '月', value: row.adYen, note: `${row.adCount}件`,
          }))} />
        </section>}

        <section className="viz-card">
          <h2>動きが止まっている会員<span className="viz-count">{analytics.dormant.length}人</span></h2>
          <p className="viz-lead">30日以上、投稿もオファーもやり取りもしていない方です。<b>この一覧が、次に声をかける相手です。</b></p>
          <div className="viz-range">
            <a className="viz-export" href={`/api/admin/export?type=dormant&days=${range}`}>この一覧をCSVで書き出す</a>
          </div>
          {!analytics.dormant.length ? <p className="viz-empty">全員が動いています。</p>
            : <div className="viz-table-wrap">
              <table className="viz-table">
                <thead><tr><th>名前</th><th>会社</th><th>会場</th><th className="is-num">何日前</th></tr></thead>
                <tbody>{analytics.dormant.slice(0, 40).map((row) => <tr key={row.id}>
                  <td>{row.displayName}</td><td>{row.company || '—'}</td><td>{row.venue}</td>
                  <td className="is-num"><b>{row.daysSince}</b>日</td>
                </tr>)}</tbody>
              </table>
              {analytics.dormant.length > 40 && <p className="viz-more">ほか {analytics.dormant.length - 40}人。全員ぶんはCSVに入っています。</p>}
            </div>}
        </section>
      </>}
    </section>}

    {(tab === 'members' || tab === 'requests') && <form className="admin-search" onSubmit={(event) => { event.preventDefault(); reload(); }}>
      <input value={keyword} onChange={(event) => setKeyword(event.target.value)}
        placeholder={tab === 'members' ? '名前・会社・メール・会場で探す' : '見出し・本文・投稿者で探す'} />
      <button type="submit">探す</button>
      {!!keyword && <button type="button" className="admin-clear" onClick={() => { setKeyword(''); reload(''); }}>戻す</button>}
    </form>}

    {tab === 'members' && <ul className="admin-list">
      {!data.members.length && <li className="admin-empty">該当する会員がいません。</li>}
      {data.members.map((member) => <li key={member.id} className={member.canUse ? '' : 'is-off'}>
        <div className="admin-row-top">
          <b>{member.displayName || '(名前なし)'}</b>
          <span className={`admin-state ${member.canUse ? 'is-on' : 'is-off'}`}>{member.canUse ? '利用中' : '停止中'}</span>
        </div>
        <p className="admin-meta">
          <span>{member.company || '会社名なし'}</span><span>{member.venue}</span><span>{member.email}</span>
        </p>
        <p className="admin-meta">
          <span>プラン {member.plan === 'standard' ? 'スタンダード' : '無料'}</span>
          <span>オファー {member.introCount}件</span>
          <span>投稿 {member.requestCount}件</span>
          <span>{member.createdAt.slice(0, 10).replace(/-/g, '/')} 登録</span>
        </p>
        <div className="admin-actions">
          {/* 自分の行にはボタンを出さない。押しても断られるだけなので、
              押せるように見せない（サーバー側でも止めてある）。 */}
          {member.email.toLowerCase() === adminEmail.toLowerCase()
            ? <span className="admin-self">ご自身のアカウントです</span>
            : <button className={member.canUse ? 'is-danger' : ''} disabled={busy === member.id}
                onClick={() => act(member.id, `/api/admin/members/${member.id}`, { active: !member.canUse }, 'POST',
                  member.canUse ? '利用を止めました。' : '利用を戻しました。')}>
                {busy === member.id ? '…' : member.canUse ? '利用を止める' : '利用を戻す'}
              </button>}
        </div>
      </li>)}
    </ul>}

    {tab === 'requests' && <ul className="admin-list">
      {!data.requests.length && <li className="admin-empty">該当する投稿がありません。</li>}
      {data.requests.map((item) => <li key={item.id}>
        <div className="admin-row-top">
          <b>{item.title}</b>
          <span className="admin-state">{categoryNames[item.category] ?? item.category}</span>
        </div>
        <p className="admin-meta">
          <span>{item.authorName}</span><span>{item.authorEmail}</span>
        </p>
        <p className="admin-meta">
          <span>{item.status === 'closed' ? '募集終了' : '募集中'}</span>
          <span>期限 {item.deadline.replace(/-/g, '/')}</span>
          <span>オファー {item.introCount}件</span>
          <span>やり取り {item.commentCount}件</span>
          <span>{item.createdAt.slice(0, 10).replace(/-/g, '/')} 投稿</span>
        </p>
        <div className="admin-actions">
          <button className="is-danger" disabled={busy === item.id} onClick={() => setConfirming(item)}>削除する</button>
        </div>
      </li>)}
    </ul>}

    {tab === 'ads' && <ul className="admin-list">
      {!data.ads.length && <li className="admin-empty">まだ広告のお申し込みはありません。</li>}
      {data.ads.map((ad) => <li key={ad.id} className={ad.status === 'stopped' ? 'is-off' : ''}>
        <div className="admin-row-top">
          <b>{ad.title || '(入稿前)'}</b>
          <span className={`admin-state ${ad.status === 'stopped' ? 'is-off' : 'is-on'}`}>
            {ad.status === 'stopped' ? '停止中' : ad.status === 'reserved' ? '支払い待ち' : '掲載中'}
          </span>
        </div>
        <p className="admin-meta">
          <span>{ad.memberCompany || ad.memberName}</span>
          <span>{placementName(ad.placement)}</span>
          <span>{ad.startDate.replace(/-/g, '/')}〜{ad.endDate.replace(/-/g, '/')}</span>
        </p>
        <p className="admin-meta">
          <span>表示 {ad.viewCount.toLocaleString('ja-JP')}</span>
          <span>クリック {ad.clickCount.toLocaleString('ja-JP')}</span>
          {!!ad.linkUrl && <span>{ad.linkUrl.replace(/^https?:\/\//, '')}</span>}
        </p>
        <div className="admin-actions">
          <button className={ad.status === 'stopped' ? '' : 'is-danger'} disabled={busy === ad.id}
            onClick={() => act(ad.id, `/api/admin/ads/${ad.id}`, { stopped: ad.status !== 'stopped' }, 'POST',
              ad.status === 'stopped' ? '掲載を戻しました。' : '掲載を止めました。')}>
            {busy === ad.id ? '…' : ad.status === 'stopped' ? '掲載を戻す' : '掲載を止める'}
          </button>
        </div>
      </li>)}
    </ul>}

    {tab === 'feedback' && <ul className="admin-list">
      {!data.feedback.length && <li className="admin-empty">まだご意見は届いていません。</li>}
      {data.feedback.map((row) => <li key={row.id} className={row.status === 'new' ? '' : 'is-off'}>
        <div className="admin-row-top">
          <b>{row.category}</b>
          <span className={`admin-state ${row.status === 'new' ? 'is-new' : 'is-off'}`}>{row.status === 'new' ? '未読' : '読んだ'}</span>
        </div>
        <p className="admin-body">{row.body}</p>
        <p className="admin-meta">
          <span>{row.memberName}</span><span>{row.memberEmail}</span>
          <span>{row.createdAt.slice(0, 10).replace(/-/g, '/')}</span>
        </p>
        <div className="admin-actions">
          <button disabled={busy === row.id}
            onClick={() => act(row.id, `/api/admin/feedback/${row.id}`, { done: row.status === 'new' }, 'POST',
              row.status === 'new' ? '読んだ印を付けました。' : '未読に戻しました。')}>
            {busy === row.id ? '…' : row.status === 'new' ? '読んだ印を付ける' : '未読に戻す'}
          </button>
        </div>
      </li>)}
    </ul>}

    {confirming && <div className="admin-confirm-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirming(null); }}>
      <div className="admin-confirm" role="dialog" aria-modal="true">
        <h2>この投稿を削除しますか</h2>
        <p><b>{confirming.title}</b></p>
        <p>{confirming.authorName}さんの投稿です。届いたオファー {confirming.introCount}件と、やり取り {confirming.commentCount}件も一緒に消えます。<b>元に戻せません。</b></p>
        <button className="is-danger" disabled={busy === confirming.id}
          onClick={() => { const target = confirming; setConfirming(null); act(target.id, `/api/admin/requests/${target.id}`, null, 'DELETE', '投稿を削除しました。'); }}>削除する</button>
        <button onClick={() => setConfirming(null)}>やめる</button>
      </div>
    </div>}

    {!!note && <p className="admin-note" role="status">{note}</p>}
  </main>;
}
