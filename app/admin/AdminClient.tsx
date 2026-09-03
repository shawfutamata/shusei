'use client';

import { useEffect, useState } from 'react';
import type { AdminAd, AdminAnalytics, AdminFeedback, AdminMember, AdminRequest, AdminSummary } from '@/db/admin';
import type { BackupEntry } from '@/db/backup';
import { placementName } from '@/app/ad-options';
import { rankNames } from '@/app/rank-perks';
import BrandMark from '@/app/BrandMark';
import { BarList, TrendChart } from './Charts';

type GachaSummary = {
  name: string; open: boolean; period: string; draws: number; people: number;
  givenDays: number; capDays: number; memberCapDays: number; usedDays: number;
  seasons: { key: string; name: string; draws: number; days: number }[];
};

type AdminData = {
  summary: AdminSummary; members: AdminMember[]; requests: AdminRequest[];
  ads: AdminAd[]; feedback: AdminFeedback[]; gacha?: GachaSummary;
};

// short は、下の帯に出す短い呼び名。狭いところで「ダッシュボ…」と
// 切れてしまうので、切るのではなく別の言葉にする。
const tabs = [
  { key: 'analytics', label: 'ダッシュボード', short: 'ホーム' },
  { key: 'members', label: '会員' },
  { key: 'requests', label: '投稿' },
  { key: 'ads', label: '広告' },
  { key: 'feedback', label: 'ご意見' },
  { key: 'backup', label: 'バックアップ', short: '控え' },
] as const;

const categoryNames: Record<string, string> = {
  project: '発注先', collaboration: '協業先', consultation: '相談',
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
  /** 置いてあるデータの控え。バックアップのタブを開いたときに読む。 */
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);
  /** スマホでのメニューの開け閉め。パソコンの幅では常に出ているので関係ない。 */
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * ごみ箱を開いているか。**止めたものだけを見る画面。**
   * ふだんの一覧に混ぜておくと、いま動いているものが何件かを数えにくい。
   */
  const [trashOpen, setTrashOpen] = useState(false);

  // 分析は集計が重いので、そのタブを開いたときだけ読む。
  useEffect(() => {
    if (tab !== 'analytics') return;
    let alive = true;
    fetch(`/api/admin/analytics?days=${range}`).then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setAnalytics(data as AdminAnalytics); })
      .catch(() => {});
    return () => { alive = false; };
  }, [tab, range]);

  /**
   * タブを移す。**移ったらごみ箱は閉じる。**
   * 開いたままだと、押したタブに何も無いように見えてしまう。
   */
  function goTab(key: (typeof tabs)[number]['key']) {
    setTab(key);
    setTrashOpen(false);
  }

  async function reload(nextKeyword = keyword) {
    const response = await fetch(`/api/admin/data?q=${encodeURIComponent(nextKeyword)}`);
    if (!response.ok) return say('読み込めませんでした。');
    setData(await response.json() as AdminData);
  }

  /** ログアウト。セッションを消してから、掲示板のトップへ戻す。 */
  async function signOut() {
    if (busy) return;
    setBusy('signout');
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch { /* 通信に失敗しても、下で開き直せば入り直しになる */ }
    window.location.assign('/');
  }

  // バックアップのタブを開いたときだけ読む。ほかの画面には要らない。
  useEffect(() => {
    if (tab !== 'backup' || backups) return;
    let alive = true;
    fetch('/api/admin/backup?list=1').then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (alive && payload) setBackups((payload as { backups: BackupEntry[] }).backups ?? []); })
      .catch(() => { if (alive) setBackups([]); });
    return () => { alive = false; };
  }, [tab, backups]);

  // いま開いているタブに、止めたものが何件あるか。無いタブではごみ箱を出さない。
  const trashCount = tab === 'members' ? data.members.filter((member) => !member.canUse).length
    : tab === 'ads' ? data.ads.filter((ad) => ad.status === 'stopped').length : 0;

  const liveMembers = data.members.filter((member) => member.canUse);
  const stoppedMembers = data.members.filter((member) => !member.canUse);
  /** 会員1件の行。使っている人と止めた人で、同じ形で並べる。 */
  // 実効プランが「なぜ」そうなっているか。キャンペーン中は全員が
  // スタンダードになるので、これが無いと本当の課金者が見えなくなる。
  const planWhy: Record<AdminMember['planSource'], string> = {
    contract: '（ご契約）', bonus: '（招待特典）', campaign: '（キャンペーン）',
    admin: '（管理者特典）', none: '',
  };

  const memberRow = (member: AdminMember) => <li key={member.id} className={member.canUse ? '' : 'is-off'}>
    <div className="admin-row-top">
      <b>{member.displayName || '(名前なし)'}</b>
      <span className={`admin-state ${member.canUse ? 'is-on' : 'is-off'}`}>{member.canUse ? '利用中' : '停止中'}</span>
    </div>
    <p className="admin-meta">
      <span>{member.company || '会社名なし'}</span><span>{member.email}</span>
    </p>
    <p className="admin-meta">
      <span>プラン {member.plan === 'standard' ? 'スタンダード' : '無料'}{planWhy[member.planSource]}</span>
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
  </li>;

  const liveAds = data.ads.filter((ad) => ad.status !== 'stopped');
  const stoppedAds = data.ads.filter((ad) => ad.status === 'stopped');
  /** 広告1件の行。動いているものと止めたもので、同じ形で並べる。 */
  const adRow = (ad: AdminAd) => <li key={ad.id} className={ad.status === 'stopped' ? 'is-off' : ''}>
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
  </li>;

  /** いますぐ控えを取る。取れたら一覧を読み直して、増えたことが見えるようにする。 */
  async function takeBackup() {
    setBusy('backup');
    try {
      const response = await fetch('/api/admin/backup', { method: 'POST' });
      const payload = await response.json() as { rows?: number; tables?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? '取れませんでした。');
      say(`控えを取りました（${payload.tables}個の表・${payload.rows}件）。`);
      setBackups(null);
    } catch (error) {
      say(error instanceof Error ? error.message : '取れませんでした。');
    } finally { setBusy(''); }
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

  const { summary, gacha } = data;
  const countFor = (key: (typeof tabs)[number]['key']) => key === 'members' ? data.members.length
    : key === 'requests' ? data.requests.length : key === 'ads' ? data.ads.length
    : key === 'feedback' ? data.feedback.filter((row) => row.status === 'new').length : 0;
  // 要対応。**数を並べるだけにしない。** 押すとその一覧へ飛ぶ、次の手が決まっている
  // ものだけを置く。数が0のものは出さない（片付いた列は見る必要がない）。
  const waitingRequests = data.requests.filter((row) => row.status === 'open' && row.introCount === 0).length;
  const queue = [
    { key: 'feedback', tone: 'is-red', icon: 'feedback', label: '未読のご意見', value: summary.newFeedback, to: 'feedback' as const },
    { key: 'waiting', tone: 'is-amber', icon: 'requests', label: 'オファーがまだ0件の募集', value: waitingRequests, to: 'requests' as const },
    { key: 'off', tone: 'is-blue', icon: 'members', label: '停止中の会員', value: summary.suspendedMembers, to: 'members' as const },
  ].filter((row) => row.value > 0);
  // よく動いている会員。順位と棒で出す。棒の長さは1位を100%とした割合。
  const ranking = [...data.members]
    .map((row) => ({ ...row, score: row.introCount + row.requestCount }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const topScore = ranking[0]?.score ?? 1;
  const today = new Date();
  const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日（${'日月火水木金土'[today.getDay()]}）時点`;

  return <div className="admin-shell">
    {/* スマホでメニューを開いているあいだの覆い。**押せば閉じる。**
        引き出しの外を押して閉じられないと、出口が「×」だけになる。 */}
    {menuOpen && <button className="admin-side-veil" aria-label="メニューを閉じる" onClick={() => setMenuOpen(false)} />}
    <aside className={`admin-side${menuOpen ? ' is-open' : ''}`}>
      <div className="admin-brand"><BrandMark className="admin-brand-mark" /><b>{serviceName} 管理</b></div>
      <nav className="admin-side-nav" aria-label="管理する対象">
        {tabs.map((item) => <button key={item.key} className={tab === item.key ? 'selected' : ''}
          onClick={() => { goTab(item.key); setMenuOpen(false); }} aria-pressed={tab === item.key}>
          <SideIcon name={item.key} />
          <span className="admin-nav-long">{item.label}</span>
          <span className="admin-nav-short">{'short' in item ? item.short : item.label}</span>
          {countFor(item.key) > 0 && <em>{countFor(item.key)}</em>}
        </button>)}
      </nav>
      <div className="admin-side-foot"><span>管</span><div><b>{adminName}</b><small>{adminEmail}</small></div></div>
    </aside>

    <main className="admin">
    <header className="admin-header">
      {/* スマホだけに出る入口。パソコンの幅では左に帯が出ているので隠す。 */}
      <button className="admin-menu-toggle" onClick={() => setMenuOpen(true)}
        aria-label="メニューを開く" aria-expanded={menuOpen}>
        <span /><span /><span />
      </button>
      <div>
        <h1>{tabs.find((item) => item.key === tab)?.label}</h1>
        <p>{adminName}さん、こんにちは — {dateLabel}</p>
      </div>
      <div className="admin-header-actions">
        {/* 止めたものはここにしまう。件数を肩に出して、中身があることが
            開かなくても分かるようにする。 */}
        {trashCount > 0 && <button className={`admin-trash${trashOpen ? ' is-open' : ''}`}
          onClick={() => setTrashOpen((open) => !open)} aria-pressed={trashOpen}
          aria-label={`ごみ箱（${trashCount}件）`} title={`ごみ箱（${trashCount}件）`}>
          <TrashMark /><em>{trashCount}</em>
        </button>}
        <button className="admin-open-site" onClick={() => reload().then(() => say('最新の状態にしました。'))}
          aria-label="再読み込み" title="再読み込み"><ReloadMark /></button>
        <button className="admin-signout" onClick={signOut} disabled={busy === 'signout'}>{busy === 'signout' ? '…' : 'ログアウト'}</button>
      </div>
    </header>

    {tab === 'analytics' && <section className="viz-panel">
      <dl className="admin-kpis">
        <div><dt>累計会員数</dt><dd>{yen0(summary.members)}<small>人</small></dd><small>利用中 {summary.activeMembers}／停止 {summary.suspendedMembers}</small></div>
        <div><dt>課金している会員</dt><dd>{yen0(summary.paidMembers)}<small>人</small></dd>
          <small>月払い {summary.monthlyPayers}／年払い {summary.yearlyPayers}{summary.members ? `・全体の${Math.round((summary.paidMembers / summary.members) * 1000) / 10}%` : ''}</small></div>
        <div><dt>毎月のサブスク売上</dt><dd>{money(summary.mrrYen)}</dd>
          <small>いまの契約が続いた場合の月あたり。年払いは12で割っています</small></div>
        <div><dt>広告の累計売上</dt><dd>{money(summary.adRevenueTotalYen)}</dd>
          <small>今月 {money(summary.adRevenueThisMonthYen)}・掲載中 {summary.liveAds}件</small></div>
        <div><dt>累計の案件</dt><dd>{yen0(summary.requests)}<small>件</small></dd><small>募集中 {summary.openRequests}</small></div>
        <div><dt>届いたオファー</dt><dd>{yen0(summary.introductions)}<small>件</small></dd><small>オファー {summary.offers}・リファラル {summary.referrals}・未読のご意見 {summary.newFeedback}</small></div>
      </dl>

      <section className="viz-card">
        <div className="viz-card-head">
          <div><h2>ランク別の会員数</h2>
            <p className="viz-lead">ランクは<b>招待して参加した仲間の人数</b>で上がります。上に行くほど、場そのものを大きくした人です。</p></div>
        </div>
        <div className="admin-ranks">{rankNames.map((name, index) => {
          const count = summary.rankCounts[index] ?? 0;
          return <div key={name} className={`admin-rank-box rank-${index + 1}`}>
            <p>{name}</p><b>{yen0(count)}<small>人</small></b>
            <span>{summary.members ? Math.round((count / summary.members) * 1000) / 10 : 0}%</span>
          </div>;
        })}</div>
      </section>

      <div className="admin-columns">
        <section className="viz-card">
          <div className="viz-card-head">
            <div><h2>動きの推移</h2><p className="viz-lead">この{range}日間で、会員・案件・オファーがどれだけ増えたか。</p></div>
            <div className="viz-range" role="group" aria-label="集計する期間">
              {[30, 90, 365].map((value) => <button key={value} className={range === value ? 'selected' : ''}
                onClick={() => { setAnalytics(null); setRange(value); }} aria-pressed={range === value}>{value === 365 ? '1年' : `${value}日`}</button>)}
            </div>
          </div>
          {analytics ? <TrendChart points={analytics.timeline} /> : <p className="viz-empty">集計しています…</p>}
        </section>

        <div className="admin-aside">
          <section className="viz-card admin-queue">
            <div className="viz-card-head"><h2>要対応</h2><span className="admin-queue-count">{queue.length}件のキュー</span></div>
            {!queue.length ? <p className="viz-empty">いまは手が空いています。</p>
              : <ul>{queue.map((row) => <li key={row.key}>
                <button onClick={() => goTab(row.to)}>
                  <i className={row.tone}><SideIcon name={row.icon} /></i>
                  <span>{row.label}</span>
                  <b className={row.tone}>{row.value.toLocaleString('ja-JP')}</b>
                  <em aria-hidden="true">›</em>
                </button>
              </li>)}</ul>}
          </section>

          <section className="viz-card admin-mini">
            <div><p>掲載中の広告</p><b>{summary.liveAds}</b></div>
            <button onClick={() => goTab('ads')}>一覧へ</button>
          </section>

          {/* ガチャで配った枠。**引いた数より「何日配ったか」が大事。**
              配った日数のぶんだけ、売れる枠が減っている。 */}
          {gacha && (gacha.open || gacha.draws > 0) && <section className="viz-card">
            <h2>{gacha.name}{gacha.open ? <span className="viz-count">開催中</span> : <span className="viz-count">{gacha.period}</span>}</h2>
            <p className="viz-lead">引いた人 <b>{gacha.people}人</b>／のべ <b>{gacha.draws}回</b>／配った枠 <b>{gacha.givenDays}日</b>
              （上限 {gacha.capDays}日・1人{gacha.memberCapDays}日まで・うち掲載に使われた {gacha.usedDays}日）</p>
            <ul className="admin-gacha">{gacha.seasons.map((season) => <li key={season.key}>
              <span>{season.name}</span><b>{season.draws}回・{season.days}日</b>
            </li>)}</ul>
          </section>}
        </div>
      </div>

      <section className="viz-card">
        <div className="viz-card-head">
          <div><h2>よく動いている会員</h2><p className="viz-lead">オファーと投稿の合計です。<b>場を回している人が誰かが分かります。</b></p></div>
          <a className="viz-export" href="/api/admin/export?type=members">会員をCSVで書き出す</a>
        </div>
        {!ranking.length ? <p className="viz-empty">まだ動きがありません。</p>
          : <ol className="admin-rank">{ranking.map((row, index) => <li key={row.id}>
            <i>{index + 1}</i>
            <div className="admin-rank-who"><b>{row.displayName || '(名前なし)'}</b><small>{row.company || '会社名なし'}</small></div>
            <div className="admin-rank-bar"><span style={{ width: `${Math.round((row.score / topScore) * 100)}%` }} /></div>
            <div className="admin-rank-num"><b>{row.score}</b><small>オファー {row.introCount}・投稿 {row.requestCount}</small></div>
          </li>)}</ol>}
      </section>

      {!analytics ? null : <>
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

        <section className="viz-card">
          <h2>足りていない業種</h2>
          <p className="viz-lead"><b>探されている数から、その業種の会員数を引いた差</b>です。差が大きい業種ほど、次に誘うべき相手がはっきりしています。</p>
          <BarList color="var(--viz-2)" unit="" rows={analytics.industryGap.slice(0, 8).map((row) => ({
            label: row.industry, value: row.gap,
            note: `探されている ${row.wanted}件 ／ 会員 ${row.supply}人`,
          }))} />
        </section>

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
                <thead><tr><th>名前</th><th>会社</th><th className="is-num">何日前</th></tr></thead>
                <tbody>{analytics.dormant.slice(0, 40).map((row) => <tr key={row.id}>
                  <td>{row.displayName}</td><td>{row.company || '—'}</td>
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
        placeholder={tab === 'members' ? '名前・会社・メールで探す' : '見出し・本文・投稿者で探す'} />
      <button type="submit">探す</button>
      {!!keyword && <button type="button" className="admin-clear" onClick={() => { setKeyword(''); reload(''); }}>戻す</button>}
    </form>}

    {/* 広告と同じ形。**上の一覧はいま使っている人だけ。** 止めた人が混ざって
        いると「利用を戻す」が並んで、誰が動いている会員なのか分からなくなる。 */}
    {tab === 'members' && (trashOpen
      ? <section className="admin-archive">
        <h2>停止中の会員<span>{stoppedMembers.length}人</span></h2>
        <p>利用を止めた方です。データは残っているので、ここから戻せます。</p>
        <ul className="admin-list">
          {!stoppedMembers.length && <li className="admin-empty">停止中の会員はいません。</li>}
          {stoppedMembers.map(memberRow)}
        </ul>
        <button className="admin-archive-back" onClick={() => setTrashOpen(false)}>利用中の一覧に戻る</button>
      </section>
      : <ul className="admin-list">
        {!data.members.length && <li className="admin-empty">該当する会員がいません。</li>}
        {data.members.length > 0 && !liveMembers.length && <li className="admin-empty">いま使っている会員はいません。</li>}
        {liveMembers.map(memberRow)}
      </ul>)}

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
          <span>リファラル {item.referralCount}件</span>
          <span>{item.createdAt.slice(0, 10).replace(/-/g, '/')} 投稿</span>
        </p>
        <div className="admin-actions">
          <button className="is-danger" disabled={busy === item.id} onClick={() => setConfirming(item)}>削除する</button>
        </div>
      </li>)}
    </ul>}

    {/* 止めた枠は下にまとめる。**上の一覧はいま動いているものだけ。**
        混ぜてあると「掲載を戻す」が並んで、どれが生きている枠なのか一目で
        分からなかった。戻す操作は、下のまとまりの中だけに置く。 */}
    {tab === 'ads' && (trashOpen
      ? <section className="admin-archive">
        <h2>停止中の広告<span>{stoppedAds.length}件</span></h2>
        <p>掲載を止めたものです。消えてはいないので、ここから戻せます。</p>
        <ul className="admin-list">
          {!stoppedAds.length && <li className="admin-empty">停止中の広告はありません。</li>}
          {stoppedAds.map(adRow)}
        </ul>
        <button className="admin-archive-back" onClick={() => setTrashOpen(false)}>掲載中の一覧に戻る</button>
      </section>
      : <ul className="admin-list">
        {!data.ads.length && <li className="admin-empty">まだ広告のお申し込みはありません。</li>}
        {data.ads.length > 0 && !liveAds.length && <li className="admin-empty">いま動いている広告はありません。</li>}
        {liveAds.map(adRow)}
      </ul>)}

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

    {tab === 'backup' && <section className="viz-panel">
      <section className="viz-card">
        <div className="viz-card-head">
          <div>
            <h2>データの控え</h2>
            <p className="viz-lead">会員の名簿、案件、オファーのやり取り、お支払いの記録。
              <b>一度消えると元に戻せないものです。</b>毎日いちど、自動で写しを取っています。</p>
          </div>
          <button className="viz-export" onClick={takeBackup} disabled={busy === 'backup'}>
            {busy === 'backup' ? '取っています…' : 'いますぐ控えを取る'}
          </button>
        </div>

        {/* 守りが3枚あることを、押す前に分かるようにしておく。 */}
        <ol className="backup-layers">
          <li><b>Cloudflareが自動で持っている控え</b>
            <small>直近30日なら、どの時点にも戻せます（Time Travel）。設定はいりません。</small></li>
          <li><b>毎日のR2への写し</b>
            <small>下の一覧です。表ごと消してしまったときは、ここから戻します。</small></li>
          <li><b>お手元へのダウンロード</b>
            <small>Cloudflareのアカウントそのものを失う事故に備えられるのは、これだけです。
              月にいちど、パソコンかご自身のクラウドに1本落としておいてください。</small></li>
        </ol>

        <div className="backup-download">
          <a className="viz-export" href="/api/admin/backup">いまの中身をダウンロード</a>
        </div>

        {backups === null ? <p className="viz-empty">読み込んでいます…</p>
          : !backups.length ? <p className="viz-empty">まだ控えがありません。上の「いますぐ控えを取る」を押してください。</p>
          : <div className="viz-table-wrap">
            <table className="viz-table">
              <thead><tr><th>日付</th><th className="is-num">大きさ</th><th>取った時刻</th><th /></tr></thead>
              <tbody>{backups.map((row) => <tr key={row.key}>
                <td>{row.date.replace(/-/g, '/')}</td>
                <td className="is-num">{formatSize(row.size)}</td>
                <td>{new Date(row.uploadedAt).toLocaleString('ja-JP')}</td>
                <td><a href={`/api/admin/backup?date=${row.date}`}>ダウンロード</a></td>
              </tr>)}</tbody>
            </table>
          </div>}
        <p className="viz-lead">直近30日ぶんは毎日、それより古いものは月初の1本だけを1年間残します。</p>
      </section>
    </section>}

    {confirming && <div className="admin-confirm-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirming(null); }}>
      <div className="admin-confirm" role="dialog" aria-modal="true">
        <h2>この投稿を削除しますか</h2>
        <p><b>{confirming.title}</b></p>
        <p>{confirming.authorName}さんの投稿です。届いたオファーとリファラル {confirming.introCount}件、それに付いたやり取りも一緒に消えます。<b>元に戻せません。</b></p>
        <button className="is-danger" disabled={busy === confirming.id}
          onClick={() => { const target = confirming; setConfirming(null); act(target.id, `/api/admin/requests/${target.id}`, null, 'DELETE', '投稿を削除しました。'); }}>削除する</button>
        <button onClick={() => setConfirming(null)}>やめる</button>
      </div>
    </div>}

    {!!note && <p className="admin-note" role="status">{note}</p>}
    </main>
  </div>;
}

/** 3桁ごとに区切った数。 */
function yen0(value: number) { return value.toLocaleString('ja-JP'); }
/** 金額。「約」は付けない。見込みかどうかは、カードの下の一行で言う。 */
function money(value: number) { return `¥${value.toLocaleString('ja-JP')}`; }

/** 左の帯に出す印。線だけの形にして、選んでいるものだけ色が乗る。 */
/** ごみ箱。止めたものをしまってある場所。 */
function TrashMark() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16" />
    <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
    <path d="M6.4 7l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.4a1.6 1.6 0 0 0 1.6-1.5l.8-12" />
    <path d="M10.4 11v6M13.6 11v6" />
  </svg>;
}

/** 再読み込み。丸い矢印1本。文字より小さく置けて、意味も伝わる。 */
function ReloadMark() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v5h-5" />
  </svg>;
}

/** ファイルの大きさ。桁を読むより「だいたいどれくらい」が分かればよい。 */
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function SideIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    analytics: <><path d="M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z" /></>,
    members: <><circle cx="9" cy="8" r="3.4" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 010 5.6M17.5 15c2.2.5 3.5 2 3.5 5" /></>,
    requests: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 10h8M8 14h5" /></>,
    ads: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8" /></>,
    feedback: <><path d="M4 5h16v11H9l-5 4z" /></>,
    // 金庫。控えがしまってある場所、という気持ちで。
    backup: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><circle cx="12" cy="12" r="3.2" /><path d="M12 7.6v1.2M12 15.2v1.2" /></>,
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
