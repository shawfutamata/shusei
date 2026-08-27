'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { BoardRequest, IntroductionItem, MemberStats } from '@/db/data';

type View = 'board' | 'introductions' | 'ranking';
type Leader = MemberStats & { position: number };

const categories = {
  project: { label: '案件・発注先', className: 'project' },
  collaboration: { label: '協業パートナー', className: 'collab' },
  consultation: { label: '相談・情報', className: 'consultation' },
};

const statusLabels: Record<string, string> = {
  proposed: '紹介先へ確認中', connected: 'おつなぎ済み', meeting: '商談中', won: '成約', not_fit: '今回は見送り',
};

export default function BoardClient({ initialRequests, initialStats, userName }: { initialRequests: BoardRequest[]; initialStats: MemberStats; userName: string }) {
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [view, setView] = useState<View>('board');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<'request' | 'intro' | null>(null);
  const [selected, setSelected] = useState<BoardRequest | null>(null);
  const [introductions, setIntroductions] = useState<IntroductionItem[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const shown = useMemo(() => filter === 'all' ? requests : requests.filter((item) => item.category === filter), [filter, requests]);
  const counts = (category: string) => category === 'all' ? requests.length : requests.filter((item) => item.category === category).length;
  const progress = stats.nextRankAt > stats.points ? Math.min(100, Math.round((stats.points / stats.nextRankAt) * 100)) : 100;

  async function refreshBoard() {
    const response = await fetch('/api/board');
    if (!response.ok) return;
    const data = await response.json() as { requests: BoardRequest[]; stats: MemberStats };
    setRequests(data.requests); setStats(data.stats);
  }

  async function switchView(next: View) {
    setView(next);
    if (next === 'introductions') {
      const response = await fetch('/api/introductions');
      if (response.ok) setIntroductions(((await response.json()) as { introductions: IntroductionItem[] }).introductions);
    }
    if (next === 'ranking') {
      const response = await fetch('/api/leaderboard');
      if (response.ok) setLeaders(((await response.json()) as { leaderboard: Leader[] }).leaderboard);
    }
  }

  function openIntro(item: BoardRequest) { setSelected(item); setModal('intro'); }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/board', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? '投稿できませんでした。');
    setModal(null); form.reset(); await refreshBoard(); showToast('探しごとを投稿しました。仲間からの紹介を待ちましょう。');
  }

  async function submitIntroduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true);
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/introductions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...raw, requestId: selected.id, consentConfirmed: raw.consentConfirmed === 'on' }) });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? '紹介を登録できませんでした。');
    setModal(null); form.reset(); await refreshBoard(); showToast('紹介を届けました。GIVEポイントが10pt加算されました。');
  }

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 4200); }

  return (
    <main>
      <header className="topbar">
        <button className="brand brand-button" onClick={() => switchView('board')} aria-label="GIVE HUB ホーム"><span className="brand-mark">G</span><span><b>GIVE HUB</b><small>つながりが、商売をひろげる。</small></span></button>
        <nav className="main-nav" aria-label="メインメニュー">
          <button className={view === 'board' ? 'active' : ''} onClick={() => switchView('board')}>探しごと</button>
          <button className={view === 'introductions' ? 'active' : ''} onClick={() => switchView('introductions')}>紹介した案件</button>
          <button className={view === 'ranking' ? 'active' : ''} onClick={() => switchView('ranking')}>ランキング</button>
        </nav>
        <div className="top-actions"><span className="mini-avatar">{userName.slice(0, 1)}</span><span className="user-name">{userName}</span><a className="signout" href="/signout-with-chatgpt?return_to=/">ログアウト</a></div>
      </header>

      {view === 'board' && <>
        <section className="hero"><div><p className="eyebrow">BUSINESS REQUEST BOARD</p><h1>あなたが探している人を、<br /><em>仲間のつながり</em>で見つけよう。</h1><p className="hero-copy">売り込む前に、誰かの力になる。<br />「こんな人を知っています」の一言から、新しい商談が始まります。</p></div><div className="hero-action"><button className="primary-button" onClick={() => setModal('request')}><span>＋</span> 探しごとを投稿する</button><small>案件・協業先・相談相手を募集できます</small></div></section>
        <section className="impact-bar" aria-label="活動状況"><div><strong>{requests.length}</strong><span>募集中の探しごと</span></div><div><strong>{requests.reduce((sum, item) => sum + item.introCount, 0)}</strong><span>生まれた紹介</span></div><div><strong>{stats.dealCount}</strong><span>あなたの商談成立</span></div><p><span className="pulse" />あなたの紹介が、仲間のビジネスを動かします</p></section>
        <div className="page-grid"><section className="feed"><div className="section-head"><div><p className="eyebrow">CURRENT REQUESTS</p><h2>みんなの探しごと</h2></div><span className="sort-button">新着順</span></div>
          <div className="filters" role="group" aria-label="投稿を絞り込む">{[['all','すべて'],['project','案件・発注先'],['collaboration','協業パートナー'],['consultation','相談・情報']].map(([key,label]) => <button key={key} onClick={() => setFilter(key)} className={filter === key ? 'selected' : ''}>{label} <span>{counts(key)}</span></button>)}</div>
          <div className="card-list">{shown.length === 0 ? <div className="empty"><b>該当する探しごとはまだありません</b><span>最初の投稿をして、紹介のきっかけを作りましょう。</span></div> : shown.map((need) => <article className="need-card" key={need.id}><div className="card-topline"><span className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</span><span className="deadline">受付中 · {formatDeadline(need.deadline)}まで</span></div><h3>{need.title}</h3><p className="need-body">{need.description}</p><dl className="details"><div><dt>予算感</dt><dd>{need.budgetLabel}</dd></div><div><dt>希望エリア</dt><dd>{need.area}</dd></div></dl><div className="card-footer"><div className="avatar peach">{need.authorName.slice(0,1)}</div><div className="author"><b>{need.authorName}</b><span>{need.authorCompany || '会社情報未登録'}</span><small>{need.authorVenue}</small></div><div className="intro-state"><b>{need.introCount}件</b><span>紹介あり</span></div><button className="intro-button" onClick={() => openIntro(need)}>知っている人を紹介する <span>→</span></button></div></article>)}</div>
        </section><RankSidebar stats={stats} progress={progress} onHistory={() => switchView('introductions')} /></div>
      </>}

      {view === 'introductions' && <SubPage eyebrow="MY INTRODUCTIONS" title="あなたが届けた紹介" lead="紹介した後の進み具合を確認できます。成立した紹介は、あなたの信頼とランクにつながります。"><div className="history-list">{introductions.length === 0 ? <div className="empty"><b>まだ紹介はありません</b><span>探しごとを見て、力になれそうな仲間をつないでみましょう。</span><button onClick={() => switchView('board')}>探しごとを見る</button></div> : introductions.map((item) => <article className="history-card" key={item.id}><div><span className={`status status-${item.status}`}>{statusLabels[item.status] ?? item.status}</span><h3>{item.requestTitle}</h3><p>紹介した人：<b>{item.personName}</b>　{item.personCompany}</p></div><div className="points">+{item.pointsAwarded}<small>pt</small></div></article>)}</div></SubPage>}

      {view === 'ranking' && <SubPage eyebrow="GIVER RANKING" title="紹介で貢献する仲間たち" lead="件数だけでなく、商談や成約までつながった紹介を評価。売り込む人ではなく、つなぐ人に光が当たるランキングです。"><div className="leaderboard"><div className="leader-head"><span>順位・会員</span><span>紹介</span><span>商談成立</span><span>ポイント</span></div>{leaders.map((leader) => <article key={`${leader.position}-${leader.displayName}`}><div className="leader-person"><strong>{leader.position}</strong><span className="mini-avatar">{leader.displayName.slice(0,1)}</span><p><b>{leader.displayName}</b><small>{leader.venue} · {leader.rank} Lv.{leader.level}</small></p></div><span>{leader.introCount}件</span><span>{leader.dealCount}件</span><b>{leader.points} pt</b></article>)}</div></SubPage>}

      {modal === 'request' && <Modal title="探している人・会社を投稿する" lead="具体的な背景と予算を書くほど、良い紹介が集まります。" onClose={() => setModal(null)}><form className="form" onSubmit={submitRequest}><label>探しているもの<select name="category" required defaultValue=""><option value="" disabled>選択してください</option><option value="project">案件の発注先</option><option value="collaboration">協業パートナー</option><option value="consultation">相談相手・情報</option></select></label><label>タイトル<input name="title" required maxLength={90} placeholder="例：店舗採用に強い動画制作会社を探しています" /></label><label>背景・お願いしたいこと<textarea name="description" required maxLength={600} rows={5} placeholder="どんな課題があり、どんな人を紹介してほしいかを書いてください" /></label><div className="form-row"><label>予算感<input name="budgetLabel" required maxLength={60} placeholder="例：月額20〜40万円／応相談" /></label><label>希望エリア<input name="area" required maxLength={60} placeholder="例：東京都・オンライン" /></label></div><label>募集期限<input name="deadline" type="date" required min="2026-08-27" /></label><button className="submit-button" disabled={busy}>{busy ? '投稿しています…' : 'この内容で投稿する'}</button></form></Modal>}

      {modal === 'intro' && selected && <Modal title="知っている人を紹介する" lead={`「${selected.title}」への紹介です。`} onClose={() => setModal(null)}><form className="form" onSubmit={submitIntroduction}><div className="form-row"><label>紹介する方のお名前<input name="personName" required maxLength={60} /></label><label>会社・屋号<input name="personCompany" required maxLength={80} /></label></div><label>あなたとの関係<input name="relationship" required maxLength={120} placeholder="例：3年来の取引先。過去に2案件を一緒に担当" /></label><label>この探しごとに合うと思う理由<textarea name="fitReason" required maxLength={400} rows={4} placeholder="実績や人柄、紹介したい理由を具体的に" /></label><label className="consent"><input type="checkbox" name="consentConfirmed" required /> 紹介するご本人に、情報を共有する了承を得ています</label><p className="point-notice">紹介を届けると GIVEポイント <b>+10pt</b>。商談・成約へ進むと追加ポイントが加算されます。</p><button className="submit-button" disabled={busy}>{busy ? '届けています…' : '紹介を届ける'}</button></form></Modal>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function RankSidebar({ stats, progress, onHistory }: { stats: MemberStats; progress: number; onHistory: () => void }) {
  return <aside className="sidebar"><section className="rank-card"><p className="eyebrow">YOUR CONTRIBUTION</p><div className="rank-heading"><span className="rank-icon">G</span><div><small>あなたの紹介ランク</small><h2>{stats.rank} <em>Lv.{stats.level}</em></h2></div></div><div className="progress"><span style={{ width: `${progress}%` }} /></div><p className="progress-copy">次のランクまで <b>あと{Math.max(0, stats.nextRankAt - stats.points)}pt</b></p><div className="rank-stats"><div><strong>{stats.introCount}</strong><span>紹介した数</span></div><div><strong>{stats.dealCount}</strong><span>商談成立</span></div><div><strong>{stats.points}</strong><span>GIVEポイント</span></div></div><button className="text-button" onClick={onHistory}>紹介実績を見る →</button></section><section className="guide-card"><p className="eyebrow">GOOD INTRODUCTION</p><h3>信頼される紹介のコツ</h3><ol><li><span>01</span><p><b>まず、相手の了承を取る</b><small>連絡先を渡す前に意思を確認しましょう</small></p></li><li><span>02</span><p><b>つなぐ理由をひと言添える</b><small>お互いのメリットが伝わります</small></p></li><li><span>03</span><p><b>紹介後の結果を見届ける</b><small>成立するとあなたの評価に加点されます</small></p></li></ol></section></aside>;
}

function SubPage({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: string; children: React.ReactNode }) { return <section className="subpage"><header><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{lead}</p></header>{children}</section>; }
function Modal({ title, lead, onClose, children }: { title: string; lead: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={onClose} aria-label="閉じる">×</button><p className="eyebrow">GIVE HUB</p><h2 id="modal-title">{title}</h2><p className="modal-lead">{lead}</p>{children}</section></div>; }
function formatDeadline(value: string) { const date = new Date(`${value}T00:00:00+09:00`); return Number.isNaN(date.getTime()) ? value : `${date.getMonth()+1}月${date.getDate()}日`; }
