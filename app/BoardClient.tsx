'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { BoardRequest, MemberStats } from '@/db/data';
import BusinessCardManager from './BusinessCardManager';
import ReceivedIntroductions from './ReceivedIntroductions';
import InstallAndNotificationPanel from './InstallAndNotificationPanel';
import { prefectures, type Prefecture } from './profile-options';
import { industries } from './industry-options';

const categories = {
  project: { label: '案件', className: 'project' },
  collaboration: { label: '協業先', className: 'collab' },
  consultation: { label: '相談・情報', className: 'consultation' },
};

const revenueBands: Record<string, string> = {
  revenue_10_30: '1,000万〜3,000万円',
  revenue_30_70: '3,000万〜7,000万円',
  revenue_70_100: '7,000万円〜1億円',
  revenue_100_plus: '1億円以上',
};

const rankNames = ['PEARL', 'EMERALD', 'SAPPHIRE', 'RUBY', 'DIAMOND'];
const rankThresholds = [0, 3, 6, 10, 20];

export default function BoardClient({ initialRequests, initialStats, userName }: { initialRequests: BoardRequest[]; initialStats: MemberStats; userName: string }) {
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState('all');
  const [revenueFilter, setRevenueFilter] = useState('all');
  const [venueFilter, setVenueFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [profileCompany, setProfileCompany] = useState(initialStats.company);
  const [profileVenue, setProfileVenue] = useState(initialStats.venue);
  const [profilePosition, setProfilePosition] = useState(initialStats.positionTitle);
  const [profileBadge, setProfileBadge] = useState(initialStats.badge);
  const [profileArea, setProfileArea] = useState(prefectures.includes(initialStats.businessArea as Prefecture) ? initialStats.businessArea : '');
  const [profileIndustry, setProfileIndustry] = useState(initialStats.primaryIndustry);
  const [profileNotifyIndustries, setProfileNotifyIndustries] = useState(initialStats.notifyIndustries);
  const [profileRevenue, setProfileRevenue] = useState(initialStats.annualRevenueBand);
  const [requestIndustries, setRequestIndustries] = useState<string[]>([]);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(initialStats.avatarUrl);
  const [cropSource, setCropSource] = useState('');
  const [cropFileName, setCropFileName] = useState('profile.jpg');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const [modal, setModal] = useState<'request' | 'intro' | 'profile' | 'cards' | 'responses' | null>(initialStats.avatarUrl ? null : 'profile');
  const [cardStartMode, setCardStartMode] = useState<'list' | 'capture'>('list');
  const [selected, setSelected] = useState<BoardRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const venueOptions = useMemo(() => [...new Set(requests.map((item) => item.authorVenue).filter(Boolean))].sort(), [requests]);
  const areaOptions = useMemo(() => [...new Set(requests.map((item) => item.authorBusinessArea).filter(Boolean))].sort(), [requests]);
  const shown = useMemo(() => requests.filter((item) =>
    (filter === 'all' || item.category === filter) &&
    (revenueFilter === 'all' || item.authorRevenueBand === revenueFilter) &&
    (venueFilter === 'all' || item.authorVenue === venueFilter) &&
    (areaFilter === 'all' || item.authorBusinessArea === areaFilter)
  ), [areaFilter, filter, revenueFilter, requests, venueFilter]);
  const count = (category: string) => category === 'all' ? requests.length : requests.filter((item) => item.category === category).length;
  const currentRankFloor = rankThresholds[stats.level - 1] ?? 0;
  const nextRankThreshold = rankThresholds[stats.level];
  const nextRankName = rankNames[stats.level];
  const rankProgress = nextRankThreshold === undefined
    ? 100
    : Math.min(100, Math.round(((stats.introCount - currentRankFloor) / (nextRankThreshold - currentRankFloor)) * 100));

  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);
  useEffect(() => () => {
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  async function refreshBoard() {
    const response = await fetch('/api/board');
    if (!response.ok) return;
    const data = await response.json() as { requests: BoardRequest[]; stats: MemberStats };
    setRequests(data.requests); setStats(data.stats);
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const response = await fetch('/api/board', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), industryTags: requestIndustries }) });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? '投稿できませんでした。');
    setModal(null); form.reset(); setRequestIndustries([]); await refreshBoard(); showToast('探しごとを投稿しました。関連業種の会員へ通知します。');
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

  async function saveProfile() {
    setBusy(true);
    const body = new FormData();
    body.set('company', profileCompany); body.set('venue', profileVenue); body.set('positionTitle', profilePosition);
    body.set('badge', profileBadge); body.set('businessArea', profileArea); body.set('primaryIndustry', profileIndustry);
    body.set('notifyIndustries', JSON.stringify(profileNotifyIndustries)); body.set('annualRevenueBand', profileRevenue);
    if (profilePhoto) body.set('avatar', profilePhoto);
    const response = await fetch('/api/profile', { method: 'PATCH', body });
    const result = await response.json() as { error?: string; avatarUrl?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? 'プロフィールを保存できませんでした。');
    const avatarUrl = result.avatarUrl ?? stats.avatarUrl;
    setStats((current) => ({ ...current, company: profileCompany, venue: profileVenue, positionTitle: profilePosition, badge: profileBadge, businessArea: profileArea, primaryIndustry: profileIndustry, notifyIndustries: profileNotifyIndustries, annualRevenueBand: profileRevenue, avatarUrl }));
    setProfilePhoto(null); setPhotoPreview(avatarUrl); setModal(null);
    await refreshBoard(); showToast('顔写真とプロフィールを保存しました。');
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return showToast('JPEG・PNG・WebPの写真を選んでください。');
    if (file.size > 5 * 1024 * 1024) return showToast('顔写真は5MB以下にしてください。');
    setCropSource(URL.createObjectURL(file)); setCropFileName(file.name); setCrop({ x: 0, y: 0 }); setZoom(1); setCroppedArea(null);
  }

  async function confirmCrop() {
    if (!cropSource || !croppedArea) return;
    setCropping(true);
    try {
      const croppedFile = await makeCroppedPhoto(cropSource, croppedArea, cropFileName);
      setProfilePhoto(croppedFile); setPhotoPreview(URL.createObjectURL(croppedFile)); setCropSource('');
      showToast('トリミングしました。プロフィールを保存してください。');
    } catch {
      showToast('写真をトリミングできませんでした。別の写真をお試しください。');
    } finally {
      setCropping(false);
    }
  }

  function openRequest() {
    if (!stats.avatarUrl) { setModal('profile'); return showToast('投稿の前に顔写真を登録してください。'); }
    setModal('request');
  }

  function openIntroduction(need: BoardRequest) {
    if (!stats.avatarUrl) { setModal('profile'); return showToast('紹介の前に顔写真を登録してください。'); }
    setSelected(need); setModal('intro');
  }

  function openCards(mode: 'list' | 'capture') { setCardStartMode(mode); setModal('cards'); }

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3800); }
  function scrollTo(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function toggleIndustry(value: string, selected: string[], setSelected: (values: string[]) => void, max: number) {
    if (selected.includes(value)) return setSelected(selected.filter((item) => item !== value));
    if (selected.length >= max) return showToast(`業種タグは${max}個まで選択できます。`);
    setSelected([...selected, value]);
  }

  return (
    <main className="app-shell" id="home">
      <header className="mobile-header">
        <a className="mobile-brand" href="#home"><span className="brand-mark">G</span><b>GIVE HUB</b></a>
        <button className="header-profile" onClick={() => setModal('profile')}><span><small>こんにちは</small><b>{userName}</b></span><Avatar src={stats.avatarUrl} name={userName} className="mini-avatar" /></button>
      </header>

      <section className={`rank-card rank-${stats.rank.toLowerCase()}`} aria-label={`現在の会員ランクは${stats.rank}です`}>
        <div className="rank-card-top"><span className="rank-crown">♛</span><b>GIVE HUB</b><small>SHUSEI CLUB MEMBER</small></div>
        <div className="rank-emblem" aria-hidden="true"><span>✦</span></div>
        <p className="rank-eyebrow">YOUR MEMBER GRADE</p>
        <h1>{stats.rank}</h1>
        <h2>MEMBER</h2>
        <div className="rank-progress">
          <div className="rank-progress-copy">
            <b>紹介 {stats.introCount}件</b>
            <span>{nextRankThreshold === undefined ? '最高ランクに到達しました' : `あと${Math.max(0, nextRankThreshold - stats.introCount)}件で ${nextRankName}`}</span>
          </div>
          <span className="rank-progress-track"><i style={{ width: `${rankProgress}%` }} /></span>
        </div>
        <div className="rank-card-bottom"><span><small>MEMBER</small><b>{userName}</b></span><span><small>VENUE</small><b>{stats.venue || '会場未設定'}</b></span><span><small>募集中</small><b>{requests.length}件</b></span></div>
      </section>

      <section className="quick-actions" aria-label="クイック操作">
        <button className="quick-card primary" onClick={openRequest}><span className="quick-icon">＋</span><span><b>探しごとを投稿</b><small>案件・協業先を募集</small></span><i>›</i></button>
        <button className="quick-card inbox" onClick={() => setModal('responses')}><span className="quick-icon">✉</span><span><b>届いた紹介を見る</b><small>自分の投稿への回答を確認</small></span><strong>{stats.receivedIntroCount}</strong><i>›</i></button>
        <button className="quick-card camera" onClick={() => openCards('capture')}><span className="quick-icon">▣</span><span><b>名刺をまとめて読み取る</b><small>複数枚の撮影・写真選択に対応</small></span><i>›</i></button>
      </section>

      <InstallAndNotificationPanel onNotice={showToast} />

      {!stats.avatarUrl && <button className="photo-required-banner" onClick={() => setModal('profile')}><span>顔写真の登録が必要です</span><b>本人だと分かる写真を登録すると、投稿・紹介ができます。</b><i>登録する →</i></button>}

      <section className="mobile-board" id="board">
        <div className="section-title"><div><p>REQUESTS</p><h2>みんなの探しごと</h2></div><span>{shown.length}件</span></div>
        <div className="filters" role="group" aria-label="投稿を絞り込む">{[['all','すべて'],['project','案件'],['collaboration','協業先'],['consultation','相談']].map(([key,label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}<span>{count(key)}</span></button>)}</div>
        <div className="member-filters">
          <p>会員情報で絞り込む</p>
          <label><span>所属会場</span><select value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}><option value="all">すべての会場</option>{venueOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label><span>活動エリア</span><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">すべてのエリア</option>{areaOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label className="wide"><span>会社の年商</span><select value={revenueFilter} onChange={(event) => setRevenueFilter(event.target.value)}><option value="all">すべての年商</option>{Object.entries(revenueBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <div className="card-list">
          {shown.length === 0 ? <div className="empty"><b>まだ投稿がありません</b><span>最初の探しごとを投稿してみましょう。</span></div> : shown.map((need) => (
            <article className="need-card" key={need.id}>
              <div className="card-topline"><span className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</span><span className="deadline">あと{daysLeft(need.deadline)}日</span></div>
              <h3>{need.title}</h3><p className="need-body">{need.description}</p>
              <div className="industry-tags" aria-label="関連業種">{need.industryTags.map((industry) => <span key={industry}>{industry}</span>)}</div>
              <dl className="details"><div><dt>予算</dt><dd>{need.budgetLabel}</dd></div><div><dt>エリア</dt><dd>{need.area}</dd></div></dl>
              <div className="card-person"><Avatar src={need.authorAvatarUrl} name={need.authorName} className="member-avatar" /><p><b>{need.authorName}</b><small>{need.authorPositionTitle && `${need.authorPositionTitle}｜`}{need.authorCompany || '会社名未設定'}</small></p><span>紹介 {need.introCount}件</span></div>
              <div className="member-context"><span>会場 {need.authorVenue}</span>{need.authorBusinessArea && <span>エリア {need.authorBusinessArea}</span>}{need.authorBadge && <span>{need.authorBadge}</span>}{need.authorRevenueBand && <span>年商 {revenueBands[need.authorRevenueBand]}</span>}</div>
              <button className="intro-button" onClick={() => openIntroduction(need)}>この人を紹介できる <span>→</span></button>
            </article>
          ))}
        </div>
      </section>

      <nav className="bottom-nav" aria-label="アプリメニュー">
        <button className="active" onClick={() => scrollTo('home')}><span>⌂</span><small>ホーム</small></button>
        <button onClick={() => scrollTo('board')}><span>⌕</span><small>探す</small></button>
        <button className="nav-post" onClick={openRequest} aria-label="探しごとを投稿する"><span>＋</span></button>
        <button onClick={() => openCards('list')}><span>▣</span><small>名刺</small></button>
        <button onClick={() => setModal('profile')}><span>●</span><small>マイ</small></button>
      </nav>

      {modal === 'request' && <Modal title="探しごとを投稿" lead="紹介してほしい人を具体的に書きましょう。" onClose={() => setModal(null)}><form className="form" onSubmit={submitRequest}><label>探しているもの<select name="category" required defaultValue=""><option value="" disabled>選択してください</option><option value="project">案件の発注先</option><option value="collaboration">協業パートナー</option><option value="consultation">相談相手・情報</option></select></label><label>タイトル<input name="title" required maxLength={90} placeholder="例：採用に強い動画制作会社" /></label><label>詳しい内容<textarea name="description" required maxLength={600} rows={4} placeholder="どんな課題があり、どんな人を紹介してほしいか" /></label><fieldset className="tag-field"><legend>関連する業種 <small>必須・3個まで</small></legend><div className="tag-picker">{industries.map((industry) => <button type="button" key={industry} className={requestIndustries.includes(industry) ? 'selected' : ''} onClick={() => toggleIndustry(industry, requestIndustries, setRequestIndustries, 3)}>{industry}</button>)}</div></fieldset><label>予算感<input name="budgetLabel" required maxLength={60} placeholder="例：20〜40万円／応相談" /></label><label>希望エリア<input name="area" required maxLength={60} placeholder="例：東京都・オンライン" /></label><label>募集期限<input name="deadline" type="date" required min="2026-08-27" /></label><button className="submit-button" disabled={busy || !requestIndustries.length}>{busy ? '投稿しています…' : '投稿する'}</button></form></Modal>}

      {modal === 'intro' && selected && <Modal title="知っている人を紹介" lead={`「${selected.title}」への紹介です。`} onClose={() => setModal(null)}><form className="form" onSubmit={submitIntroduction}><label>お名前<input name="personName" required maxLength={60} /></label><label>会社・屋号<input name="personCompany" required maxLength={80} /></label><label>あなたとの関係<input name="relationship" required maxLength={120} placeholder="例：取引先、友人" /></label><label>紹介したい理由<textarea name="fitReason" required maxLength={400} rows={3} /></label><label className="consent"><input type="checkbox" name="consentConfirmed" required /> ご本人に紹介の了承を得ています</label><button className="submit-button" disabled={busy}>{busy ? '届けています…' : '紹介を届ける'}</button></form></Modal>}

      {modal === 'responses' && <Modal title="届いた紹介" lead="あなたが投稿した探しごとへの紹介です。" onClose={() => setModal(null)}><ReceivedIntroductions /></Modal>}

      {modal === 'profile' && <Modal title="マイプロフィール" lead="会員情報と名刺帳のプロフィールを管理できます。" onClose={() => setModal(null)}><div className="profile-sheet compact"><Avatar src={photoPreview} name={userName} className="profile-avatar" /><h3>{userName}</h3><p>{stats.badge || '未設定'} · {stats.venue}</p><div><span><b>{stats.introCount}</b><small>紹介した数</small></span><span><b>{stats.points}</b><small>ポイント</small></span><span><b>{stats.rank}</b><small>会員ランク</small></span></div></div><div className="profile-form">
        <label className="photo-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /><span className="photo-upload-preview">{photoPreview ? <img src={photoPreview} alt="登録する顔写真のプレビュー" /> : <b>＋</b>}</span><span><b>顔写真 <em>必須</em></b><small>本人だと分かる正面の写真を選択<br />JPEG・PNG・WebP／5MBまで</small></span><i>{stats.avatarUrl ? '変更する' : '写真を選ぶ'}</i></label>
        <label>会社名 <small>必須</small><input value={profileCompany} onChange={(event) => setProfileCompany(event.target.value)} maxLength={80} placeholder="株式会社〇〇" required /></label>
        <label>所属会場 <small>必須・正式な会場名</small><input value={profileVenue} onChange={(event) => setProfileVenue(event.target.value)} maxLength={60} placeholder="ひるのめぐろ会場" required /></label>
        <div className="profile-row"><label>肩書き <small>任意</small><input value={profilePosition} onChange={(event) => setProfilePosition(event.target.value)} maxLength={60} placeholder="世話人" /></label><label>バッヂ <small>任意</small><select value={profileBadge} onChange={(event) => setProfileBadge(event.target.value)}><option value="">選択しない</option><option value="緑">緑</option><option value="赤">赤</option><option value="ゴールド">ゴールド</option><option value="ダイヤモンド">ダイヤモンド</option></select></label></div>
        <label>活動エリア <small>任意・検索に使われます</small><select value={profileArea} onChange={(event) => setProfileArea(event.target.value)}><option value="">選択しない</option>{prefectures.map((prefecture) => <option value={prefecture} key={prefecture}>{prefecture}</option>)}</select></label>
        <label>自分の業種 <small>通知の設定に使われます</small><select value={profileIndustry} onChange={(event) => { const value = event.target.value; setProfileIndustry(value); if (value && !profileNotifyIndustries.includes(value)) setProfileNotifyIndustries((current) => [...current, value].slice(0, 6)); }}><option value="">選択してください</option>{industries.map((industry) => <option value={industry} key={industry}>{industry}</option>)}</select></label>
        <fieldset className="tag-field profile-tag-field"><legend>通知を受けたい関連業種 <small>6個まで</small></legend><p>選んだ業種の探しごとが投稿されると通知します。</p><div className="tag-picker">{industries.map((industry) => <button type="button" key={industry} className={profileNotifyIndustries.includes(industry) ? 'selected' : ''} onClick={() => toggleIndustry(industry, profileNotifyIndustries, setProfileNotifyIndustries, 6)}>{industry}</button>)}</div></fieldset>
        <label>会社の年商 <small>任意</small><select value={profileRevenue} onChange={(event) => setProfileRevenue(event.target.value)}><option value="">選択しない</option>{Object.entries(revenueBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <button onClick={saveProfile} disabled={busy || !profileCompany.trim() || !profileVenue.trim() || (!stats.avatarUrl && !profilePhoto)}>{busy ? '保存中…' : '顔写真とプロフィールを保存する'}</button>
      </div></Modal>}
      {modal === 'cards' && <BusinessCardManager initialMode={cardStartMode} onClose={() => setModal(null)} onNotice={showToast} />}
      {cropSource && <div className="crop-backdrop"><section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title"><header><button onClick={() => setCropSource('')}>キャンセル</button><div><h2 id="crop-title">顔写真を調整</h2><p>指で動かして、顔が中央に来るようにします</p></div><button className="crop-confirm" onClick={confirmCrop} disabled={cropping || !croppedArea}>{cropping ? '処理中' : '決定'}</button></header><div className="crop-stage"><Cropper image={cropSource} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} minZoom={1} maxZoom={4} zoomSpeed={0.35} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setCroppedArea(pixels)} disableAutomaticStylesInjection /></div><div className="crop-controls"><label><span>顔の大きさ</span><input type="range" min="1" max="4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="顔写真の拡大率" /><b>{Math.round(zoom * 100)}%</b></label><p>写真を指で動かせます。丸の中がプロフィール写真に表示されます。</p></div></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Modal({ title, lead, onClose, children }: { title: string; lead: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><span className="sheet-handle" /><button className="modal-close" onClick={onClose} aria-label="閉じる">×</button><h2 id="modal-title">{title}</h2><p className="modal-lead">{lead}</p>{children}</section></div>; }
function Avatar({ src, name, className }: { src: string; name: string; className: string }) { return <span className={className}>{src ? <img src={src} alt={`${name}さんの顔写真`} /> : <span>{name.slice(0, 1)}</span>}</span>; }
function daysLeft(value: string) { const deadline = new Date(`${value}T23:59:59+09:00`).getTime(); return Math.max(0, Math.ceil((deadline - Date.now()) / 86400000)); }

async function makeCroppedPhoto(source: string, area: Area, originalName: string) {
  const image = await loadPhoto(source);
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 800;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, 800, 800);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Image conversion failed')), 'image/jpeg', 0.9));
  const baseName = originalName.replace(/\.[^.]+$/, '').slice(0, 50) || 'profile';
  return new File([blob], `${baseName}-cropped.jpg`, { type: 'image/jpeg' });
}

function loadPhoto(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image load failed')); image.src = source;
  });
}
