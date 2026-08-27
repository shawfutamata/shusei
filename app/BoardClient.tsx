'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { BoardRequest, MemberStats } from '@/db/data';

const categories = {
  project: { label: '案件を探しています', className: 'project' },
  collaboration: { label: '協業先を探しています', className: 'collab' },
  consultation: { label: '相談相手を探しています', className: 'consultation' },
};

export default function BoardClient({ initialRequests, initialStats, userName }: { initialRequests: BoardRequest[]; initialStats: MemberStats; userName: string }) {
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<'request' | 'intro' | null>(null);
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

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark">G</span><span><b>GIVE HUB</b><small>紹介でつながる掲示板</small></span></a>
        <div className="top-actions"><div className="score-pill"><span>紹介 {stats.introCount}件</span><b>{stats.points} pt</b></div><span className="mini-avatar">{userName.slice(0, 1)}</span><span className="user-name">{userName}</span></div>
      </header>

      <section className="hero" id="top">
        <div><p className="eyebrow">SHUSEI CLUB × GIVE</p><h1>こんな人、<br /><em>探しています。</em></h1><p>案件の発注先、協業パートナー、相談相手。<br />仲間のつながりから、信頼できる紹介を見つけよう。</p></div>
        <button className="primary-button" onClick={() => setModal('request')}><span>＋</span> 探しごとを投稿する</button>
      </section>

      <section className="board-wrap">
        <div className="board-head"><div><p className="eyebrow">REQUEST BOARD</p><h2>みんなの探しごと</h2></div><p><b>{requests.length}</b>件 募集中</p></div>
        <div className="filters" role="group" aria-label="投稿を絞り込む">
          {[['all','すべて'],['project','案件'],['collaboration','協業先'],['consultation','相談・情報']].map(([key,label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}<span>{count(key)}</span></button>)}
        </div>
        <div className="card-list">
          {shown.length === 0 ? <div className="empty"><b>まだ投稿がありません</b><span>最初の探しごとを投稿してみましょう。</span></div> : shown.map((need) => (
            <article className="need-card" key={need.id}>
              <div className="card-topline"><span className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</span><span className="deadline">{formatDeadline(need.deadline)}まで</span></div>
              <h3>{need.title}</h3><p className="need-body">{need.description}</p>
              <dl className="details"><div><dt>予算</dt><dd>{need.budgetLabel}</dd></div><div><dt>エリア</dt><dd>{need.area}</dd></div></dl>
              <div className="card-footer"><div className="mini-avatar">{need.authorName.slice(0,1)}</div><div className="author"><b>{need.authorName}</b><span>{need.authorCompany || need.authorVenue}</span></div><span className="intro-count">紹介 {need.introCount}件</span><button className="intro-button" onClick={() => { setSelected(need); setModal('intro'); }}>この人を紹介できる <span>→</span></button></div>
            </article>
          ))}
        </div>
      </section>

      {modal === 'request' && <Modal title="探しごとを投稿する" lead="できるだけ具体的に書くと、紹介が集まりやすくなります。" onClose={() => setModal(null)}><form className="form" onSubmit={submitRequest}><label>探しているもの<select name="category" required defaultValue=""><option value="" disabled>選択してください</option><option value="project">案件の発注先</option><option value="collaboration">協業パートナー</option><option value="consultation">相談相手・情報</option></select></label><label>タイトル<input name="title" required maxLength={90} placeholder="例：店舗採用に強い動画制作会社を探しています" /></label><label>詳しい内容<textarea name="description" required maxLength={600} rows={4} placeholder="どんな課題があり、どんな人を紹介してほしいか" /></label><div className="form-row"><label>予算感<input name="budgetLabel" required maxLength={60} placeholder="例：20〜40万円／応相談" /></label><label>希望エリア<input name="area" required maxLength={60} placeholder="例：東京都・オンライン" /></label></div><label>募集期限<input name="deadline" type="date" required min="2026-08-27" /></label><button className="submit-button" disabled={busy}>{busy ? '投稿しています…' : '投稿する'}</button></form></Modal>}

      {modal === 'intro' && selected && <Modal title="知っている人を紹介する" lead={`「${selected.title}」への紹介です。`} onClose={() => setModal(null)}><form className="form" onSubmit={submitIntroduction}><div className="form-row"><label>お名前<input name="personName" required maxLength={60} /></label><label>会社・屋号<input name="personCompany" required maxLength={80} /></label></div><label>あなたとの関係<input name="relationship" required maxLength={120} placeholder="例：取引先、友人" /></label><label>紹介したい理由<textarea name="fitReason" required maxLength={400} rows={3} placeholder="この探しごとに合うと思う理由" /></label><label className="consent"><input type="checkbox" name="consentConfirmed" required /> ご本人に紹介の了承を得ています</label><button className="submit-button" disabled={busy}>{busy ? '届けています…' : '紹介を届ける'}</button></form></Modal>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Modal({ title, lead, onClose, children }: { title: string; lead: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={onClose} aria-label="閉じる">×</button><h2 id="modal-title">{title}</h2><p className="modal-lead">{lead}</p>{children}</section></div>; }
function formatDeadline(value: string) { const date = new Date(`${value}T00:00:00+09:00`); return Number.isNaN(date.getTime()) ? value : `${date.getMonth()+1}月${date.getDate()}日`; }
