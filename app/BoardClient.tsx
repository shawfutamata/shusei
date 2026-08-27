'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { BoardRequest, MemberStats } from '@/db/data';

const categories = {
  project: { label: '案件', className: 'project' },
  collaboration: { label: '協業先', className: 'collab' },
  consultation: { label: '相談・情報', className: 'consultation' },
};

export default function BoardClient({ initialRequests, initialStats, userName }: { initialRequests: BoardRequest[]; initialStats: MemberStats; userName: string }) {
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<'request' | 'intro' | 'profile' | null>(null);
  const [selected, setSelected] = useState<BoardRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const shown = useMemo(() => filter === 'all' ? requests : requests.filter((item) => item.category === filter), [filter, requests]);
  const count = (category: string) => category === 'all' ? requests.length : requests.filter((item) => item.category === category).length;

  async function refreshBoard() {
    const response = await fetch('/api/board');
    if (!response.ok) return;
    const data = await response.json() as { requests: BoardRequest[]; stats: MemberStats };
    setRequests(data.requests); setStats(data.stats);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const response = await fetch('/api/board', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? '投稿できませんでした。');
    setModal(null); form.reset(); await refreshBoard(); showToast('探しごとを投稿しました。');
  }

  async function submitIntroduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true);
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/introductions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...raw, requestId: selected.id, consentConfirmed: raw.consentConfirmed === 'on' }) });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? '紹介を登録できませんでした。');
    setModal(null); form.reset(); await refreshBoard(); showToast('紹介を届けました。10ポイント加算されました。');
  }

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3800); }
  function scrollTo(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  return (
    <main className="app-shell" id="home">
      <header className="mobile-header">
        <a className="mobile-brand" href="#home"><span className="brand-mark">G</span><b>GIVE HUB</b></a>
        <button className="header-profile" onClick={() => setModal('profile')}><span><small>こんにちは</small><b>{userName}</b></span><span className="mini-avatar">{userName.slice(0, 1)}</span></button>
      </header>

      <section className="mobile-hero">
        <div className="hero-badge"><span />守成クラブの紹介掲示板</div>
        <h1>こんな人、<br /><em>探しています。</em></h1>
        <p>仲間のつながりから、<br />信頼できる人と出会おう。</p>
        <div className="hero-stats"><span><b>{requests.length}</b>件 募集中</span><span><b>{stats.introCount}</b>件 紹介しました</span></div>
      </section>

      <section className="quick-actions" aria-label="クイック操作">
        <button className="quick-card primary" onClick={() => setModal('request')}><span className="quick-icon">＋</span><span><b>探しごとを投稿</b><small>案件・協業先を募集</small></span><i>›</i></button>
        <label className="quick-card camera" htmlFor="card-camera"><span className="quick-icon">▣</span><span><b>名刺を読み取る</b><small>カメラでその場で保存</small></span><i>›</i><input id="card-camera" type="file" accept="image/*" capture="environment" onChange={(event) => { if (event.target.files?.[0]) showToast('名刺を撮影しました。読み取り画面へ進みます。'); }} /></label>
      </section>

      <section className="mobile-board" id="board">
        <div className="section-title"><div><p>REQUESTS</p><h2>みんなの探しごと</h2></div><span>{shown.length}件</span></div>
        <div className="filters" role="group" aria-label="投稿を絞り込む">{[['all','すべて'],['project','案件'],['collaboration','協業先'],['consultation','相談']].map(([key,label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}<span>{count(key)}</span></button>)}</div>
        <div className="card-list">
          {shown.length === 0 ? <div className="empty"><b>まだ投稿がありません</b><span>最初の探しごとを投稿してみましょう。</span></div> : shown.map((need) => (
            <article className="need-card" key={need.id}>
              <div className="card-topline"><span className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</span><span className="deadline">あと{daysLeft(need.deadline)}日</span></div>
              <h3>{need.title}</h3><p className="need-body">{need.description}</p>
              <dl className="details"><div><dt>予算</dt><dd>{need.budgetLabel}</dd></div><div><dt>エリア</dt><dd>{need.area}</dd></div></dl>
              <div className="card-person"><span className="mini-avatar">{need.authorName.slice(0,1)}</span><p><b>{need.authorName}</b><small>{need.authorCompany || need.authorVenue}</small></p><span>紹介 {need.introCount}件</span></div>
              <button className="intro-button" onClick={() => { setSelected(need); setModal('intro'); }}>この人を紹介できる <span>→</span></button>
            </article>
          ))}
        </div>
      </section>

      <nav className="bottom-nav" aria-label="アプリメニュー">
        <button className="active" onClick={() => scrollTo('home')}><span>⌂</span><small>ホーム</small></button>
        <button onClick={() => scrollTo('board')}><span>⌕</span><small>探す</small></button>
        <button className="nav-post" onClick={() => setModal('request')} aria-label="探しごとを投稿する"><span>＋</span></button>
        <label htmlFor="card-camera"><span>▣</span><small>名刺</small></label>
        <button onClick={() => setModal('profile')}><span>●</span><small>マイ</small></button>
      </nav>

      {modal === 'request' && <Modal title="探しごとを投稿" lead="紹介してほしい人を具体的に書きましょう。" onClose={() => setModal(null)}><form className="form" onSubmit={submitRequest}><label>探しているもの<select name="category" required defaultValue=""><option value="" disabled>選択してください</option><option value="project">案件の発注先</option><option value="collaboration">協業パートナー</option><option value="consultation">相談相手・情報</option></select></label><label>タイトル<input name="title" required maxLength={90} placeholder="例：採用に強い動画制作会社" /></label><label>詳しい内容<textarea name="description" required maxLength={600} rows={4} placeholder="どんな課題があり、どんな人を紹介してほしいか" /></label><label>予算感<input name="budgetLabel" required maxLength={60} placeholder="例：20〜40万円／応相談" /></label><label>希望エリア<input name="area" required maxLength={60} placeholder="例：東京都・オンライン" /></label><label>募集期限<input name="deadline" type="date" required min="2026-08-27" /></label><button className="submit-button" disabled={busy}>{busy ? '投稿しています…' : '投稿する'}</button></form></Modal>}

      {modal === 'intro' && selected && <Modal title="知っている人を紹介" lead={`「${selected.title}」への紹介です。`} onClose={() => setModal(null)}><form className="form" onSubmit={submitIntroduction}><label>お名前<input name="personName" required maxLength={60} /></label><label>会社・屋号<input name="personCompany" required maxLength={80} /></label><label>あなたとの関係<input name="relationship" required maxLength={120} placeholder="例：取引先、友人" /></label><label>紹介したい理由<textarea name="fitReason" required maxLength={400} rows={3} /></label><label className="consent"><input type="checkbox" name="consentConfirmed" required /> ご本人に紹介の了承を得ています</label><button className="submit-button" disabled={busy}>{busy ? '届けています…' : '紹介を届ける'}</button></form></Modal>}

      {modal === 'profile' && <Modal title="マイページ" lead="あなたの紹介活動" onClose={() => setModal(null)}><div className="profile-sheet"><span className="profile-avatar">{userName.slice(0,1)}</span><h3>{userName}</h3><p>{stats.venue}</p><div><span><b>{stats.introCount}</b><small>紹介した数</small></span><span><b>{stats.points}</b><small>ポイント</small></span><span><b>Lv.{stats.level}</b><small>{stats.rank}</small></span></div></div></Modal>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Modal({ title, lead, onClose, children }: { title: string; lead: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><span className="sheet-handle" /><button className="modal-close" onClick={onClose} aria-label="閉じる">×</button><h2 id="modal-title">{title}</h2><p className="modal-lead">{lead}</p>{children}</section></div>; }
function daysLeft(value: string) { const deadline = new Date(`${value}T23:59:59+09:00`).getTime(); return Math.max(0, Math.ceil((deadline - Date.now()) / 86400000)); }
