'use client';

import { ChangeEvent, CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { BoardRequest, MemberStats, ReferralSummary } from '@/db/data';
import BusinessCardManager from './BusinessCardManager';
import ReceivedIntroductions from './ReceivedIntroductions';
import { getRegion, prefectures, regions, type Prefecture } from './profile-options';
import { getIndustryGroup, industryGroups, matchesIndustry } from './industry-options';
import { findVenuePrefecture, isListedVenue, OTHER_VENUE, venuePrefectures, venuesByPrefecture } from './venue-options';

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

const topBanners = [
  { src: '/banners/top-request.webp', alt: 'こんな人、探しています。困りごとを投稿する案内' },
  { src: '/banners/top-introductions.webp', alt: '届いた紹介をまとめて確認する案内' },
  { src: '/banners/top-rank.webp', alt: '紹介するほど会員ランクが上がる仕組みの案内' },
  { src: '/banners/top-business-cards.webp', alt: '複数枚の名刺をまとめて読み取る案内' },
] as const;
const industryIcons: Record<string, string> = {
  'IT・システム': '/icons/industries/it-system.png', 'Web・広告': '/icons/industries/web-ad.png',
  '映像・写真': '/icons/industries/video-photo.png', 'デザイン・印刷': '/icons/industries/design-print.png',
  '建設・不動産': '/icons/industries/construction-realestate.png', '製造・卸売': '/icons/industries/manufacturing-wholesale.png',
  '小売・EC': '/icons/industries/retail-ec.png', '飲食・食品': '/icons/industries/food.png',
  '美容・健康': '/icons/industries/beauty-health.png', '医療・福祉': '/icons/industries/medical-welfare.png',
  '士業・コンサル': '/icons/industries/legal-consulting.png', '人材・教育': '/icons/industries/hr-education.png',
  '金融・保険': '/icons/industries/finance-insurance.png', '運輸・物流': '/icons/industries/transport-logistics.png',
  'イベント・エンタメ': '/icons/industries/event-entertainment.png', 'その他': '/icons/industries/other.png',
};
const historyStorageKey = 'give-hub-request-history-v1';
const favoriteStorageKey = 'give-hub-request-favorites-v1';
const rankThresholds = [0, 3, 6, 10, 20];

export default function BoardClient({ initialRequests, initialStats, userName }: { initialRequests: BoardRequest[]; initialStats: MemberStats; userName: string }) {
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState('all');
  const [revenueFilter, setRevenueFilter] = useState('all');
  const [venueFilter, setVenueFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'profile'>(initialStats.avatarUrl ? 'home' : 'profile');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [localListsReady, setLocalListsReady] = useState(false);
  const [profileCompany, setProfileCompany] = useState(initialStats.company);
  const [venuePrefecture, setVenuePrefecture] = useState(findVenuePrefecture(initialStats.venue));
  const [venueChoice, setVenueChoice] = useState(initialStats.venue ? (isListedVenue(initialStats.venue) ? initialStats.venue : OTHER_VENUE) : '');
  const [venueOther, setVenueOther] = useState(isListedVenue(initialStats.venue) ? '' : initialStats.venue);
  const profileVenue = venueChoice === OTHER_VENUE ? venueOther.trim() : venueChoice;
  const [profilePosition, setProfilePosition] = useState(initialStats.positionTitle);
  const [profileBadge, setProfileBadge] = useState(initialStats.badge);
  const [profileArea, setProfileArea] = useState(prefectures.includes(initialStats.businessArea as Prefecture) ? initialStats.businessArea : '');
  const [profileIndustry, setProfileIndustry] = useState(initialStats.primaryIndustry);
  const [profileIndustryGroup, setProfileIndustryGroup] = useState<string>(getIndustryGroup(initialStats.primaryIndustry)?.name ?? '');
  const [profileNotifyIndustries, setProfileNotifyIndustries] = useState(initialStats.notifyIndustries);
  const [profileNotifyGroup, setProfileNotifyGroup] = useState<string>(getIndustryGroup(initialStats.notifyIndustries[0] ?? '')?.name ?? 'IT・システム');
  const [profileRevenue, setProfileRevenue] = useState(initialStats.annualRevenueBand);
  const [requestIndustries, setRequestIndustries] = useState<string[]>([]);
  const [requestIndustryGroup, setRequestIndustryGroup] = useState('IT・システム');
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(initialStats.avatarUrl);
  const [cropSource, setCropSource] = useState('');
  const [cropFileName, setCropFileName] = useState('profile.jpg');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const [modal, setModal] = useState<'request' | 'intro' | 'detail' | 'cards' | 'responses' | null>(null);
  const [cardStartMode, setCardStartMode] = useState<'list' | 'capture'>('list');
  const [selected, setSelected] = useState<BoardRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [referral, setReferral] = useState<(ReferralSummary & { url: string }) | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const venueOptions = useMemo(() => [...new Set(requests.map((item) => item.authorVenue).filter(Boolean))].sort(), [requests]);
  // 募集状況で先に切ってから、カテゴリの件数を数える。表示と件数がずれないようにする。
  const statusMatched = useMemo(() => requests.filter((item) => statusFilter === 'all' || (statusFilter === 'open') === isOpenRequest(item)), [requests, statusFilter]);
  const shown = useMemo(() => statusMatched.filter((item) =>
    (filter === 'all' || item.category === filter) &&
    (revenueFilter === 'all' || item.authorRevenueBand === revenueFilter) &&
    (venueFilter === 'all' || item.authorVenue === venueFilter) &&
    (regionFilter === 'all' || getRegion(item.authorBusinessArea) === regionFilter) &&
    matchesIndustry(item.industryTags, industryFilter)
  ), [filter, industryFilter, regionFilter, revenueFilter, statusMatched, venueFilter]);
  // 通知はアプリを出してから。それまでは選んだ業種をホームのおすすめに使う。
  const recommended = useMemo(() => requests.filter((item) =>
    isOpenRequest(item) && item.authorName !== userName &&
    stats.notifyIndustries.some((industry) => matchesIndustry(item.industryTags, getIndustryGroup(industry)?.name ?? industry))
  ).slice(0, 12), [requests, stats.notifyIndustries, userName]);
  const viewedRequests = useMemo(() => viewedIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is BoardRequest => Boolean(item)), [requests, viewedIds]);
  const favoriteRequests = useMemo(() => favoriteIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is BoardRequest => Boolean(item)), [favoriteIds, requests]);
  const canPostRequest = stats.requestLimit < 0 || stats.requestsThisMonth < stats.requestLimit;
  const count = (category: string) => category === 'all' ? statusMatched.length : statusMatched.filter((item) => item.category === category).length;
  const rankStart = rankThresholds[Math.max(0, stats.level - 1)] ?? 0;
  const rankProgress = stats.level >= rankThresholds.length ? 100 : Math.max(0, Math.min(100, ((stats.introCount - rankStart) / Math.max(1, stats.nextRankAt - rankStart)) * 100));
  const introductionsToNextRank = Math.max(0, stats.nextRankAt - stats.introCount);
  useEffect(() => () => {
    if (photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);
  useEffect(() => () => {
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource);
  }, [cropSource]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedHistory = window.localStorage.getItem(historyStorageKey);
        const savedFavorites = window.localStorage.getItem(favoriteStorageKey);
        const parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
        const parsedFavorites = savedFavorites ? JSON.parse(savedFavorites) : [];
        setViewedIds(Array.isArray(parsedHistory) && parsedHistory.length ? parsedHistory : initialRequests.slice(0, 4).map((item) => item.id));
        setFavoriteIds(Array.isArray(parsedFavorites) ? parsedFavorites : []);
      } catch {
        setViewedIds(initialRequests.slice(0, 4).map((item) => item.id));
      } finally {
        setLocalListsReady(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialRequests]);
  useEffect(() => {
    if (!localListsReady) return;
    window.localStorage.setItem(historyStorageKey, JSON.stringify(viewedIds));
  }, [localListsReady, viewedIds]);
  useEffect(() => {
    if (!localListsReady) return;
    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favoriteIds));
  }, [favoriteIds, localListsReady]);
  useEffect(() => {
    const timer = window.setInterval(() => setCarouselIndex((current) => (current + 1) % 4), 5500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (activeTab !== 'profile' || referral) return;
    let alive = true;
    fetch('/api/referral').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setReferral(data as ReferralSummary & { url: string }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab, referral]);

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
    setProfilePhoto(null); setPhotoPreview(avatarUrl);
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
    if (!stats.avatarUrl) { showProfile(); return showToast('投稿の前に顔写真を登録してください。'); }
    setModal('request');
  }

  function openIntroduction(need: BoardRequest) {
    if (!stats.avatarUrl) { showProfile(); return showToast('紹介の前に顔写真を登録してください。'); }
    setSelected(need); setModal('intro');
  }

  function openCards(mode: 'list' | 'capture') { setCardStartMode(mode); setModal('cards'); }

  function openNeed(need: BoardRequest) {
    setViewedIds((current) => [need.id, ...current.filter((id) => id !== need.id)].slice(0, 12));
    setSelected(need);
    setModal('detail');
  }

  function toggleFavorite(need: BoardRequest) {
    const isFavorite = favoriteIds.includes(need.id);
    setFavoriteIds((current) => isFavorite ? current.filter((id) => id !== need.id) : [need.id, ...current]);
    showToast(isFavorite ? 'お気に入りから外しました。' : 'お気に入りに保存しました。');
  }

  function showHome() {
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showSearch(industry = industryFilter) {
    setIndustryFilter(industry);
    setActiveTab('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showProfile() {
    setModal(null);
    setActiveTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openCurrentBanner() {
    if (carouselIndex === 0) return openRequest();
    if (carouselIndex === 1) return setModal('responses');
    if (carouselIndex === 2) return showProfile();
    openCards('capture');
  }

  async function copyInviteLink() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2600);
    } catch {
      showToast('コピーできませんでした。リンクを長押しして選択してください。');
    }
  }

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3800); }
  function toggleIndustry(value: string, selected: string[], setSelected: (values: string[]) => void, max: number) {
    if (selected.includes(value)) return setSelected(selected.filter((item) => item !== value));
    if (selected.length >= max) return showToast(`業種タグは${max}個まで選択できます。`);
    setSelected([...selected, value]);
  }

  return (
    <main className="app-shell" id="home">
      <header className="mobile-header">
        <button className="mobile-brand" onClick={showHome}><span className="brand-mark">G</span><b>GIVE HUB</b></button>
        <button className="header-profile" onClick={showProfile}><span><small>こんにちは</small><b>{userName}</b></span><Avatar src={stats.avatarUrl} name={userName} className="mini-avatar" /></button>
      </header>

      {activeTab === 'home' ? <div className="home-dashboard">
        <section className="hero-carousel" aria-label="GIVE HUBの使い方">
          <button key={carouselIndex} className="hero-image-slide" onClick={openCurrentBanner} aria-label={`${topBanners[carouselIndex].alt}を開く`}><img src={topBanners[carouselIndex].src} alt={topBanners[carouselIndex].alt} /></button>
          <div className="carousel-dots" aria-label="バナーを切り替える">{[0,1,2,3].map((index) => <button key={index} aria-label={`${index + 1}枚目`} className={carouselIndex === index ? 'active' : ''} onClick={() => setCarouselIndex(index)} />)}</div>
        </section>

        <HomeShelf title="あなたにおすすめの探しごと" count={recommended.length}
          emptyTitle={stats.notifyIndustries.length ? '今はおすすめできる探しごとがありません' : 'おすすめに出したい業種を選びましょう'}
          emptyText={stats.notifyIndustries.length ? '選んだ業種の探しごとが投稿されると、ここに並びます。' : 'マイページで業種を選ぶと、関係のありそうな探しごとがここに並びます。'}
          onMore={() => stats.notifyIndustries.length ? showSearch() : showProfile()}>
          {recommended.map((need) => <HomeRequestCard key={need.id} need={need} favorite={favoriteIds.includes(need.id)} onOpen={() => openNeed(need)} onFavorite={() => toggleFavorite(need)} />)}
        </HomeShelf>

        <HomeShelf title="閲覧履歴" count={viewedRequests.length} emptyTitle="まだ閲覧履歴がありません" emptyText="探しごとを開くと、ここからすぐ見返せます。" onMore={() => showSearch()}>
          {viewedRequests.map((need) => <HomeRequestCard key={need.id} need={need} favorite={favoriteIds.includes(need.id)} onOpen={() => openNeed(need)} onFavorite={() => toggleFavorite(need)} />)}
        </HomeShelf>

        <HomeShelf title="お気に入り保存した探しごと" count={favoriteRequests.length} emptyTitle="気になる探しごとを保存できます" emptyText="カードのハートを押すと、ここにまとまります。" onMore={() => showSearch()}>
          {favoriteRequests.map((need) => <HomeRequestCard key={need.id} need={need} favorite onOpen={() => openNeed(need)} onFavorite={() => toggleFavorite(need)} />)}
        </HomeShelf>

        <section className="industry-home">
          <div className="home-section-heading"><div><p>業種から探す</p><h2>ジャンル別の探しごと検索</h2></div><button onClick={() => showSearch('all')}>すべて見る</button></div>
          <div className="industry-grid">{industryGroups.map((group) => <button key={group.name} onClick={() => showSearch(group.name)}><span><IndustryIcon group={group.name} /></span><b>{group.name}</b><small>{requests.filter((item) => matchesIndustry(item.industryTags, group.name)).length}件</small></button>)}</div>
        </section>

        {!stats.avatarUrl && <button className="photo-required-banner" onClick={showProfile}><span>顔写真の登録が必要です</span><b>本人だと分かる写真を登録すると、投稿・紹介ができます。</b><i>登録する →</i></button>}
      </div> : activeTab === 'search' ? <section className="mobile-board search-page" id="board">
        <div className="section-title"><div><p>REQUESTS</p><h2>{industryFilter === 'all' ? 'みんなの探しごと' : industryFilter}</h2></div><span>{shown.length}件</span></div>
        {industryFilter !== 'all' && <button className="clear-industry" onClick={() => setIndustryFilter('all')}><IndustryIcon group={getIndustryGroup(industryFilter)?.name ?? 'その他'} />{industryFilter}で絞り込み中 <i>×</i></button>}
        {industryFilter !== 'all' && getIndustryGroup(industryFilter) && <div className="subindustry-filter" aria-label="詳細業種で絞り込む"><button className={industryFilter === getIndustryGroup(industryFilter)?.name ? 'selected' : ''} onClick={() => setIndustryFilter(getIndustryGroup(industryFilter)?.name ?? 'all')}>すべて</button>{getIndustryGroup(industryFilter)?.children.map((industry) => <button key={industry} className={industryFilter === industry ? 'selected' : ''} onClick={() => setIndustryFilter(industry)}>{industry}</button>)}</div>}
        <div className="filters" role="group" aria-label="投稿を絞り込む">{[['all','すべて'],['project','案件'],['collaboration','協業先'],['consultation','相談']].map(([key,label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}<span>{count(key)}</span></button>)}</div>
        <div className="member-filters">
          <p>絞り込む</p>
          <label className="wide"><span>募集状況</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'open' | 'closed' | 'all')}><option value="open">募集中</option><option value="closed">募集終了</option><option value="all">すべて</option></select></label>
          <label><span>所属会場</span><select value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}><option value="all">すべての会場</option>{venueOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
          <label><span>エリア</span><select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">全国</option>{regions.map((region) => <option value={region.name} key={region.name}>{region.name}</option>)}</select></label>
          <label><span>業種</span><select value={getIndustryGroup(industryFilter)?.name ?? 'all'} onChange={(event) => setIndustryFilter(event.target.value)}><option value="all">すべての業種</option>{industryGroups.map((group) => <option value={group.name} key={group.name}>{group.name}</option>)}</select></label>
          <label><span>会社の年商</span><select value={revenueFilter} onChange={(event) => setRevenueFilter(event.target.value)}><option value="all">すべての年商</option>{Object.entries(revenueBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <div className="card-list">
          {shown.length === 0 ? <div className="empty"><b>条件に合う投稿がありません</b><span>絞り込みを変えて探してみましょう。</span></div> : shown.map((need) => (
            <article className={isOpenRequest(need) ? 'need-card' : 'need-card closed'} key={need.id} onClick={() => openNeed(need)}>
              <div className="card-topline"><span className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</span><span className="card-top-actions">{isOpenRequest(need) ? <span className="deadline">あと{daysLeft(need.deadline)}日</span> : <span className="deadline ended">募集終了</span>}<button className={favoriteIds.includes(need.id) ? 'card-heart active' : 'card-heart'} aria-label={favoriteIds.includes(need.id) ? 'お気に入りから外す' : 'お気に入りに保存'} onClick={(event) => { event.stopPropagation(); toggleFavorite(need); }}>♥</button></span></div>
              <h3>{need.title}</h3><p className="need-body">{need.description}</p>
              <div className="industry-tags" aria-label="関連業種">{need.industryTags.map((industry) => <span key={industry}>{industry}</span>)}</div>
              <dl className="details"><div><dt>予算</dt><dd>{need.budgetLabel}</dd></div><div><dt>エリア</dt><dd>{need.area}</dd></div></dl>
              <div className="card-person"><Avatar src={need.authorAvatarUrl} name={need.authorName} className="member-avatar" /><p><b>{need.authorName}</b><small>{need.authorPositionTitle && `${need.authorPositionTitle}｜`}{need.authorCompany || '会社名未設定'}</small></p><span>紹介 {need.introCount}件</span></div>
              <div className="member-context"><span>会場 {need.authorVenue}</span>{need.authorBusinessArea && <span>エリア {need.authorBusinessArea}</span>}{need.authorBadge && <span>{need.authorBadge}</span>}{need.authorRevenueBand && <span>年商 {revenueBands[need.authorRevenueBand]}</span>}</div>
              <button className="intro-button" onClick={(event) => { event.stopPropagation(); openIntroduction(need); }}>この人を紹介できる <span>→</span></button>
            </article>
          ))}
        </div>
      </section> : <section className="profile-page" aria-labelledby="profile-page-title">
        <header className="profile-page-heading"><p>MY PAGE</p><h1 id="profile-page-title">マイページ</h1><span>会員情報・おすすめ・ランクを管理できます。</span></header>
        <section className={`rank-card rank-${stats.rank.toLowerCase()} profile-rank-card`} aria-label={`${stats.rank}会員ランクカード`}>
          <div className="rank-card-top"><span className="rank-crown">♛</span><b>GIVE HUB</b><small>MEMBER RANK</small></div>
          <div className="rank-member-row"><Avatar src={photoPreview} name={userName} className="rank-member-avatar" /><span><b>{userName}</b><small>{stats.badge || 'バッヂ未設定'} · {stats.venue}</small></span></div>
          <p className="rank-eyebrow">CURRENT RANK</p><h1>{stats.rank}</h1><h2>MEMBER</h2>
          <div className="rank-progress"><div className="rank-progress-copy"><b>{stats.level >= rankThresholds.length ? '最高ランクに到達' : `あと${introductionsToNextRank}件でランクアップ`}</b><span>紹介実績 {stats.introCount}件</span></div><span className="rank-progress-track"><i style={{ width: `${rankProgress}%` }} /></span></div>
          <div className="rank-card-bottom"><span><small>MEMBER</small><b>{userName}</b></span><span><small>VENUE</small><b>{stats.venue}</b></span><span><small>POINTS</small><b>{stats.points}</b></span></div>
        </section>
        <section className={stats.pro ? 'plan-card pro' : 'plan-card'} aria-label="ご利用プラン">
          <div className="plan-heading"><p>PLAN</p><h2>{stats.pro ? '有料会員' : '無料会員'}</h2>{stats.pro && stats.planPeriodEnd && <span>{stats.planPeriodEnd} まで</span>}</div>
          <ul className="plan-lines">
            <li><b>探しごとの投稿</b><span>{stats.requestLimit < 0 ? '無制限' : `今月 ${stats.requestsThisMonth} / ${stats.requestLimit} 件`}</span></li>
            <li><b>名刺帳</b><span>{stats.businessCardLimit < 0 ? 'カメラで一括読み取り・無制限' : `${stats.businessCards} / ${stats.businessCardLimit} 枚`}</span></li>
            <li><b>掲示板を見る・人を紹介する</b><span>無制限</span></li>
          </ul>
          {!stats.pro && <p className="plan-note">仲間を1人招待すると、有料機能を1ヶ月お試しいただけます。ご契約は運営窓口へお問い合わせください。</p>}
        </section>

        {referral && <section className="invite-card" aria-label="仲間を招待する">
          <div className="invite-heading"><p>INVITE</p><h2>仲間を招待する</h2><span>あなたの招待リンクから入会して{referral.qualifyDays}日続いた方1人につき、{stats.pro ? '会費が1ヶ月無料になります' : '有料機能が1ヶ月使えます'}（年{referral.capPerYear}ヶ月まで）。</span></div>
          <button className="invite-link" onClick={copyInviteLink}><span>{referral.url.replace(/^https?:\/\//, '')}</span><i>{inviteCopied ? 'コピーしました' : 'リンクをコピー'}</i></button>
          <dl className="invite-stats">
            <div><dt>招待した人</dt><dd>{referral.invitedCount}<small>人</small></dd></div>
            <div><dt>利用中</dt><dd>{referral.activeCount}<small>人</small></dd></div>
            <div><dt>{stats.pro ? '無料になった月' : '有料になった月'}</dt><dd>{referral.earnedMonths}<small>ヶ月</small></dd></div>
          </dl>
          <p className="invite-note">{referral.waitingCount > 0 && `${referral.waitingCount}人が運営の確認待ちです。`}{referral.qualifyingCount > 0 && `${referral.qualifyingCount}人が${referral.qualifyDays}日経過待ちです。`}{referral.remainingThisYear > 0 ? `直近1年ではあと${referral.remainingThisYear}ヶ月ぶん受け取れます。` : `直近1年ぶんの${referral.capPerYear}ヶ月は使い切りました。`}{referral.waitingCredits > 0 && `${referral.waitingCredits}人ぶんが順番待ちです。枠が空きしだい自動で反映されるので、紹介が無駄になることはありません。`}</p>
        </section>}

        <div className="profile-form profile-page-form">
          <div className="profile-form-heading"><b>プロフィール情報</b><span>入力内容は探しごとや紹介時に表示されます。</span></div>
          <label className="photo-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /><span className="photo-upload-preview">{photoPreview ? <img src={photoPreview} alt="登録する顔写真のプレビュー" /> : <b>＋</b>}</span><span><b>顔写真 <em>必須</em></b><small>本人だと分かる正面の写真を選択<br />JPEG・PNG・WebP／5MBまで</small></span><i>{stats.avatarUrl ? '変更する' : '写真を選ぶ'}</i></label>
          <label>会社名 <small>必須</small><input value={profileCompany} onChange={(event) => setProfileCompany(event.target.value)} maxLength={80} placeholder="株式会社〇〇" required /></label>
          <div className="profile-venue-select">
            <p>所属会場 <small>必須</small></p>
            <label>都道府県<select value={venuePrefecture} onChange={(event) => { setVenuePrefecture(event.target.value); setVenueChoice(''); }}><option value="">選択してください</option>{venuePrefectures.map((prefecture) => <option value={prefecture} key={prefecture}>{prefecture}</option>)}</select></label>
            <label>会場<select value={venueChoice} onChange={(event) => setVenueChoice(event.target.value)} disabled={!venuePrefecture && venueChoice !== OTHER_VENUE}><option value="">会場を選択</option>{(venuesByPrefecture[venuePrefecture] ?? []).map((venue) => <option value={venue} key={venue}>{venue}</option>)}<option value={OTHER_VENUE}>その他（自由入力）</option></select></label>
            {venueChoice === OTHER_VENUE && <label className="wide">会場名 <small>正式な会場名を入力</small><input value={venueOther} onChange={(event) => setVenueOther(event.target.value)} maxLength={60} placeholder="例：ひるのめぐろ会場" /></label>}
          </div>
          <div className="profile-row"><label>肩書き <small>任意</small><input value={profilePosition} onChange={(event) => setProfilePosition(event.target.value)} maxLength={60} placeholder="世話人" /></label><label>バッヂ <small>任意</small><select value={profileBadge} onChange={(event) => setProfileBadge(event.target.value)}><option value="">選択しない</option><option value="緑">緑</option><option value="赤">赤</option><option value="ゴールド">ゴールド</option><option value="ダイヤモンド">ダイヤモンド</option></select></label></div>
          <label>活動エリア <small>任意・検索に使われます</small><select value={profileArea} onChange={(event) => setProfileArea(event.target.value)}><option value="">選択しない</option>{prefectures.map((prefecture) => <option value={prefecture} key={prefecture}>{prefecture}</option>)}</select></label>
          <div className="profile-industry-select"><p>自分の業種 <small>おすすめの設定に使われます</small></p><label>大分類<select value={profileIndustryGroup} onChange={(event) => { setProfileIndustryGroup(event.target.value); setProfileIndustry(''); }}><option value="">選択してください</option>{industryGroups.map((group) => <option value={group.name} key={group.name}>{group.name}</option>)}</select></label><label>詳細業種<select value={profileIndustry} onChange={(event) => { const value = event.target.value; setProfileIndustry(value); if (value && !profileNotifyIndustries.includes(value)) setProfileNotifyIndustries((current) => [...current, value].slice(0, 6)); }} disabled={!profileIndustryGroup}><option value="">詳細業種を選択</option>{profileIndustry === profileIndustryGroup && <option value={profileIndustryGroup}>大分類のみ（旧設定）</option>}{industryGroups.find((group) => group.name === profileIndustryGroup)?.children.map((industry) => <option value={industry} key={industry}>{industry}</option>)}</select></label></div>
          <IndustryPicker legend="おすすめに出したい業種" note="6個まで" description="選んだ詳細業種の探しごとが、ホームの「あなたにおすすめ」に出ます。" selected={profileNotifyIndustries} activeGroup={profileNotifyGroup} onGroupChange={setProfileNotifyGroup} onToggle={(industry) => toggleIndustry(industry, profileNotifyIndustries, setProfileNotifyIndustries, 6)} className="profile-tag-field" />
          <label>会社の年商 <small>任意</small><select value={profileRevenue} onChange={(event) => setProfileRevenue(event.target.value)}><option value="">選択しない</option>{Object.entries(revenueBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <button className="profile-save-button" onClick={saveProfile} disabled={busy || !profileCompany.trim() || !profileVenue.trim() || (!stats.avatarUrl && !profilePhoto)}>{busy ? '保存中…' : 'プロフィールを保存する'}</button>
        </div>
      </section>}

      <nav className="bottom-nav" aria-label="アプリメニュー">
        <button className={activeTab === 'home' ? 'active' : ''} onClick={showHome}><span>⌂</span><small>ホーム</small></button>
        <button className={activeTab === 'search' ? 'active' : ''} onClick={() => showSearch()}><span>⌕</span><small>困りごと</small></button>
        <button className="nav-post" onClick={openRequest} aria-label="探しごとを投稿する"><span>＋</span></button>
        <button onClick={() => openCards('list')}><span>▣</span><small>名刺</small></button>
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={showProfile}><span>●</span><small>マイページ</small></button>
      </nav>

      {modal === 'request' && !canPostRequest && <Modal title="今月ぶんの投稿は完了しています" lead={`無料会員が投稿できる探しごとは月${stats.requestLimit}件までです。`} onClose={() => setModal(null)}><div className="quota-block"><p>来月になるとまた投稿できます。今すぐ続けて投稿したい場合は、有料会員へお切り替えください。</p><p>仲間を1人招待して{referral?.qualifyDays ?? 60}日続けてご利用いただくと、有料機能を1ヶ月お試しいただけます。マイページの「仲間を招待する」から招待リンクをお送りください。</p><button className="submit-button" onClick={() => { setModal(null); showProfile(); }}>マイページを開く</button></div></Modal>}

      {modal === 'request' && canPostRequest && <Modal title="探しごとを投稿" lead="紹介してほしい人を具体的に書きましょう。" onClose={() => setModal(null)}><form className="form" onSubmit={submitRequest}><label>探しているもの<select name="category" required defaultValue=""><option value="" disabled>選択してください</option><option value="project">案件の発注先</option><option value="collaboration">協業パートナー</option><option value="consultation">相談相手・情報</option></select></label><label>タイトル<input name="title" required maxLength={90} placeholder="例：採用に強い動画制作会社" /></label><label>詳しい内容<textarea name="description" required maxLength={600} rows={4} placeholder="どんな課題があり、どんな人を紹介してほしいか" /></label><IndustryPicker legend="関連する業種" note="必須・3個まで" selected={requestIndustries} activeGroup={requestIndustryGroup} onGroupChange={setRequestIndustryGroup} onToggle={(industry) => toggleIndustry(industry, requestIndustries, setRequestIndustries, 3)} /><label>予算感<input name="budgetLabel" required maxLength={60} placeholder="例：20〜40万円／応相談" /></label><label>希望エリア<input name="area" required maxLength={60} placeholder="例：東京都・オンライン" /></label><label>募集期限<input name="deadline" type="date" required min="2026-08-27" /></label><button className="submit-button" disabled={busy || !requestIndustries.length}>{busy ? '投稿しています…' : '投稿する'}</button></form></Modal>}

      {modal === 'intro' && selected && <Modal title="知っている人を紹介" lead={`「${selected.title}」への紹介です。`} onClose={() => setModal(null)}><form className="form" onSubmit={submitIntroduction}><label>お名前<input name="personName" required maxLength={60} /></label><label>会社・屋号<input name="personCompany" required maxLength={80} /></label><label>あなたとの関係<input name="relationship" required maxLength={120} placeholder="例：取引先、友人" /></label><label>紹介したい理由<textarea name="fitReason" required maxLength={400} rows={3} /></label><label className="consent"><input type="checkbox" name="consentConfirmed" required /> ご本人に紹介の了承を得ています</label><button className="submit-button" disabled={busy}>{busy ? '届けています…' : '紹介を届ける'}</button></form></Modal>}

      {modal === 'responses' && <Modal title="届いた紹介" lead="あなたが投稿した探しごとへの紹介です。" onClose={() => setModal(null)}><ReceivedIntroductions /></Modal>}

      {modal === 'detail' && selected && <Modal title="探しごとの詳細" lead={`${selected.authorName}さんの探しごとです。`} onClose={() => setModal(null)}><article className="need-detail">
        <div className="card-topline"><span className={`kind ${categories[selected.category].className}`}>{categories[selected.category].label}</span><button className={favoriteIds.includes(selected.id) ? 'detail-heart active' : 'detail-heart'} onClick={() => toggleFavorite(selected)}>♥ {favoriteIds.includes(selected.id) ? '保存済み' : 'お気に入り'}</button></div>
        <h3>{selected.title}</h3><p>{selected.description}</p>
        <div className="industry-tags">{selected.industryTags.map((industry) => <span key={industry}>{industry}</span>)}</div>
        <dl><div><dt>予算</dt><dd>{selected.budgetLabel}</dd></div><div><dt>希望エリア</dt><dd>{selected.area}</dd></div><div><dt>募集期限</dt><dd>{selected.deadline}</dd></div></dl>
        <div className="detail-author"><Avatar src={selected.authorAvatarUrl} name={selected.authorName} className="member-avatar" /><p><b>{selected.authorName}</b><span>{selected.authorPositionTitle && `${selected.authorPositionTitle}｜`}{selected.authorCompany || '会社名未設定'}</span><small>{selected.authorVenue}{selected.authorBusinessArea && `・${selected.authorBusinessArea}`}</small></p></div>
        <button className="submit-button" onClick={() => openIntroduction(selected)}>この人を紹介できる</button>
      </article></Modal>}

      {modal === 'cards' && <BusinessCardManager initialMode={stats.pro ? cardStartMode : 'list'} pro={stats.pro} onClose={() => setModal(null)} onNotice={showToast} />}
      {cropSource && <div className="crop-backdrop"><section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title"><header><button onClick={() => setCropSource('')}>キャンセル</button><div><h2 id="crop-title">顔写真を調整</h2><p>指で動かして、顔が中央に来るようにします</p></div><button className="crop-confirm" onClick={confirmCrop} disabled={cropping || !croppedArea}>{cropping ? '処理中' : '決定'}</button></header><div className="crop-stage"><Cropper image={cropSource} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} minZoom={1} maxZoom={4} zoomSpeed={0.35} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setCroppedArea(pixels)} disableAutomaticStylesInjection /></div><div className="crop-controls"><label><span>顔の大きさ</span><input type="range" min="1" max="4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="顔写真の拡大率" /><b>{Math.round(zoom * 100)}%</b></label><p>写真を指で動かせます。丸の中がプロフィール写真に表示されます。</p></div></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function IndustryIcon({ group }: { group: string }) {
  const source = industryIcons[group] ?? industryIcons['その他'];
  return <i className="industry-icon" style={{ '--icon': `url(${source})` } as CSSProperties} aria-hidden="true" />;
}

function HomeShelf({ title, count, emptyTitle, emptyText, onMore, children }: { title: string; count: number; emptyTitle: string; emptyText: string; onMore: () => void; children: React.ReactNode }) {
  return <section className="home-shelf"><div className="home-section-heading"><div><h2>{title}</h2><p>{count ? `${count}件` : 'まだありません'}</p></div><button onClick={onMore}>もっと見る</button></div>{count ? <div className="home-card-row">{children}</div> : <div className="home-empty"><span>♡</span><div><b>{emptyTitle}</b><p>{emptyText}</p></div><button onClick={onMore}>探してみる</button></div>}</section>;
}

function IndustryPicker({ legend, note, description, selected, activeGroup, onGroupChange, onToggle, className = '' }: { legend: string; note: string; description?: string; selected: string[]; activeGroup: string; onGroupChange: (value: string) => void; onToggle: (value: string) => void; className?: string }) {
  const active = industryGroups.find((group) => group.name === activeGroup) ?? industryGroups[0];
  return <fieldset className={`tag-field hierarchical-industry-picker ${className}`}><legend>{legend} <small>{note}</small></legend>{description && <p>{description}</p>}<div className="industry-major-picker" aria-label="業種の大分類">{industryGroups.map((group) => <button type="button" key={group.name} className={active.name === group.name ? 'selected' : ''} onClick={() => onGroupChange(group.name)}>{group.name}</button>)}</div><div className="industry-detail-panel"><h4><span>大分類</span>{active.name}<small>詳細業種を選択</small></h4><div className="tag-picker">{active.children.map((industry) => <button type="button" key={industry} className={selected.includes(industry) ? 'selected' : ''} onClick={() => onToggle(industry)}>{industry}</button>)}</div></div>{selected.length > 0 && <div className="selected-industry-list"><b>選択中</b>{selected.map((industry) => <button type="button" key={industry} onClick={() => onToggle(industry)}>{industry}<span>×</span></button>)}</div>}</fieldset>;
}

function HomeRequestCard({ need, favorite, onOpen, onFavorite }: { need: BoardRequest; favorite: boolean; onOpen: () => void; onFavorite: () => void }) {
  const primaryIndustry = need.industryTags[0] || 'その他';
  const primaryGroup = getIndustryGroup(primaryIndustry)?.name ?? 'その他';
  return <article className="home-request-card"><button className={favorite ? 'home-heart active' : 'home-heart'} aria-label={favorite ? 'お気に入りから外す' : 'お気に入りに保存'} onClick={onFavorite}>♥</button><button className="home-request-open" onClick={onOpen}>
    <span className="home-request-cover"><IndustryIcon group={primaryGroup} /><small>{primaryIndustry}</small></span>
    <span className="home-request-copy"><small><b className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</b> あと{daysLeft(need.deadline)}日</small><strong>{need.title}</strong><span>{need.budgetLabel}</span><em>{need.authorName}・{need.authorVenue}</em></span>
  </button></article>;
}

function Modal({ title, lead, onClose, children }: { title: string; lead: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><span className="sheet-handle" /><button className="modal-close" onClick={onClose} aria-label="閉じる">×</button><h2 id="modal-title">{title}</h2><p className="modal-lead">{lead}</p>{children}</section></div>; }
function Avatar({ src, name, className }: { src: string; name: string; className: string }) { return <span className={className}>{src ? <img src={src} alt={`${name}さんの顔写真`} /> : <span>{name.slice(0, 1)}</span>}</span>; }
function isOpenRequest(need: BoardRequest) {
  return need.status === 'open' && new Date(`${need.deadline}T23:59:59+09:00`).getTime() >= Date.now();
}
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
