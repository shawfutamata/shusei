'use client';

import { ChangeEvent, CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { AdSlot, BoardRequest, MemberStats, ReferralSummary } from '@/db/data';
import ReceivedIntroductions from './ReceivedIntroductions';
import RequestComments from './RequestComments';
import FacebookLink from './FacebookLink';
import { getRegion, prefectures, regions, type Prefecture } from './profile-options';
import { getIndustryGroup, industryGroups, matchesIndustry } from './industry-options';
import { findVenuePrefecture, isListedVenue, OTHER_VENUE, venuePrefectures, venuesByPrefecture } from './venue-options';
import { UNLIMITED, plans, type BillingCycle, type Plan } from './entitlements';
import { feedbackCategories } from './feedback-options';
import { adSlotPrice, planCatalog, planPerMonthNote, planPostLimit, planPrice } from './plan-catalog';
import RankCrest, { CrownMark } from './RankCrest';
import PerkIcon from './PerkIcon';
import { EXTEND_DAYS, PIN_DAYS, PROMO_DAYS, canExtendRequest, canPinRequest, canPromoteInIndustry, descriptionLimit, notifyIndustryLimit, photoLimit, rankNames, rankPerks, rankThresholds } from './rank-perks';
import { serviceName } from './brand';
import BrandMark from './BrandMark';
import { detailImage, listThumbnail } from './resize-image';
import AdAnalytics, { formatRange } from './AdAnalytics';
import type { AdDay } from '@/db/data';

import { adBannerThemes, makeBannerFile, makeBannerPreview } from './ad-banner';

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
const adSeenStorageKey = 'tasuki-ad-seen-v1';

/** 並びを毎回入れ替える。出稿した人へ順番が均等に回るようにするため。 */
function shuffle<T>(items: T[]) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(Math.random() * (index + 1));
    [list[index], list[pick]] = [list[pick], list[index]];
  }
  return list;
}

/** 成果の数え上げ。落ちても画面は止めない（数字が1件抜けるだけ）。 */
function trackAd(payload: { views?: string[]; clicks?: string[] }) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.('/api/ads/track', new Blob([body], { type: 'application/json' }))) return;
  } catch { /* sendBeaconが使えない環境ではfetchで送る */ }
  fetch('/api/ads/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

const historyStorageKey = 'give-hub-request-history-v1';
const favoriteStorageKey = 'give-hub-request-favorites-v1';

/** /api/ads が返すもの。金額は含まない（画面が plan-catalog から出す）。 */
type AdOffer = {
  ready: boolean; eligible: boolean; level: number; rank: string;
  minRankLevel: number; titleMax: number;
  concurrent: number; maxDays: number; daysAhead: number;
  calendar: { date: string; remaining: number }[]; slots: AdSlot[];
};

/** その枠がいまどういう状態か。掲載前・掲載中・終わった、を1か所で決める。 */
function adState(ad: AdSlot) {
  const now = new Date().toISOString().slice(0, 10);
  if (ad.status === 'stopped') return { label: '掲載を停止しています', tone: 'stopped', editable: false };
  if (ad.endDate < now) return { label: '掲載おわり', tone: 'past', editable: false };
  if (ad.startDate > now) return { label: `${formatRange(ad.startDate, ad.endDate)}に掲載`, tone: 'soon', editable: true };
  return { label: ad.imageUrl ? '掲載中' : '内容が未入力です', tone: ad.imageUrl ? 'live' : 'todo', editable: true };
}


/** 日付をずらす。YYYY-MM-DD のまま扱う（サーバー側と同じ数え方）。 */
function shiftDate(date: string, days: number) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export default function BoardClient({ initialRequests, initialStats, initialAds, userName, adReturn = '' }: { initialRequests: BoardRequest[]; initialStats: MemberStats; initialAds: AdSlot[]; userName: string; adReturn?: string }) {
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [ads, setAds] = useState(initialAds);
  const [filter, setFilter] = useState('all');
  const [revenueFilter, setRevenueFilter] = useState('all');
  const [venueFilter, setVenueFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [industryFilter, setIndustryFilter] = useState('all');
  // 出稿枠を買って戻ってきた人は、入稿できるマイページから始める。
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'profile'>(adReturn === 'done' || !initialStats.avatarUrl ? 'profile' : 'home');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
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
  const [profileFacebook, setProfileFacebook] = useState(initialStats.facebookUrl);
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
  const [modal, setModal] = useState<'request' | 'intro' | 'detail' | 'responses' | 'ads' | 'perks' | null>(null);
  const [selected, setSelected] = useState<BoardRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [requestPhotos, setRequestPhotos] = useState<File[]>([]);
  const [requestPhotoPreviews, setRequestPhotoPreviews] = useState<string[]>([]);
  const [planCycle, setPlanCycle] = useState<BillingCycle>('month');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [referral, setReferral] = useState<(ReferralSummary & { url: string; billing?: { ready: boolean; yearly: boolean; hasCustomer: boolean; cycle: BillingCycle; creditedYen: number; creditPerReferralYen: number } }) | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [adInfo, setAdInfo] = useState<AdOffer | null>(null);
  const [editingAd, setEditingAd] = useState('');
  const [adFileName, setAdFileName] = useState('');
  const [adMode, setAdMode] = useState<'make' | 'upload'>('make');
  const [adTheme, setAdTheme] = useState(adBannerThemes[0].value);
  const [adTitle, setAdTitle] = useState('');
  const [adPreview, setAdPreview] = useState('');
  const [adUpload, setAdUpload] = useState<File | null>(null);
  const [adStart, setAdStart] = useState('');
  const [adDays, setAdDays] = useState(30);
  const [openStats, setOpenStats] = useState('');
  const [adStats, setAdStats] = useState<{ slot: AdSlot; days: AdDay[] } | null>(null);
  const [openPerk, setOpenPerk] = useState('');

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3800); }

  // 全国の会場を都道府県ごとにまとめて出す。一覧に無い会場（その他で登録された人）も
  // 投稿があるぶんだけ末尾に足して、絞り込めない会場が出ないようにする。
  const venueGroups = useMemo(() => {
    const listed = new Set(venuePrefectures.flatMap((prefecture) => venuesByPrefecture[prefecture]));
    const extras = [...new Set(requests.map((item) => item.authorVenue).filter((venue) => venue && !listed.has(venue)))].sort();
    const groups: Array<[string, string[]]> = venuePrefectures.map((prefecture) => [prefecture, venuesByPrefecture[prefecture]]);
    return extras.length ? [...groups, ['その他', extras] as [string, string[]]] : groups;
  }, [requests]);
  // 募集状況で先に切ってから、カテゴリの件数を数える。表示と件数がずれないようにする。
  const statusMatched = useMemo(() => requests.filter((item) => statusFilter === 'all' || (statusFilter === 'open') === isOpenRequest(item)), [requests, statusFilter]);
  const shown = useMemo(() => {
    const matched = statusMatched.filter((item) =>
      (filter === 'all' || item.category === filter) &&
      (revenueFilter === 'all' || item.authorRevenueBand === revenueFilter) &&
      (venueFilter === 'all' || item.authorVenue === venueFilter) &&
      (regionFilter === 'all' || getRegion(item.authorBusinessArea) === regionFilter) &&
      matchesIndustry(item.industryTags, industryFilter));
    // 業種別プロモーション。その業種で絞ったときだけ、出稿した人を先頭に出す。
    if (industryFilter === 'all') return matched;
    const now = new Date().toISOString();
    const promoted = (item: BoardRequest) => item.promoUntil > now && matchesIndustry([item.promoIndustry], industryFilter);
    return [...matched].sort((a, b) => Number(promoted(b)) - Number(promoted(a)));
  }, [filter, industryFilter, regionFilter, revenueFilter, statusMatched, venueFilter]);
  // 通知はアプリを出してから。それまでは選んだ業種をホームのおすすめに使う。
  const recommended = useMemo(() => requests.filter((item) =>
    isOpenRequest(item) && item.authorName !== userName &&
    stats.notifyIndustries.some((industry) => matchesIndustry(item.industryTags, getIndustryGroup(industry)?.name ?? industry))
  ).slice(0, 12), [requests, stats.notifyIndustries, userName]);
  const viewedRequests = useMemo(() => viewedIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is BoardRequest => Boolean(item)), [requests, viewedIds]);
  const favoriteRequests = useMemo(() => favoriteIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is BoardRequest => Boolean(item)), [favoriteIds, requests]);
  const canPostRequest = stats.requestLimit === UNLIMITED || stats.requestsThisMonth < stats.requestLimit;
  const count = (category: string) => category === 'all' ? statusMatched.length : statusMatched.filter((item) => item.category === category).length;
  const rankStart = rankThresholds[Math.max(0, stats.level - 1)] ?? 0;
  const rankProgress = stats.level >= rankThresholds.length ? 100 : Math.max(0, Math.min(100, ((stats.introCount - rankStart) / Math.max(1, stats.nextRankAt - rankStart)) * 100));
  const introductionsToNextRank = Math.max(0, stats.nextRankAt - stats.introCount);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('billing');
    if (!result) return;
    window.history.replaceState(null, '', window.location.pathname);
    const timer = window.setTimeout(() => showToast(result === 'done'
      ? 'お手続きありがとうございます。プランの反映まで少しお待ちください。'
      : 'お手続きを中断しました。プランは変わっていません。'), 60);
    return () => window.clearTimeout(timer);
  }, []);

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
    if (activeTab !== 'profile' || referral) return;
    let alive = true;
    fetch('/api/referral').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setReferral(data as ReferralSummary & { url: string }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab, referral]);

  // 出稿枠はWebだけの機能。下のメニューからいつでも開けるので、タブに関係なく読む。
  // 設定を開いた時点でも読み直して、他の人に取られた枠が残って見えないようにする。
  useEffect(() => {
    if (activeTab === 'search' && modal !== 'ads') return;
    let alive = true;
    fetch('/api/ads').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setAdInfo(data as AdOffer); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab, modal]);

  // 文字だけのバナーは、打ちながら見え方が変わるようにする。
  useEffect(() => {
    if (!editingAd || adMode !== 'make') return;
    const timer = window.setTimeout(() => {
      setAdPreview(makeBannerPreview({ title: adTitle, company: stats.company, name: userName, theme: adTheme }));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [editingAd, adMode, adTitle, adTheme, stats.company, userName]);

  // 決済から戻ったときの案内。買った直後の人には、出稿の設定をそのまま開く。
  // URLに残った印はすぐ消す（再読込で二度出さないため）。
  useEffect(() => {
    if (!adReturn) return;
    window.history.replaceState(null, '', window.location.pathname);
    const timer = window.setTimeout(() => {
      if (adReturn === 'cancel') return showToast('お申し込みを取りやめました。枠は解放されます。');
      setModal('ads');
      showToast('枠を確保しました。掲載する内容を入れてください。');
    }, 60);
    return () => window.clearTimeout(timer);
  }, [adReturn]);

  // --- ランクの特典を使うところ -------------------------------------------
  // 押せるかどうかの判断はここに集める。実際に止めるのは必ずAPI側（db/data.ts）。
  const pinUsedThisMonth = requests.some((item) => item.mine && item.pinnedUntil.slice(0, 7) >= new Date().toISOString().slice(0, 7));
  const isPinned = (need: BoardRequest) => need.pinnedUntil > new Date().toISOString();
  const canExtend = (need: BoardRequest) => canExtendRequest(stats.level) && !need.extendedAt;
  const canPin = (need: BoardRequest) => canPinRequest(stats.level) && !pinUsedThisMonth && !isPinned(need);

  function ownerToolsNote(need: BoardRequest) {
    if (!canExtendRequest(stats.level)) return `募集の延長は EMERALD、注目ピンは SAPPHIRE から使えます。あと${Math.max(0, rankThresholds[1] - stats.introCount)}件の紹介で EMERALD です。`;
    if (!canPinRequest(stats.level)) return `注目ピンは SAPPHIRE から使えます。あと${Math.max(0, rankThresholds[2] - stats.introCount)}件の紹介で SAPPHIRE です。`;
    if (isPinned(need)) return 'いま一覧のいちばん上に出ています。';
    if (pinUsedThisMonth) return '注目ピンは今月ぶんを使いました。来月またお使いいただけます。';
    return `延長は1件につき1回まで、注目ピンはひと月に1件までです。`;
  }

  const promoUsedThisMonth = requests.some((item) => item.mine && item.promoUntil.slice(0, 7) >= new Date().toISOString().slice(0, 7));
  const isPromoted = (need: BoardRequest) => need.promoUntil > new Date().toISOString();

  async function promoteOwnRequest(need: BoardRequest, industry: string) {
    if (busy) return;
    setBusy(true);
    const response = await fetch(`/api/requests/${encodeURIComponent(need.id)}/promote`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ industry }),
    });
    const result = await response.json() as { industry?: string; until?: string; error?: string };
    setBusy(false);
    if (!response.ok) return showToast(result.error ?? '設定できませんでした。');
    showToast(`「${industry}」の一覧で、${PROMO_DAYS}日間いちばん上に出ます。`);
    await refreshBoard();
    setSelected((current) => current && current.id === need.id ? { ...current, promoIndustry: industry, promoUntil: result.until ?? current.promoUntil } : current);
  }

  async function extendOwnRequest(need: BoardRequest) {
    if (busy) return;
    setBusy(true);
    const response = await fetch(`/api/requests/${encodeURIComponent(need.id)}/extend`, { method: 'POST' });
    const result = await response.json() as { deadline?: string; error?: string };
    setBusy(false);
    if (!response.ok) return showToast(result.error ?? '延長できませんでした。');
    showToast(`募集期限を ${result.deadline} まで延ばしました。`);
    await refreshBoard();
    setSelected((current) => current && current.id === need.id ? { ...current, deadline: result.deadline ?? current.deadline, extendedAt: new Date().toISOString(), status: 'open' } : current);
  }

  async function pinOwnRequest(need: BoardRequest) {
    if (busy) return;
    setBusy(true);
    const response = await fetch(`/api/requests/${encodeURIComponent(need.id)}/pin`, { method: 'POST' });
    const result = await response.json() as { pinnedUntil?: string; error?: string };
    setBusy(false);
    if (!response.ok) return showToast(result.error ?? '固定できませんでした。');
    showToast(`${PIN_DAYS}日間、一覧のいちばん上に出ます。`);
    await refreshBoard();
    setSelected((current) => current && current.id === need.id ? { ...current, pinnedUntil: result.pinnedUntil ?? current.pinnedUntil } : current);
  }

  async function refreshBoard() {
    const response = await fetch('/api/board');
    if (!response.ok) return;
    const data = await response.json() as { requests: BoardRequest[]; stats: MemberStats; ads: AdSlot[] };
    setRequests(data.requests); setStats(data.stats); setAds(data.ads ?? []);
  }

  function chooseRequestPhoto(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!picked.length) return;
    if (picked.some((file) => file.size > 15 * 1024 * 1024)) return showToast('写真は1枚15MB以下を選んでください。');
    const room = photoLimit(stats.level) - requestPhotos.length;
    if (room <= 0) return showToast(`写真は${photoLimit(stats.level)}枚までです。`);
    const added = picked.slice(0, room);
    if (added.length < picked.length) showToast(`写真は${photoLimit(stats.level)}枚までなので、${added.length}枚だけ追加しました。`);
    setRequestPhotos((current) => [...current, ...added]);
    setRequestPhotoPreviews((current) => [...current, ...added.map((file) => URL.createObjectURL(file))]);
  }

  function removeRequestPhoto(index: number) {
    setRequestPhotos((current) => current.filter((_, at) => at !== index));
    setRequestPhotoPreviews((current) => {
      const target = current[index];
      if (target?.startsWith('blob:')) URL.revokeObjectURL(target);
      return current.filter((_, at) => at !== index);
    });
  }

  function clearRequestPhoto() {
    setRequestPhotos([]);
    setRequestPhotoPreviews((previous) => { previous.forEach((url) => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }); return []; });
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const body = new FormData(form);
    body.delete('photo');
    body.set('industryTags', JSON.stringify(requestIndustries));
    // 一覧用と詳細用を端末で作ってから送る。サーバーは変換しない。
    for (const photo of requestPhotos) {
      const [thumb, full] = await Promise.all([listThumbnail(photo), detailImage(photo)]);
      body.append('imageThumb', thumb);
      body.append('imageFull', full);
    }
    const response = await fetch('/api/board', { method: 'POST', body });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? '投稿できませんでした。');
    setModal(null); form.reset(); setRequestIndustries([]); clearRequestPhoto(); await refreshBoard(); showToast('探しごとを投稿しました。関連業種の会員へ通知します。');
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
    body.set('notifyIndustries', JSON.stringify(profileNotifyIndustries)); body.set('annualRevenueBand', profileRevenue); body.set('facebookUrl', profileFacebook);
    if (profilePhoto) body.set('avatar', profilePhoto);
    const response = await fetch('/api/profile', { method: 'PATCH', body });
    const result = await response.json() as { error?: string; avatarUrl?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? 'プロフィールを保存できませんでした。');
    const avatarUrl = result.avatarUrl ?? stats.avatarUrl;
    setStats((current) => ({ ...current, company: profileCompany, venue: profileVenue, positionTitle: profilePosition, badge: profileBadge, businessArea: profileArea, primaryIndustry: profileIndustry, notifyIndustries: profileNotifyIndustries, annualRevenueBand: profileRevenue, facebookUrl: profileFacebook, avatarUrl }));
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


  // いちばん近い空いている日。カレンダーの初期値に使う。
  const nextOpenDay = adInfo?.calendar.find((day) => day.remaining > 0);
  // 選んだ期間に満枠の日が1日でもあれば申し込めない。
  const periodOpen = useMemo(() => {
    if (!adInfo || !adStart) return false;
    const last = shiftDate(adStart, adDays - 1);
    const inRange = adInfo.calendar.filter((day) => day.date >= adStart && day.date <= last);
    return inRange.length === adDays && inRange.every((day) => day.remaining > 0);
  }, [adInfo, adStart, adDays]);
  // マイページの入口に出す、いま掲載中の1枠。
  const liveAd = adInfo?.slots.find((ad) => ad.imageUrl && adState(ad).tone === 'live');

  function openAdSettings() {
    setEditingAd('');
    setOpenStats('');
    setModal('ads');
  }

  // カレンダーを開いた時点で、空いている一番近い日を選んでおく。
  useEffect(() => {
    if (modal !== 'ads' || adStart || !nextOpenDay) return;
    const timer = window.setTimeout(() => {
      setAdStart(nextOpenDay.date);
      setAdDays((current) => Math.min(current, adInfo?.maxDays ?? 30));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [modal, adStart, nextOpenDay, adInfo?.maxDays]);

  async function buyAdSlot() {
    if (busy || !adStart) return;
    setBusy(true);
    try {
      const response = await fetch('/api/ads/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ startDate: adStart, days: adDays }),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (data.url) { window.location.assign(data.url); return; }
      showToast(data.error || 'お支払い画面を開けませんでした。');
    } catch {
      showToast('通信に失敗しました。時間をおいてお試しください。');
    }
    setBusy(false);
  }

  async function toggleStats(id: string) {
    if (openStats === id) { setOpenStats(''); return; }
    setOpenStats(id);
    setAdStats(null);
    const response = await fetch(`/api/ads/${encodeURIComponent(id)}/stats`);
    if (!response.ok) return showToast('成果を読み込めませんでした。');
    setAdStats(await response.json() as { slot: AdSlot; days: AdDay[] });
  }

  function startEditingAd(ad: AdSlot) {
    setEditingAd(ad.id);
    setAdTitle(ad.title);
    setAdFileName('');
    setAdUpload(null);
    // すでに画像がある枠は、うっかり作り直さないように「画像を用意する」から始める。
    setAdMode(ad.imageUrl ? 'upload' : 'make');
    setAdPreview('');
  }

  function chooseAdImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast('画像は15MB以下を選んでください。'); event.target.value = ''; return; }
    setAdFileName(file.name);
    setAdUpload(file);
    setAdPreview((previous) => { if (previous.startsWith('blob:')) URL.revokeObjectURL(previous); return URL.createObjectURL(file); });
  }

  async function saveAd(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (busy) return;
    // フォームはここで押さえる。awaitのあとでは event から取れなくなるため。
    const form = event.currentTarget;
    const current = adInfo?.slots.find((slot) => slot.id === id);
    // 文字だけで作る場合は、いま見えているプレビューと同じものを送る。
    const picked = adMode === 'make'
      ? await makeBannerFile({ title: adTitle, company: stats.company, name: userName, theme: adTheme })
      : adUpload;
    if (!picked && !current?.imageUrl) {
      return showToast(adMode === 'make' ? 'バナーを作れませんでした。画像を選ぶ方法もお試しください。' : '画像を選んでください。');
    }
    setBusy(true);
    const raw = new FormData(form);
    const body = new FormData();
    body.set('title', adTitle);
    body.set('linkUrl', String(raw.get('linkUrl') ?? ''));
    // 画像の縮小は投稿する人の端末でやる。Workersでは変換しない。
    if (picked && picked.size > 0) body.set('image', await detailImage(picked));
    const response = await fetch(`/api/ads/${encodeURIComponent(id)}`, { method: 'POST', body });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return showToast(result.error ?? '保存できませんでした。');
    setEditingAd('');
    setAdUpload(null);
    setAdPreview((previous) => { if (previous.startsWith('blob:')) URL.revokeObjectURL(previous); return ''; });
    showToast('掲載内容を保存しました。ホームのバナーに出ています。');
    await fetch('/api/ads').then((r) => r.ok ? r.json() : null).then((data) => { if (data) setAdInfo(data as AdOffer); }).catch(() => {});
    await refreshBoard();
  }

  async function startBilling(plan: Plan) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan, cycle: planCycle }),
      });
      const data = await response.json() as { url?: string; error?: string };
      if (data.url) { window.location.assign(data.url); return; }
      showToast(data.error || 'お支払い画面を開けませんでした。');
    } catch {
      showToast('通信に失敗しました。時間をおいてお試しください。');
    }
    setBusy(false);
  }

  async function openBillingPortal() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await response.json() as { url?: string; error?: string };
      if (data.url) { window.location.assign(data.url); return; }
      showToast(data.error || 'お支払いの管理画面を開けませんでした。');
    } catch {
      showToast('通信に失敗しました。時間をおいてお試しください。');
    }
    setBusy(false);
  }

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
    setModal(null);
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showSearch(industry = industryFilter) {
    setModal(null);
    setIndustryFilter(industry);
    setActiveTab('search');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showProfile() {
    setModal(null);
    setActiveTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 出稿された広告を先に置く。お金をいただいている枠なので、いちばん先に目に入る場所に出す。
  // 並びは開くたびに入れ替える。同じ月に出した人へ均等に順番が回るようにするため。
  const slides = useMemo(() => [
    ...shuffle(ads.filter((ad) => ad.imageUrl)).map((ad) => ({ src: ad.imageUrl, alt: `${ad.memberName}さんの広告「${ad.title}」`, ad })),
    ...topBanners.map((banner) => ({ ...banner, ad: null as AdSlot | null })),
  ], [ads]);
  const slide = slides[Math.min(carouselIndex, slides.length - 1)];

  // 広告は自分から送らないと見てもらえないので、一定の間隔で次へ送る。
  // 枚数は広告の数で変わるため、必ず slides.length で折り返すこと（固定の数にしない）。
  // ホームを見ているあいだだけ動かす。自分で送った人は、そこで止める。
  useEffect(() => {
    if (activeTab !== 'home' || slides.length < 2 || carouselPaused) return;
    const timer = window.setInterval(() => setCarouselIndex((index) => (index + 1) % slides.length), 5200);
    return () => window.clearInterval(timer);
  }, [activeTab, slides.length, carouselPaused]);

  // 見られた数は、同じ広告につき1日1回だけ数える。掲示板を開くたびに書くと
  // D1の書き込み回数が読めなくなるので、間引きはここ（端末側）で済ませる。
  useEffect(() => {
    const ad = slide?.ad;
    if (!ad || activeTab !== 'home') return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `${adSeenStorageKey}:${today}`;
    let seen: string[] = [];
    try { seen = JSON.parse(window.localStorage.getItem(key) ?? '[]') as string[]; } catch { seen = []; }
    if (seen.includes(ad.id)) return;
    try {
      window.localStorage.setItem(key, JSON.stringify([...seen, ad.id]));
      // 日付が変わったら前の日のぶんは消す。localStorageを増やし続けないため。
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const name = window.localStorage.key(index) ?? '';
        if (name.startsWith(`${adSeenStorageKey}:`) && name !== key) window.localStorage.removeItem(name);
      }
    } catch { /* 保存できない設定でも、数えられないだけで表示は続ける */ }
    trackAd({ views: [ad.id] });
  }, [slide, activeTab]);

  function openCurrentBanner() {
    const ad = slide?.ad;
    if (ad) {
      trackAd({ clicks: [ad.id] });
      if (ad.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
      else showToast(`${ad.memberName}さんの告知です。詳しくは会場やメッセージで直接おたずねください。`);
      return;
    }
    const fixedIndex = carouselIndex - (slides.length - topBanners.length);
    if (fixedIndex === 0) return openRequest();
    if (fixedIndex === 1) return setModal('responses');
    showProfile();
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/feedback', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: raw.category, body: raw.body }),
    });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? '送信できませんでした。');
    form.reset(); setFeedbackSent(true); showToast('ありがとうございます。いただいたご意見は必ず読みます。');
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

  function toggleIndustry(value: string, selected: string[], setSelected: (values: string[]) => void, max: number) {
    if (selected.includes(value)) return setSelected(selected.filter((item) => item !== value));
    if (selected.length >= max) return showToast(`業種タグは${max}個まで選択できます。`);
    setSelected([...selected, value]);
  }

  return (
    <main className="app-shell" id="home">
      <header className="mobile-header">
        <button className="mobile-brand" onClick={showHome}><BrandMark /><b>{serviceName}</b></button>
        <button className="header-profile" onClick={showProfile}><span><small>こんにちは</small><b>{userName}</b></span><Avatar src={stats.avatarUrl} name={userName} className="mini-avatar" /></button>
      </header>

      {activeTab === 'home' ? <div className="home-dashboard">
        <section className="hero-carousel" aria-label={`${serviceName}の使い方`}>
          <button key={carouselIndex} className={`hero-image-slide${slide?.ad ? ' is-ad' : ''}`} onClick={openCurrentBanner} aria-label={`${slide?.alt ?? ''}を開く`}><img src={slide?.src} alt={slide?.alt ?? ''} />{slide?.ad && <span className="hero-ad-tag">PR<em>{slide.ad.memberCompany || slide.ad.memberName}</em></span>}</button>
          <div className="carousel-dots" aria-label="バナーを切り替える">{slides.map((entry, index) => <button key={index} aria-label={`${index + 1}枚目${entry.ad ? '（広告）' : ''}`} className={`${carouselIndex === index ? 'active' : ''}${entry.ad ? ' is-ad' : ''}`} onClick={() => { setCarouselPaused(true); setCarouselIndex(index); }} />)}</div>
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
          <label><span>会場</span><select value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}><option value="all">すべての会場</option>{venueGroups.map(([prefecture, venues]) => <optgroup label={prefecture} key={prefecture}>{venues.map((venue) => <option value={venue} key={venue}>{venue}</option>)}</optgroup>)}</select></label>
          <label><span>エリア</span><select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">全国</option>{regions.map((region) => <option value={region.name} key={region.name}>{region.name}</option>)}</select></label>
          <label><span>業種</span><select value={getIndustryGroup(industryFilter)?.name ?? 'all'} onChange={(event) => setIndustryFilter(event.target.value)}><option value="all">すべての業種</option>{industryGroups.map((group) => <option value={group.name} key={group.name}>{group.name}</option>)}</select></label>
          <label><span>会社の年商</span><select value={revenueFilter} onChange={(event) => setRevenueFilter(event.target.value)}><option value="all">すべての年商</option>{Object.entries(revenueBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <div className="card-list">
          {shown.length === 0 ? <div className="empty"><b>条件に合う投稿がありません</b><span>絞り込みを変えて探してみましょう。</span></div> : shown.map((need) => (
            <article className={isOpenRequest(need) ? 'need-card' : 'need-card closed'} key={need.id} onClick={() => openNeed(need)}>
              <div className="card-topline"><span className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</span><span className="card-top-actions">{isOpenRequest(need) ? <span className="deadline">あと{daysLeft(need.deadline)}日</span> : <span className="deadline ended">募集終了</span>}<button className={favoriteIds.includes(need.id) ? 'card-heart active' : 'card-heart'} aria-label={favoriteIds.includes(need.id) ? 'お気に入りから外す' : 'お気に入りに保存'} onClick={(event) => { event.stopPropagation(); toggleFavorite(need); }}>♥</button></span></div>
              <h3>{need.title}</h3>{need.thumbUrl && <img className="need-thumb" src={need.thumbUrl} alt="" loading="lazy" decoding="async" />}<p className="need-body">{need.description}</p>
              <div className="industry-tags" aria-label="関連業種">{need.industryTags.map((industry) => <span key={industry}>{industry}</span>)}</div>
              <dl className="details"><div><dt>予算</dt><dd>{need.budgetLabel}</dd></div><div><dt>エリア</dt><dd>{need.area}</dd></div></dl>
              <div className="card-person"><Avatar src={need.authorAvatarUrl} name={need.authorName} className="member-avatar" /><p><b>{need.authorName}</b><small>{need.authorPositionTitle && `${need.authorPositionTitle}｜`}{need.authorCompany || '会社名未設定'}</small></p><span>紹介 {need.introCount}件</span></div>
              <div className="member-context">{need.commentCount > 0 && <span className="comment-count">やり取り {need.commentCount}件</span>}<span>会場 {need.authorVenue}</span>{need.authorBusinessArea && <span>エリア {need.authorBusinessArea}</span>}{need.authorBadge && <span>{need.authorBadge}</span>}{need.authorRevenueBand && <span>年商 {revenueBands[need.authorRevenueBand]}</span>}</div>
              <button className="intro-button" onClick={(event) => { event.stopPropagation(); openIntroduction(need); }}>この人を紹介できる <span>→</span></button>
            </article>
          ))}
        </div>
      </section> : <section className="profile-page" aria-labelledby="profile-page-title">
        <header className="profile-page-heading"><p>MY PAGE</p><h1 id="profile-page-title">マイページ</h1><span>会員情報・おすすめ・ランクを管理できます。</span></header>
        <button className={`rank-card rank-${stats.rank.toLowerCase()} rank-card-slim`} onClick={() => setModal('perks')} aria-label={`${stats.rank}会員ランクカード。特典を見る`}>
          <p className="rank-slim-top"><CrownMark /><b>{serviceName}</b></p>
          <RankCrest rank={stats.rank} />
          <h2 className="rank-slim-title">{stats.rank}</h2>
          <p className="rank-slim-sub">MEMBER</p>
          <div className="rank-slim-foot">
            <span><small>会員名</small><b>{userName}</b></span>
            <span><small>バッヂ</small><b>{stats.badge || '未設定'}</b></span>
            <span className="rank-slim-venue"><small>会場</small><b>{stats.venue || '未設定'}</b></span>
          </div>
          <span className="rank-slim-more">特典を見る ›</span>
        </button>
        <button className="rank-next" onClick={() => setModal('perks')}>
          <div className="rank-next-copy"><b>{stats.level >= rankThresholds.length ? '最高ランクに到達' : `あと${introductionsToNextRank}件でランクアップ`}</b><span>紹介 {stats.introCount}件・{stats.points}pt</span></div>
          <span className="rank-next-track"><i style={{ width: `${rankProgress}%` }} /></span>
        </button>
        <details className={`plan-card is-${stats.plan}`}>
          <summary>
            <span className="plan-now"><small>プラン</small><b>{planCatalog[stats.plan].name}</b></span>
            <span className="plan-usage">今月の投稿 {stats.requestsThisMonth}{stats.requestLimit === UNLIMITED ? '' : ` / ${stats.requestLimit}`}件</span>
            <i aria-hidden="true">▾</i>
          </summary>
          <div className="plan-body">
            {stats.bonusPlan !== 'free' && stats.bonusPeriodEnd
              ? <p className="plan-until">招待特典で{planCatalog[stats.bonusPlan].name}を{stats.bonusPeriodEnd}までご利用いただけます。そのあとは{planCatalog[stats.contractedPlan].name}に戻ります。</p>
              : stats.paid && stats.planPeriodEnd && <p className="plan-until">{stats.planPeriodEnd} までご利用いただけます</p>}
            {referral?.billing?.yearly && <div className="plan-cycle" role="group" aria-label="お支払いの周期">
              <button className={planCycle === 'month' ? 'active' : ''} onClick={() => setPlanCycle('month')}>月払い</button>
              <button className={planCycle === 'year' ? 'active' : ''} onClick={() => setPlanCycle('year')}>年払い <em>20%OFF</em></button>
            </div>}
            <ul className="plan-list">
              {plans.map((plan) => <li key={plan} className={`plan-${plan}${plan === stats.plan ? ' current' : ''}`}>
                <p className="plan-list-head"><b>{planCatalog[plan].name}</b>{plan === stats.contractedPlan && <em>契約中</em>}{plan !== stats.contractedPlan && plan === stats.bonusPlan && <em className="bonus">招待特典</em>}<span>{planPrice(plan, planCycle)}</span></p>
                {planCycle === 'year' && plan !== 'free' && <p className="plan-list-per-month">{planPerMonthNote(plan)}</p>}
                <p className="plan-list-what"><span>探しごと {planPostLimit(plan)}</span></p>
                {referral?.billing?.ready && plan !== 'free' && plan !== stats.contractedPlan
                  && <button className="plan-pick" onClick={() => startBilling(plan)} disabled={busy}>このプランにする</button>}
              </li>)}
            </ul>
            <ul className="plan-detail">
              <li className="only"><b>会員を探す、紹介を書き出す</b><span>スタンダードのみ</span></li>
              <li className="all"><b>掲示板を見る、紹介する、やり取りする</b><span>どのプランでも無制限</span></li>
            </ul>
            {referral?.billing?.hasCustomer && <button className="plan-manage" onClick={openBillingPortal} disabled={busy}>お支払い・解約の手続き</button>}
            <p className="plan-note">仲間を1人招待してご利用が{referral?.qualifyDays ?? 30}日続くと、{stats.contractedPlan === 'free' ? <><b>自動でスタンダードが1ヶ月使えるようになります</b>（お手続きは要りません）</> : <><b>次回の請求から1ヶ月ぶん自動で引かれます</b></>}。{referral?.billing?.ready ? '有料プランへのお申し込みは、上のボタンからいつでもどうぞ。解約もいつでもできます。' : ''}</p>
          </div>
        </details>

        {referral && <section className="invite-card" aria-label="仲間を招待する">
          <div className="invite-heading"><p>INVITE</p><h2>仲間を招待する</h2><span>あなたの招待リンクから入会して{referral.qualifyDays}日続いた方1人につき、{stats.paid ? '会費が1ヶ月無料になります' : 'スタンダードが1ヶ月使えます'}（合計{referral.capTotal}ヶ月まで）。</span></div>
          <button className="invite-link" onClick={copyInviteLink}><span>{referral.url.replace(/^https?:\/\//, '')}</span><i>{inviteCopied ? 'コピーしました' : 'リンクをコピー'}</i></button>
          <dl className="invite-stats">
            <div><dt>招待した人</dt><dd>{referral.invitedCount}<small>人</small></dd></div>
            <div><dt>利用中</dt><dd>{referral.activeCount}<small>人</small></dd></div>
            <div><dt>{stats.paid ? '無料になった月' : '有料になった月'}</dt><dd>{referral.earnedMonths}<small>ヶ月</small></dd></div>
          </dl>
          <ul className="invite-note">
            {referral.waitingCount > 0 && <li><b>{referral.waitingCount}人</b><span>いまご利用を停止しています</span></li>}
            {!!referral.billing?.creditPerReferralYen && <li><b>1人につき {referral.billing.creditPerReferralYen.toLocaleString('ja-JP')}円</b><span>{referral.billing.cycle === 'year' ? '次回の年額のお支払いから引かれます' : '次回の請求から引かれます'}</span></li>}
            {referral.remaining > 0 && referral.qualifyingCount > 0 && <li><b>{referral.qualifyingCount}人</b><span>ご利用が{referral.qualifyDays}日続くと、1ヶ月分の利用料が無料になります</span></li>}
            {referral.waitingCredits > 0 && <li><b>受け取り済み</b><span>合計{referral.capTotal}ヶ月ぶんの上限に達しました。ご紹介はいつでも歓迎ですが、これ以上の無料月は付きません</span></li>}
          </ul>
          <p className="invite-terms">この特典は、予告なく内容の変更または終了をすることがあります。すでに確定したぶんは、そのままご利用いただけます。</p>
        </section>}

        {adInfo && <section className="ad-entry" aria-label="トップバナーへの出稿">
          <div className="ad-heading"><p>TOP BANNER</p><h2>トップバナーに出す</h2><span>ホームのいちばん上、いちばん先に目に入る場所に、1ヶ月あいだ自分の告知を出せます。{rankNames[adInfo.minRankLevel - 1]}以上の方の特典です。</span></div>

          {!adInfo.eligible
            ? <div className="ad-locked">
                <b>いまは{adInfo.rank}です</b>
                <span>紹介をあと{Math.max(0, rankThresholds[adInfo.minRankLevel - 1] - stats.introCount)}件で{rankNames[adInfo.minRankLevel - 1]}になり、この枠をお申し込みいただけるようになります。</span>
                <span className="ad-locked-why">枠を上位ランクの方に限っているのは、紹介を重ねてきた方から順に、より多くの目に留まる場所をお使いいただくためです。</span>
              </div>
            : <>
                {liveAd && <div className="ad-entry-live">
                  <div className="ad-slot-shot"><img src={liveAd.imageUrl} alt={`${liveAd.title}のバナー`} /><span className="hero-ad-tag">PR<em>{stats.company || userName}</em></span></div>
                  <p className="ad-entry-state"><b>掲載中・{formatRange(liveAd.startDate, liveAd.endDate)}</b><span>{liveAd.viewCount.toLocaleString('ja-JP')}人が見て、{liveAd.clickCount.toLocaleString('ja-JP')}回押されました</span></p>
                </div>}
                <button className="ad-entry-open" onClick={openAdSettings}>
                  <span><b>{adInfo.slots.length ? '掲載の設定を開く' : '出稿枠を申し込む'}</b><small>{adInfo.slots.length ? `お持ちの枠 ${adInfo.slots.length}件・見出しや画像、成果はここから見られます` : `${adSlotPrice()}／1枠・${nextOpenDay ? `${formatRange(nextOpenDay.date, nextOpenDay.date).split('〜')[0]}から空いています` : 'ただいま満枠です'}`}</small></span>
                  <i aria-hidden="true">›</i>
                </button>
              </>}
        </section>}

        <section className="feedback-card" aria-label="機能改善のご意見">
          <div className="feedback-heading"><p>YOUR VOICE</p><h2>こうしてほしい、を聞かせてください</h2><span>{serviceName}は作っている途中です。使ってみて足りないところ、使いにくいところを教えてください。いただいたご意見は運営が必ず読みます。</span></div>
          {feedbackSent ? <div className="feedback-done"><b>お送りいただきました</b><span>ありがとうございます。続けてお気づきの点があれば、また送ってください。</span><button onClick={() => setFeedbackSent(false)}>もう1件送る</button></div> : <form className="feedback-form" onSubmit={submitFeedback}>
            <label><span>種類</span><select name="category" defaultValue="feature">{feedbackCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
            <label><span>内容</span><textarea name="body" required maxLength={1000} rows={4} placeholder="例：会場ごとの探しごとをまとめて見たい／会場での集まりの告知も出したい" /></label>
            <button className="submit-button" disabled={busy}>{busy ? '送信しています…' : '送る'}</button>
          </form>}
        </section>


        <div className="profile-form profile-page-form">
          <div className="profile-form-heading"><b>プロフィール情報</b><span>入力内容は探しごとや紹介時に表示されます。</span></div>
          <label className="photo-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /><span className="photo-upload-preview">{photoPreview ? <img src={photoPreview} alt="登録する顔写真のプレビュー" /> : <b>＋</b>}</span><span><b>顔写真 <em>必須</em></b><small>本人だと分かる正面の写真を選択<br />JPEG・PNG・WebP／5MBまで</small></span><i>{stats.avatarUrl ? '変更する' : '写真を選ぶ'}</i></label>
          <label>会社名 <small className="req">必須</small><input value={profileCompany} onChange={(event) => setProfileCompany(event.target.value)} maxLength={80} placeholder="株式会社〇〇" required /></label>
          <div className="profile-venue-select">
            <p>所属会場 <small className="req">必須</small></p>
            <label>都道府県<select value={venuePrefecture} onChange={(event) => { setVenuePrefecture(event.target.value); setVenueChoice(''); }}><option value="">選択してください</option>{venuePrefectures.map((prefecture) => <option value={prefecture} key={prefecture}>{prefecture}</option>)}</select></label>
            <label>会場<select value={venueChoice} onChange={(event) => setVenueChoice(event.target.value)} disabled={!venuePrefecture && venueChoice !== OTHER_VENUE}><option value="">会場を選択</option>{(venuesByPrefecture[venuePrefecture] ?? []).map((venue) => <option value={venue} key={venue}>{venue}</option>)}<option value={OTHER_VENUE}>その他（自由入力）</option></select></label>
            {venueChoice === OTHER_VENUE && <label className="wide">会場名 <small>正式な会場名を入力</small><input value={venueOther} onChange={(event) => setVenueOther(event.target.value)} maxLength={60} placeholder="例：ひるのめぐろ会場" /></label>}
          </div>
          <div className="profile-row"><label>肩書き <small>任意</small><input value={profilePosition} onChange={(event) => setProfilePosition(event.target.value)} maxLength={60} placeholder="世話人" /></label><label>バッヂ <small>任意</small><select value={profileBadge} onChange={(event) => setProfileBadge(event.target.value)}><option value="">選択しない</option><option value="緑">緑</option><option value="赤">赤</option><option value="ゴールド">ゴールド</option><option value="ダイヤモンド">ダイヤモンド</option></select></label></div>
          <label>活動エリア <small>任意・検索に使われます</small><select value={profileArea} onChange={(event) => setProfileArea(event.target.value)}><option value="">選択しない</option>{prefectures.map((prefecture) => <option value={prefecture} key={prefecture}>{prefecture}</option>)}</select></label>
          <div className="profile-industry-select"><p>自分の業種 <small>おすすめの設定に使われます</small></p><label>大分類<select value={profileIndustryGroup} onChange={(event) => { setProfileIndustryGroup(event.target.value); setProfileIndustry(''); }}><option value="">選択してください</option>{industryGroups.map((group) => <option value={group.name} key={group.name}>{group.name}</option>)}</select></label><label>詳細業種<select value={profileIndustry} onChange={(event) => { const value = event.target.value; setProfileIndustry(value); if (value && !profileNotifyIndustries.includes(value)) setProfileNotifyIndustries((current) => [...current, value].slice(0, notifyIndustryLimit(stats.level))); }} disabled={!profileIndustryGroup}><option value="">詳細業種を選択</option>{profileIndustry === profileIndustryGroup && <option value={profileIndustryGroup}>大分類のみ（旧設定）</option>}{industryGroups.find((group) => group.name === profileIndustryGroup)?.children.map((industry) => <option value={industry} key={industry}>{industry}</option>)}</select></label></div>
          <IndustryPicker legend="おすすめに出したい業種" note={`${notifyIndustryLimit(stats.level)}個まで`} description="選んだ詳細業種の探しごとが、ホームの「あなたにおすすめ」に出ます。" selected={profileNotifyIndustries} activeGroup={profileNotifyGroup} onGroupChange={setProfileNotifyGroup} onToggle={(industry) => toggleIndustry(industry, profileNotifyIndustries, setProfileNotifyIndustries, notifyIndustryLimit(stats.level))} className="profile-tag-field" />
          <label>会社の年商 <small>任意</small><select value={profileRevenue} onChange={(event) => setProfileRevenue(event.target.value)}><option value="">選択しない</option>{Object.entries(revenueBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Facebook <small>任意・紹介のあとに直接やり取りできます</small><input value={profileFacebook} onChange={(event) => setProfileFacebook(event.target.value)} maxLength={200} placeholder="https://www.facebook.com/your.name" inputMode="url" /></label>
          <button className="profile-save-button" onClick={saveProfile} disabled={busy || !profileCompany.trim() || !profileVenue.trim() || (!stats.avatarUrl && !profilePhoto)}>{busy ? '保存中…' : 'プロフィールを保存する'}</button>
        </div>
      </section>}

      <nav className="bottom-nav" aria-label="アプリメニュー">
        <button className={activeTab === 'home' ? 'active' : ''} onClick={showHome}><span>⌂</span><small>ホーム</small></button>
        <button className={activeTab === 'search' ? 'active' : ''} onClick={() => showSearch()}><span>⌕</span><small>困りごと</small></button>
        <button className="nav-post" onClick={openRequest} aria-label="探しごとを投稿する"><span>＋</span></button>
        <button className={modal === 'ads' ? 'active' : ''} onClick={openAdSettings}><span><BannerIcon /></span><small>広告</small></button>
        <button className={modal !== 'ads' && activeTab === 'profile' ? 'active' : ''} onClick={showProfile}><span><PersonIcon /></span><small>マイページ</small></button>
      </nav>

      {modal === 'request' && !canPostRequest && <Modal title="今月ぶんの投稿は完了しています" lead={`${planCatalog[stats.plan].name}プランで投稿できる探しごとは月${stats.requestLimit}件までです。`} onClose={() => setModal(null)}><div className="quota-block"><p>来月になるとまた投稿できます。今すぐ続けて投稿したい場合は、マイページのプラン欄からスタンダードへお切り替えください。何件でも投稿できるようになります。</p><p>仲間を1人招待して{referral?.qualifyDays ?? 30}日続けてご利用いただくと、スタンダードを1ヶ月お試しいただけます。マイページの「仲間を招待する」から招待リンクをお送りください。</p><button className="submit-button" onClick={() => { setModal(null); showProfile(); }}>マイページを開く</button></div></Modal>}

      {modal === 'request' && canPostRequest && <Modal title="探しごとを投稿" lead="紹介してほしい人を具体的に書きましょう。" onClose={() => setModal(null)}><form className="form" onSubmit={submitRequest}><label>探しているもの<select name="category" required defaultValue=""><option value="" disabled>選択してください</option><option value="project">案件の発注先</option><option value="collaboration">協業パートナー</option><option value="consultation">相談相手・情報</option></select></label><label>タイトル<input name="title" required maxLength={90} placeholder="例：採用に強い動画制作会社" /></label><label>詳しい内容 {descriptionLimit(stats.level) > 600 && <small className="req">上限なし</small>}<textarea name="description" required maxLength={descriptionLimit(stats.level)} rows={4} placeholder="どんな課題があり、どんな人を紹介してほしいか" /></label><IndustryPicker legend="関連する業種" note="必須・3個まで" selected={requestIndustries} activeGroup={requestIndustryGroup} onGroupChange={setRequestIndustryGroup} onToggle={(industry) => toggleIndustry(industry, requestIndustries, setRequestIndustries, 3)} /><label>予算感<input name="budgetLabel" required maxLength={60} placeholder="例：20〜40万円／応相談" /></label><label>希望エリア<input name="area" required maxLength={60} placeholder="例：東京都・オンライン" /></label><label>募集期限<input name="deadline" type="date" required min="2026-08-27" /></label><div className="request-photos"><p><b>写真を付ける <em>任意</em></b><small>{photoLimit(stats.level) > 1 ? `${stats.rank}は${photoLimit(stats.level)}枚まで付けられます` : '現場や商品の写真があると、一覧で見つけてもらいやすくなります'}</small></p><div className="request-photo-grid">{requestPhotoPreviews.map((preview, index) => <span key={preview} className="request-photo-item"><img src={preview} alt={`添付する写真 ${index + 1}枚目`} /><button type="button" onClick={() => removeRequestPhoto(index)} aria-label={`${index + 1}枚目を削除`}>×</button></span>)}{requestPhotos.length < photoLimit(stats.level) && <label className="request-photo-add"><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" multiple={photoLimit(stats.level) > 1} onChange={chooseRequestPhoto} /><b>＋</b><small>{requestPhotos.length ? 'もう1枚' : '写真を選ぶ'}</small></label>}</div></div><button className="submit-button" disabled={busy || !requestIndustries.length}>{busy ? '投稿しています…' : '投稿する'}</button></form></Modal>}

      {modal === 'intro' && selected && <Modal title="知っている人を紹介" lead={`「${selected.title}」への紹介です。`} onClose={() => setModal(null)}><form className="form" onSubmit={submitIntroduction}><label>お名前<input name="personName" required maxLength={60} /></label><label>会社・屋号<input name="personCompany" required maxLength={80} /></label><label>あなたとの関係<input name="relationship" required maxLength={120} placeholder="例：取引先、友人" /></label><label>紹介したい理由<textarea name="fitReason" required maxLength={400} rows={3} /></label><label className="consent"><input type="checkbox" name="consentConfirmed" required /> ご本人に紹介の了承を得ています</label><button className="submit-button" disabled={busy}>{busy ? '届けています…' : '紹介を届ける'}</button></form></Modal>}

      {modal === 'perks' && <Modal title="ランクの特典" lead="紹介した数でランクが上がり、できることが増えます。一度上がったランクは下がりません。" onClose={() => { setModal(null); setOpenPerk(''); }}>
        <div className="perk-panel">
          <ol className="perk-ladder" aria-label="ランクの段階">{rankNames.map((name, index) => {
            const level = index + 1;
            return <li key={name} className={`${level === stats.level ? 'now' : ''}${level < stats.level ? ' done' : ''}`}>
              <span className={`perk-ladder-dot rank-${name.toLowerCase()}`} aria-hidden="true" />
              <b>{name}</b>
              <small>{rankThresholds[index] === 0 ? 'はじめから' : `紹介${rankThresholds[index]}件`}</small>
            </li>;
          })}</ol>

          <p className="perk-now">
            <b>いまは {stats.rank}</b>
            <span>{stats.level >= rankNames.length ? '最高ランクです。ありがとうございます。' : `あと${introductionsToNextRank}件の紹介で ${rankNames[stats.level]} になります。`}</span>
          </p>

          <ul className="perk-grid">{rankPerks.map((perk) => {
            const unlocked = stats.level >= perk.minLevel;
            return <li key={perk.key}>
              <button className={`perk-tile${unlocked ? '' : ' locked'}${openPerk === perk.key ? ' open' : ''}`} onClick={() => setOpenPerk(openPerk === perk.key ? '' : perk.key)}>
                <span className="perk-badge"><PerkIcon perk={perk.key} /></span>
                <i className={perk.soon ? 'soon' : ''}>{perk.soon ? '近日公開' : unlocked ? '' : rankNames[perk.minLevel - 1]}</i>
                <small>{perk.label}</small>
              </button>
            </li>;
          })}</ul>

          {openPerk && (() => {
            const perk = rankPerks.find((entry) => entry.key === openPerk);
            if (!perk) return null;
            const unlocked = stats.level >= perk.minLevel;
            return <div className={`perk-detail${unlocked ? '' : ' locked'}`}>
              <p className="perk-detail-head"><b>{perk.label}</b><span>{perk.soon ? '近日公開' : unlocked ? '使えます' : `${rankNames[perk.minLevel - 1]}で解放`}</span></p>
              <p className="perk-detail-body">{perk.detail}</p>
              {perk.soon && <p className="perk-detail-note">この特典はまだ作っている途中です。できあがったら、いまのランクのままお使いいただけます。</p>}
              {!unlocked && !perk.soon && <p className="perk-detail-note">あと{Math.max(0, rankThresholds[perk.minLevel - 1] - stats.introCount)}件の紹介で使えるようになります。</p>}
            </div>;
          })()}

          <p className="perk-terms">特典の内容は、予告なく変更または終了することがあります。ランクは紹介した数の累計で決まり、下がることはありません。</p>
        </div>
      </Modal>}

      {modal === 'ads' && adInfo && <Modal title="トップバナーに出す" lead="ホームのいちばん先に目に入る場所に、選んだ期間だけ告知を出せます。お支払いは1回きりで、自動更新はありません。掲載内容は掲載中でも何度でも変えられます。" onClose={() => { setModal(null); setEditingAd(''); setOpenStats(''); }}>
        <div className="ad-panel">
          {adInfo.slots.length > 0 && <ul className="ad-slot-list">{adInfo.slots.map((ad) => {
            const state = adState(ad);
            return <li key={ad.id} className={`ad-slot is-${state.tone}`}>
              <div className="ad-slot-head"><b>{formatRange(ad.startDate, ad.endDate)}</b><span className={`ad-state is-${state.tone}`}>{state.label}</span></div>
              {/* 入れ替えている最中は、下のプレビューだけを見せる。同じ絵が2つ並ぶと迷うため。 */}
              {editingAd !== ad.id && (ad.imageUrl
                ? <div className="ad-slot-shot"><img src={ad.imageUrl} alt={`${ad.title}のバナー`} /><span className="hero-ad-tag">PR<em>{stats.company || userName}</em></span></div>
                : <div className="ad-slot-blank"><b>{state.editable ? 'まだ何も出ていません' : '掲載されないまま終わりました'}</b><span>{state.editable ? '見出しと画像を入れると、ホームのバナーに並びます。' : '次にお申し込みいただくときは、お早めに内容をお入れください。'}</span></div>)}

              {editingAd === ad.id
                ? <form className="ad-form" onSubmit={(event) => saveAd(event, ad.id)}>
                    <label><span>見出し <small>{adInfo.titleMax}文字まで</small></span><input name="title" value={adTitle} onChange={(event) => setAdTitle(event.target.value)} maxLength={adInfo.titleMax} required placeholder="例：内装工事の職人さんを探しています" /></label>
                    <label><span>リンク先 <small>任意・押したときに開くページ</small></span><input name="linkUrl" defaultValue={ad.linkUrl} maxLength={200} inputMode="url" placeholder="https://example.com" /></label>

                    <div className="ad-mode" role="group" aria-label="バナーの作り方">
                      <button type="button" className={adMode === 'make' ? 'active' : ''} onClick={() => setAdMode('make')}>文字だけで作る</button>
                      <button type="button" className={adMode === 'upload' ? 'active' : ''} onClick={() => setAdMode('upload')}>画像を用意する</button>
                    </div>

                    {adMode === 'make' ? <>
                      <div className="ad-themes" role="group" aria-label="バナーの色">{adBannerThemes.map((theme) => <button type="button" key={theme.value} className={adTheme === theme.value ? 'active' : ''} onClick={() => setAdTheme(theme.value)} style={{ background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`, color: theme.ink }}>{theme.label}</button>)}</div>
                      <p className="ad-note">会社名とお名前は下に入ります。写真を用意しなくても、このまま出せます。</p>
                    </> : <label className="ad-file"><span>画像 <small>横長（3:2）・JPEG/PNG/WebP</small></span><input name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAdImage} /><i>{adFileName || (ad.imageUrl ? 'いまの画像のまま' : '画像を選ぶ')}</i></label>}

                    {(adPreview || ad.imageUrl) ? <div className="ad-preview">
                      <p>ホームでの見え方</p>
                      <div className="ad-slot-shot"><img src={adPreview || ad.imageUrl} alt="掲載されるバナーのプレビュー" /><span className="hero-ad-tag">PR<em>{stats.company || userName}</em></span></div>
                    </div> : <div className="ad-slot-blank"><b>まだ見た目が決まっていません</b><span>{adMode === 'make' ? '見出しを入れると、ここに出来上がりが出ます。' : '画像を選ぶと、ここに出来上がりが出ます。'}</span></div>}

                    <div className="ad-form-actions"><button type="button" onClick={() => setEditingAd('')} disabled={busy}>やめる</button><button className="submit-button" disabled={busy}>{busy ? '保存しています…' : '保存して掲載する'}</button></div>
                  </form>
                : <>
                    <div className="ad-slot-foot"><b>{ad.title || '見出しが未入力です'}</b>{state.editable && <button onClick={() => startEditingAd(ad)}>{ad.imageUrl ? '内容を変える' : '内容を入れる'}</button>}</div>
                    {(ad.imageUrl || ad.viewCount > 0) && <button className="ad-stats-open" onClick={() => toggleStats(ad.id)}>{openStats === ad.id ? '成果を閉じる' : '成果を見る'}<i aria-hidden="true">{openStats === ad.id ? '▴' : '▾'}</i></button>}
                    {openStats === ad.id && (adStats ? <AdAnalytics slot={adStats.slot} days={adStats.days} /> : <p className="ad-analytics-empty">読み込んでいます…</p>)}
                  </>}
            </li>;
          })}</ul>}

          {!adInfo.ready
            ? <p className="ad-note">出稿枠のお申し込みは準備中です。ご希望の方は運営窓口へお問い合わせください。</p>
            : <div className="ad-buy">
                <p className="ad-buy-label">{adInfo.slots.length ? 'もう1枠、お申し込みになりますか' : '掲載する期間をお選びください'}</p>
                <AdCalendar offer={adInfo} startDate={adStart} days={adDays} onPick={setAdStart} />
                <label className="ad-days"><span>掲載する日数 <small>最大{adInfo.maxDays}日</small></span>
                  <input type="range" min={1} max={adInfo.maxDays} value={adDays} onChange={(event) => setAdDays(Number(event.target.value))} />
                  <b>{adDays}日</b>
                </label>
                <p className="ad-buy-period">{adStart
                  ? <>{formatRange(adStart, shiftDate(adStart, adDays - 1))} に掲載します<em>{adSlotPrice()}（税込・1回きり）</em></>
                  : <>カレンダーから、掲載を始める日を選んでください</>}</p>
                <button className="submit-button" onClick={buyAdSlot} disabled={busy || !adStart || !periodOpen}>{!adStart ? '始める日を選んでください' : periodOpen ? 'この期間で申し込む' : '選んだ期間に満枠の日があります'}</button>
                <p className="ad-note">同じ日に出せるのは{adInfo.concurrent}本までで、早い者勝ちです。掲載内容は、お申し込みのあとにこの画面から入れられます。</p>
              </div>}
        </div>
      </Modal>}

      {modal === 'responses' && <Modal title="届いた紹介" lead="あなたが投稿した探しごとへの紹介です。" onClose={() => setModal(null)}><ReceivedIntroductions /></Modal>}

      {modal === 'detail' && selected && <Modal title="探しごとの詳細" lead={`${selected.authorName}さんの探しごとです。`} onClose={() => setModal(null)}><article className="need-detail">
        <div className="card-topline"><span className={`kind ${categories[selected.category].className}`}>{categories[selected.category].label}</span><button className={favoriteIds.includes(selected.id) ? 'detail-heart active' : 'detail-heart'} onClick={() => toggleFavorite(selected)}>♥ {favoriteIds.includes(selected.id) ? '保存済み' : 'お気に入り'}</button></div>
        <h3>{selected.title}</h3>
        {selected.imageUrls.length > 1
          ? <div className="need-gallery">{selected.imageUrls.map((url, index) => <img key={url} src={url} alt={`${selected.title}に添えられた写真 ${index + 1}枚目`} loading="lazy" decoding="async" />)}</div>
          : selected.imageUrl && <img className="need-photo" src={selected.imageUrl} alt={`${selected.title}に添えられた写真`} loading="lazy" decoding="async" />}
        <p>{selected.description}</p>
        <div className="industry-tags">{selected.industryTags.map((industry) => <span key={industry}>{industry}</span>)}</div>
        <dl><div><dt>予算</dt><dd>{selected.budgetLabel}</dd></div><div><dt>希望エリア</dt><dd>{selected.area}</dd></div><div><dt>募集期限</dt><dd>{selected.deadline}</dd></div></dl>
        <div className="detail-author"><Avatar src={selected.authorAvatarUrl} name={selected.authorName} className="member-avatar" /><p><b>{selected.authorName}</b><span>{selected.authorPositionTitle && `${selected.authorPositionTitle}｜`}{selected.authorCompany || '会社名未設定'}</span><small>{selected.authorVenue}{selected.authorBusinessArea && `・${selected.authorBusinessArea}`}</small></p><FacebookLink url={selected.authorFacebookUrl} name={selected.authorName} /></div>
        {selected.mine
          ? <div className="owner-tools">
              <p className="owner-tools-head"><b>あなたの探しごと</b><span>{stats.rank}の特典が使えます</span></p>
              <div className="owner-tools-row">
                <button disabled={busy || !canExtend(selected)} onClick={() => extendOwnRequest(selected)}>{selected.extendedAt ? '延長ずみ' : `期限を${EXTEND_DAYS}日のばす`}</button>
                <button disabled={busy || !canPin(selected)} onClick={() => pinOwnRequest(selected)}>{isPinned(selected) ? `${PIN_DAYS}日間 いちばん上` : '注目ピンで上に出す'}</button>
              </div>
              {canPromoteInIndustry(stats.level) && <div className="owner-promo">
                <p>{isPromoted(selected) ? `「${selected.promoIndustry}」の一覧で先頭に出しています` : '業種を選ぶと、その一覧で先頭に出せます'}</p>
                <div className="owner-promo-row">{selected.industryTags.map((industry) => <button key={industry} disabled={busy || promoUsedThisMonth || isPromoted(selected)}
                  className={selected.promoIndustry === industry ? 'active' : ''}
                  onClick={() => promoteOwnRequest(selected, industry)}>{industry}</button>)}</div>
              </div>}
              <p className="owner-tools-note">{ownerToolsNote(selected)}</p>
            </div>
          : <button className="submit-button" onClick={() => openIntroduction(selected)}>この人を紹介できる</button>}
        <RequestComments requestId={selected.id} onCountChange={(count) => setRequests((current) => current.map((item) => item.id === selected.id ? { ...item, commentCount: count } : item))} />
      </article></Modal>}

      {cropSource && <div className="crop-backdrop"><section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title"><header><button onClick={() => setCropSource('')}>キャンセル</button><div><h2 id="crop-title">顔写真を調整</h2><p>指で動かして、顔が中央に来るようにします</p></div><button className="crop-confirm" onClick={confirmCrop} disabled={cropping || !croppedArea}>{cropping ? '処理中' : '決定'}</button></header><div className="crop-stage"><Cropper image={cropSource} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} minZoom={1} maxZoom={4} zoomSpeed={0.35} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setCroppedArea(pixels)} disableAutomaticStylesInjection /></div><div className="crop-controls"><label><span>顔の大きさ</span><input type="range" min="1" max="4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="顔写真の拡大率" /><b>{Math.round(zoom * 100)}%</b></label><p>写真を指で動かせます。丸の中がプロフィール写真に表示されます。</p></div></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

/**
 * 掲載を始める日を選ぶカレンダー。満枠の日は押せない。
 * 選んだ日から日数ぶんの帯を塗って、どこからどこまで出るのかを見せる。
 */
function AdCalendar({ offer, startDate, days, onPick }: {
  offer: AdOffer; startDate: string; days: number; onPick: (date: string) => void;
}) {
  const endDate = startDate ? shiftDate(startDate, days - 1) : '';
  // 月ごとに分けて、1日が何曜日から始まるかを合わせる。
  const months = useMemo(() => {
    const grouped = new Map<string, { date: string; remaining: number }[]>();
    for (const day of offer.calendar) {
      const key = day.date.slice(0, 7);
      grouped.set(key, [...(grouped.get(key) ?? []), day]);
    }
    return [...grouped.entries()];
  }, [offer.calendar]);

  return <div className="ad-calendar">
    {months.map(([month, entries]) => <section key={month}>
      <h4>{Number(month.slice(5))}月</h4>
      <div className="ad-calendar-week" aria-hidden="true">{weekdayNames.map((name) => <span key={name}>{name}</span>)}</div>
      <div className="ad-calendar-grid">
        {Array.from({ length: weekdayOf(entries[0].date) }, (_, index) => <span key={`pad-${index}`} />)}
        {entries.map((day) => {
          const inPeriod = Boolean(startDate) && day.date >= startDate && day.date <= endDate;
          const full = day.remaining <= 0;
          return <button key={day.date} type="button" disabled={full}
            className={`${day.date === startDate ? 'start ' : ''}${inPeriod ? 'in ' : ''}${full ? 'full' : ''}`.trim()}
            aria-label={`${Number(day.date.slice(5, 7))}月${Number(day.date.slice(8))}日${full ? '・満枠' : `・のこり${day.remaining}枠`}`}
            onClick={() => onPick(day.date)}>
            <b>{Number(day.date.slice(8))}</b>
            <i>{full ? '×' : day.remaining <= 3 ? `${day.remaining}` : ''}</i>
          </button>;
        })}
      </div>
    </section>)}
    <p className="ad-calendar-legend"><span className="is-open" />空きあり<span className="is-few" />のこりわずか<span className="is-full" />満枠</p>
  </div>;
}

function BannerIcon() {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="2.6" y="4.4" width="18.8" height="11.4" rx="2.2" />
    <path d="M6.4 8.6h7.4M6.4 11.8h4.6" />
    <path d="M12 15.8v3.8M8.6 19.6h6.8" />
  </svg>;
}

function PersonIcon() {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <defs><clipPath id="nav-person-clip"><circle cx="12" cy="12" r="9.4" /></clipPath></defs>
    <circle cx="12" cy="12" r="9.4" />
    <circle cx="12" cy="9.3" r="3.2" />
    <rect x="6.6" y="14.7" width="10.8" height="9" rx="3.2" clipPath="url(#nav-person-clip)" />
  </svg>;
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
    <span className={need.thumbUrl ? 'home-request-cover has-photo' : 'home-request-cover'}>{need.thumbUrl
      ? <img src={need.thumbUrl} alt="" loading="lazy" decoding="async" />
      : <><IndustryIcon group={primaryGroup} /><small>{primaryIndustry}</small></>}</span>
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
