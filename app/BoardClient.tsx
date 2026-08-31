'use client';

import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { AdSlot, BoardRequest, MemberStats, ReferralSummary } from '@/db/data';
import ReceivedIntroductions from './ReceivedIntroductions';
import RequestComments from './RequestComments';
import FacebookLink from './FacebookLink';
import { areaMatchesRegion, getRegion, prefectures, regions, requestAreaOptions, type Prefecture } from './profile-options';
import { getIndustryGroup, industryGroups, matchesIndustry } from './industry-options';
import { budgetBandLabel, budgetBands } from './budget-options';
import { findVenuePrefecture, isListedVenue, OTHER_VENUE, venuePrefectures, venuesByPrefecture } from './venue-options';
import { UNLIMITED, can, plans, type BillingCycle, type Feature, type Plan } from './entitlements';
import { feedbackCategories } from './feedback-options';
import { adDailyPrice, adTotalPrice, planCatalog, planPerMonthNote, planPostLimit, planPrice } from './plan-catalog';
import RankCrest, { CrownMark } from './RankCrest';
import LegalLinks from './LegalLinks';
import { InviteIcon, OfferIcon, PlanIcon, PostsIcon, ProfileIcon, ReceiptIcon, VoiceIcon } from './MyPageIcons';
import type { BillingRecord } from './stripe';
import PerkIcon from './PerkIcon';
import { AD_MIN_DAYS, AD_ROTATE_MS, DEFAULT_PLACEMENT, adPlacements, placementName, placementSlots } from './ad-options';
import { EXTEND_DAYS, PHOTO_LIMIT_TOP, canExtendRequest, canFilterByBudget, canPostVideo, descriptionLimit, notifyIndustryLimit, photoLimit, rankNames, rankPerks, rankThresholds } from './rank-perks';
import { serviceName } from './brand';
import BrandMark from './BrandMark';
import { VIDEO_MAX_SECONDS, compressVideo } from './compress-video';
import { detailImage, listThumbnail } from './resize-image';
import AdAnalytics, { formatRange } from './AdAnalytics';
import type { AdDay } from '@/db/data';

import AdBanner from './AdBanner';

const categories = {
  project: { label: '案件', className: 'project' },
  collaboration: { label: '協業先', className: 'collab' },
  consultation: { label: '相談・情報', className: 'consultation' },
};

/**
 * 3つの区別。会員がいちばん迷うところなので、選ぶ言葉・違い・例をそろえて置く。
 *
 * 見分け方は「お金がどう動くか」。
 *   案件   … こちらが払う（発注する相手を探している）
 *   協業先 … 一緒に稼ぐ（組んで案件を取りにいく相手を探している）
 *   相談   … お金は動かない（やり方や事情を知っている人を探している）
 */
const categoryGuide = [
  {
    key: 'project', label: '案件', pick: '案件の発注先',
    summary: 'こちらが発注する相手を探しています',
    detail: 'お金を払って仕事をお願いする相手を探すときに選びます。予算と納期が決まっている（またはおおよそ見えている）お話です。',
    example: '「採用動画を作りたい。20〜40万円で、来月中に撮影できる制作会社」',
  },
  {
    key: 'collaboration', label: '協業先', pick: '協業パートナー',
    summary: '組んで一緒に仕事をする相手を探しています',
    detail: '発注でも受注でもなく、対等に組む相手を探すときに選びます。案件を一緒に取りにいく、お互いの商品を扱い合う、といったお話です。',
    example: '「工務店さま向けの営業に強い方と組んで、リフォーム案件を一緒に取りにいきたい」',
  },
  {
    key: 'consultation', label: '相談・情報', pick: '相談相手・情報',
    summary: '知っている人に話を聞きたい',
    detail: 'その場でお金は動きません。やり方や事情を知っている方から、経験を聞かせていただくときに選びます。',
    example: '「補助金の申請を通した経験のある方に、進め方を伺いたい」',
  },
] as const;

/**
 * 画面に出す予算。**帯が主で、自由記入は補足。**
 * 帯を決めていない古い投稿は、自由記入だけを出す。
 */
function budgetText(need: { budgetBand: string; budgetLabel: string }) {
  const band = budgetBandLabel(need.budgetBand);
  if (band && need.budgetLabel) return `${band}（${need.budgetLabel}）`;
  return band || need.budgetLabel || '応相談';
}

const revenueBands: Record<string, string> = {
  revenue_10_30: '1,000万〜3,000万円',
  revenue_30_70: '3,000万〜7,000万円',
  revenue_70_100: '7,000万円〜1億円',
  revenue_100_plus: '1億円以上',
};

const topBanners = [
  { src: '/banners/top-request.webp', alt: 'こんな人、探しています。探しごとを投稿する案内' },
  { src: '/banners/top-introductions.webp', alt: '届いたオファーをまとめて確認する案内' },
  { src: '/banners/top-rank.webp', alt: 'オファーするほど会員ランクが上がる仕組みの案内' },
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
type AdCalendarDay = { date: string; remaining: number };
type AdOffer = {
  ready: boolean; eligible: boolean; level: number; rank: string;
  titleMax: number; descriptionMax: number;
  /** ランクによる広告の割引率（0〜1）。0なら割引なし。 */
  discountRate: number;
  maxDays: number; daysAhead: number;
  /** 出せる場所。バナーと仕事の掲示板の上位。 */
  placements: { key: string; name: string; where: string; detail: string; slots: number }[];
  /** 空きは場所ごとに違うので、場所をキーにして持つ。 */
  calendars: Record<string, AdCalendarDay[]>;
  slots: AdSlot[];
};

/** 出稿する人が入れる内容。画像は送る前の状態で持っておく。 */
type AdDraft = { title: string; description: string; linkUrl: string; image: File | null; imagePreview: string };
const emptyAdDraft: AdDraft = { title: '', description: '', linkUrl: '', image: null, imagePreview: '' };

/** その枠がいまどういう状態か。掲載前・掲載中・終わった、を1か所で決める。 */
function adState(ad: AdSlot) {
  const now = new Date().toISOString().slice(0, 10);
  if (ad.status === 'stopped') return { label: '掲載停止中', tone: 'stopped', editable: false };
  if (ad.endDate < now) return { label: '掲載終了', tone: 'past', editable: false };
  if (ad.startDate > now) return { label: '掲載予定', tone: 'soon', editable: true };
  return { label: ad.title ? '掲載中' : '内容が未入力', tone: ad.title ? 'live' : 'todo', editable: true };
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

/** 下のメニューの「マイページ」の中で行き来する画面。 */
type MyTab = 'home' | 'search' | 'mypage' | 'profile' | 'posts' | 'offers' | 'plan' | 'invite' | 'receipts' | 'feedback';

/** マイページの「自分の投稿」に出す1件。掲示板の一覧とは別に読む。 */
type MyRequest = {
  id: string; category: string; title: string; description: string; budgetLabel: string; budgetBand: string;
  area: string; industryTags: string[]; deadline: string; status: string; createdAt: string;
  extendedAt: string; introCount: number; commentCount: number;
  thumbUrl: string; imageCount: number; hasVideo: boolean;
};

export default function BoardClient({ initialRequests, initialStats, initialAds, userName, adReturn = '' }: { initialRequests: BoardRequest[]; initialStats: MemberStats; initialAds: AdSlot[]; userName: string; adReturn?: string }) {
  const [requests, setRequests] = useState(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [ads, setAds] = useState(initialAds);
  const [filter, setFilter] = useState('all');
  /** 予算の帯での絞り込み。会社の年商ではなく、その案件にいくら出せるかで見る。 */
  const [budgetFilter, setBudgetFilter] = useState('all');
  const [venueFilter, setVenueFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [industryFilter, setIndustryFilter] = useState('all');
  // 'mypage' はランク・プラン・招待・広告。'profile' は入力するプロフィール設定。
  // 顔写真がまだの人は先にプロフィール設定へ。出稿枠を買って戻ってきた人は、
  // 入稿できるマイページから始める。
  const [activeTab, setActiveTab] = useState<MyTab>(
    !initialStats.avatarUrl ? 'profile' : adReturn === 'done' ? 'mypage' : 'home');
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  /** 編集中の投稿。null なら新規投稿。投稿のモーダルを両方で使い回す。 */
  const [editingRequest, setEditingRequest] = useState<MyRequest | null>(null);
  const [deletingRequest, setDeletingRequest] = useState<MyRequest | null>(null);
  const [receipts, setReceipts] = useState<BillingRecord[] | null>(null);
  const [introCounts, setIntroCounts] = useState({ received: 0, sent: 0 });
  /** お支払いの情報を読み込めなかったか。「準備中」と混ぜないための印。 */
  const [referralFailed, setReferralFailed] = useState(false);
  /** 中身を見せていない（＝プランが足りない）届いたオファーの数。 */
  const [lockedIntros, setLockedIntros] = useState(0);
  /** プランの案内は1回で足りる。開くたびに出すと、ただの邪魔になる。 */
  const upgradeShown = useRef(false);
  /** 自分の投稿ページの絞り込み。件数が増えたときに探せるように。 */
  const [postFilter, setPostFilter] = useState<'all' | 'open' | 'closed'>('all');
  /** きょうの日付。期限を過ぎた投稿に印を付けるのに使う。 */
  const today = new Date().toISOString().slice(0, 10);
  const introBoxNote = introCounts.received || introCounts.sent
    ? `届いた ${introCounts.received}件・出した ${introCounts.sent}件`
    : 'まだオファーのやり取りはありません';
  /** 募集中＝終了しておらず、期限も過ぎていないもの。 */
  const isPostOpen = useCallback((item: MyRequest) => item.status !== 'closed' && item.deadline >= today, [today]);
  const openPostCount = useMemo(() => myRequests.filter(isPostOpen).length, [myRequests, isPostOpen]);
  const shownPosts = useMemo(() => myRequests.filter((item) =>
    postFilter === 'all' ? true : postFilter === 'open' ? isPostOpen(item) : !isPostOpen(item)),
  [myRequests, postFilter, isPostOpen]);
  /** ダッシュボードの数字。届いた紹介とやり取りの合計。 */
  const postTotals = useMemo(() => myRequests.reduce((sum, item) => ({
    intro: sum.intro + item.introCount, comment: sum.comment + item.commentCount,
  }), { intro: 0, comment: 0 }), [myRequests]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [viewedIds, setViewedIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [localListsReady, setLocalListsReady] = useState(false);
  // 画面に出す名前は stats を見る。プロフィールで変えた直後に、再読込しなくても変わるように。
  const shownName = stats.displayName || userName;
  const [profileName, setProfileName] = useState(initialStats.displayName || userName);
  const [profileNameKana, setProfileNameKana] = useState(initialStats.nameKana);
  const [profileCompany, setProfileCompany] = useState(initialStats.company);
  const [profileCompanyKana, setProfileCompanyKana] = useState(initialStats.companyKana);
  const [venuePrefecture, setVenuePrefecture] = useState(findVenuePrefecture(initialStats.venue));
  const [venueChoice, setVenueChoice] = useState(initialStats.venue ? (isListedVenue(initialStats.venue) ? initialStats.venue : OTHER_VENUE) : '');
  const [venueOther, setVenueOther] = useState(isListedVenue(initialStats.venue) ? '' : initialStats.venue);
  const profileVenue = venueChoice === OTHER_VENUE ? venueOther.trim() : venueChoice;
  const [profilePosition, setProfilePosition] = useState(initialStats.positionTitle);
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
  const [modal, setModal] = useState<'request' | 'intro' | 'detail' | 'responses' | 'ads' | 'perks' | 'categories' | 'upgrade' | null>(null);
  /**
   * オファーの種類。**知り合いの紹介は無料、自社で請け負う（受注）は有料。**
   * 画面はここで出し分けるだけで、実際に止めているのは `createIntroduction()`。
   */
  const [offerKind, setOfferKind] = useState<'referral' | 'self'>('referral');
  /** オファーの宛先が広告のとき、その広告。探しごと宛のときは null。 */
  const [offerAd, setOfferAd] = useState<AdSlot | null>(null);
  /** プラン案内に出す一言。断られた理由をそのまま見せるため、空なら既定の文。 */
  const [upgradeNote, setUpgradeNote] = useState('');
  const [selected, setSelected] = useState<BoardRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [requestPhotos, setRequestPhotos] = useState<File[]>([]);
  // 動画は1本まで。選んだ時点で端末側で縮めるので、進み具合を持っておく。
  const [requestVideo, setRequestVideo] = useState<File | null>(null);
  const [requestVideoPreview, setRequestVideoPreview] = useState('');
  const [videoProgress, setVideoProgress] = useState(-1);
  const [requestPhotoPreviews, setRequestPhotoPreviews] = useState<string[]>([]);
  const [planCycle, setPlanCycle] = useState<BillingCycle>('month');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [referral, setReferral] = useState<(ReferralSummary & { url: string; billing?: { ready: boolean; yearly: boolean; hasCustomer: boolean; cycle: BillingCycle; creditedYen: number; creditPerReferralYen: number } }) | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [adInfo, setAdInfo] = useState<AdOffer | null>(null);
  const [editingAd, setEditingAd] = useState('');
  const [adFileName, setAdFileName] = useState('');
  const [adDraft, setAdDraft] = useState<AdDraft>(emptyAdDraft);
  // 出す流れは3つの手順に分ける。1画面に全部出すと、どこまでやったか分からなくなる。
  const [adFlow, setAdFlow] = useState(false);
  const [adStep, setAdStep] = useState(0);
  const [adPlacement, setAdPlacement] = useState<string>(DEFAULT_PLACEMENT);
  // 掲示板の上位に出すとき、どの大分類の一覧を狙うか。空なら全業種。
  const [adIndustry, setAdIndustry] = useState('');
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
      (budgetFilter === 'all' || item.budgetBand === budgetFilter) &&
      (venueFilter === 'all' || item.authorVenue === venueFilter) &&
      // 希望エリアが入っていればそれで、無ければ投稿者の所在地で拾う。
      (regionFilter === 'all'
        || (item.area ? areaMatchesRegion(item.area, regionFilter) : getRegion(item.authorBusinessArea) === regionFilter)) &&
      matchesIndustry(item.industryTags, industryFilter));
    // 業種別プロモーション。その業種で絞ったときだけ、出稿した人を先頭に出す。
    if (industryFilter === 'all') return matched;
    const now = new Date().toISOString();
    const promoted = (item: BoardRequest) => item.promoUntil > now && matchesIndustry([item.promoIndustry], industryFilter);
    return [...matched].sort((a, b) => Number(promoted(b)) - Number(promoted(a)));
  }, [budgetFilter, filter, industryFilter, regionFilter, statusMatched, venueFilter]);
  // 通知はアプリを出してから。それまでは選んだ業種をホームのおすすめに使う。
  // 自分の投稿は外す。おすすめは「自分が紹介できる相手」を出す場所なので。
  // 判定は名前ではなくIDで行う。同姓同名の会員がいると、名前では他人の投稿まで消える。
  const { recommended, ownMatching } = useMemo(() => {
    const matches = (item: BoardRequest) => isOpenRequest(item)
      && stats.notifyIndustries.some((industry) => matchesIndustry(item.industryTags, getIndustryGroup(industry)?.name ?? industry));
    return {
      recommended: requests.filter((item) => !item.mine && matches(item)).slice(0, 12),
      // 業種は合っているのに自分の投稿しか無い、という状態を見分けるため。
      // 「選んだのに何も出ない」と見えるのは、たいていこれ。
      ownMatching: requests.filter((item) => item.mine && matches(item)).length,
    };
  }, [requests, stats.notifyIndustries]);
  const viewedRequests = useMemo(() => viewedIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is BoardRequest => Boolean(item)), [requests, viewedIds]);
  const favoriteRequests = useMemo(() => favoriteIds.map((id) => requests.find((item) => item.id === id)).filter((item): item is BoardRequest => Boolean(item)), [favoriteIds, requests]);
  const canPostRequest = stats.requestLimit === UNLIMITED || stats.requestsThisMonth < stats.requestLimit;
  const count = (category: string) => category === 'all' ? statusMatched.length : statusMatched.filter((item) => item.category === category).length;
  const rankStart = rankThresholds[Math.max(0, stats.level - 1)] ?? 0;
  const rankProgress = stats.level >= rankThresholds.length ? 100 : Math.max(0, Math.min(100, ((stats.inviteCount - rankStart) / Math.max(1, stats.nextRankAt - rankStart)) * 100));
  /** 次のランクまで、あと何人を招待すればよいか。 */
  const invitesToNextRank = Math.max(0, stats.nextRankAt - stats.inviteCount);
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
  // 自分の投稿は、マイページを開いたときに読む。掲示板の一覧には
  // 期限切れや募集終了のものが出ないので、別に引く必要がある。
  const loadMyRequests = useCallback(async () => {
    const response = await fetch('/api/my-requests');
    if (!response.ok) return;
    const data = await response.json() as { requests: MyRequest[] };
    setMyRequests(data.requests ?? []);
  }, []);
  useEffect(() => {
    if (activeTab !== 'mypage' && activeTab !== 'posts') return;
    let alive = true;
    fetch('/api/my-requests').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setMyRequests((data as { requests: MyRequest[] }).requests ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab]);

  // 紹介の受け箱の件数。中身はモーダルを開いたときに読むので、ここは数だけ。
  //
  // ホームでも読むのは、**届いたオファーがあることを気づかせるため**。
  // マイページを開いた人にしか知らせないと、いちばん肝心な「あなたに届いて
  // います」が届かないまま終わってしまう。
  useEffect(() => {
    if (activeTab !== 'mypage' && activeTab !== 'home') return;
    let alive = true;
    fetch('/api/introductions').then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!alive || !data) return;
        const payload = data as { introductions: { locked?: boolean }[]; sent: unknown[] };
        setIntroCounts({ received: payload.introductions?.length ?? 0, sent: payload.sent?.length ?? 0 });
        const locked = payload.introductions?.filter((item) => item.locked).length ?? 0;
        setLockedIntros(locked);
        if (locked && !upgradeShown.current) {
          upgradeShown.current = true;
          setUpgradeNote('');
          setModal('upgrade');
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab]);

  // 支払い履歴と領収書。Stripeに問い合わせるので、マイページを開いたときに1回だけ。
  useEffect(() => {
    if (activeTab !== 'mypage' || receipts) return;
    let alive = true;
    fetch('/api/billing/receipts').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setReceipts((data as { records: BillingRecord[] }).records ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab, receipts]);

  // 招待とお支払いの状態。**タブに関係なく、1回だけ読む。**
  //
  // 以前はマイページを開いている間だけ読んでいた。だが招待の数字は招待ページ、
  // 申し込みボタンはプランページで要る。しかもタブを移ると、飛んでいる途中の
  // 応答を捨てたうえで読み直しもしなかったので、**マイページを開いてすぐ
  // プランを押すと、読み込みが終わる前にタブが変わって referral が永久に
  // 空のまま**になっていた。そうなるとStripeが正しく設定されていても
  // 「準備中です」と出て、申し込みボタンが消える。
  //
  // この応答は資格の判定（DBの書き込み）とStripeへの問い合わせを含むので
  // 遅い。だから ref で押さえて、1回だけにしている。
  const referralLoading = useRef(false);
  useEffect(() => {
    if (referralLoading.current) return;
    referralLoading.current = true;
    fetch('/api/referral').then((response) => response.ok ? response.json() : null)
      .then((data) => {
        // 「まだ読んでいない」と「読めなかった」を区別する。どちらも referral が
        // 空なので、区別しないと申し込みボタンが消えた理由が誰にも分からない。
        if (data) setReferral(data as ReferralSummary & { url: string });
        else setReferralFailed(true);
      })
      .catch(() => setReferralFailed(true));
  }, []);

  // 出稿枠はWebだけの機能。下のメニューからいつでも開けるので、タブに関係なく読む。
  // 設定を開いた時点でも読み直して、他の人に取られた枠が残って見えないようにする。
  useEffect(() => {
    if (activeTab === 'search' && modal !== 'ads') return;
    let alive = true;
    fetch('/api/ads').then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!alive || !data) return;
        const offer = data as AdOffer;
        setAdInfo(offer);
        // まだ1枠も持っていない人は、そのまま出す流れから始める。
        if (offer.eligible && offer.ready && !offer.slots.length) setAdFlow(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab, modal]);

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
  const isPinned = (need: BoardRequest) => need.pinnedUntil > new Date().toISOString();
  const canExtend = (need: BoardRequest) => canExtendRequest(stats.level) && !need.extendedAt;

  function ownerToolsNote(need: BoardRequest) {
    if (!canExtendRequest(stats.level)) return `募集の延長は GOLD から使えます。あと${Math.max(0, rankThresholds[1] - stats.inviteCount)}人の仲間をご招待いただくと GOLD です。`;
    if (isPinned(need)) return 'いま一覧のいちばん上に出ています。';
    return '延長は1件につき1回までです。一覧の上位に出すのは、広告メニューからお申し込みいただけます。';
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

  async function refreshBoard() {
    const response = await fetch('/api/board');
    if (!response.ok) return;
    const data = await response.json() as { requests: BoardRequest[]; stats: MemberStats; ads: AdSlot[] };
    setRequests(data.requests); setStats(data.stats); setAds(data.ads ?? []);
  }

  async function chooseRequestVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setVideoProgress(0);
    // 実時間かかるので、進み具合を出しながら待たせる。
    const result = await compressVideo(file, setVideoProgress);
    setVideoProgress(-1);
    if (!result.ok) return showToast(result.error);
    setRequestVideo(result.file);
    setRequestVideoPreview((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(result.file); });
  }

  function removeRequestVideo() {
    setRequestVideoPreview((current) => { if (current) URL.revokeObjectURL(current); return ''; });
    setRequestVideo(null);
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
    body.delete('videoPick');
    if (requestVideo) body.set('video', requestVideo);

    // 編集は PATCH。通知は出さない（同じ投稿で何度も知らせない）。
    const editing = editingRequest;
    const response = editing
      ? await fetch(`/api/requests/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body })
      : await fetch('/api/board', { method: 'POST', body });
    const result = await response.json() as { error?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? (editing ? '保存できませんでした。' : '投稿できませんでした。'));
    removeRequestVideo();
    setModal(null); setEditingRequest(null); form.reset(); setRequestIndustries([]); clearRequestPhoto();
    await refreshBoard();
    await loadMyRequests().catch(() => {});
    showToast(editing ? '探しごとを保存しました。' : '探しごとを投稿しました。関連業種の会員へ通知します。');
  }

  async function submitIntroduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 宛先は探しごとか広告のどちらか。どちらも無ければ送らない。
    if (!selected && !offerAd) return;
    setBusy(true);
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const target = offerAd ? { adId: offerAd.id } : { requestId: selected?.id };
    const response = await fetch('/api/introductions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...raw, ...target, kind: offerKind, consentConfirmed: raw.consentConfirmed === 'on' }) });
    const result = await response.json() as { error?: string; paywall?: boolean }; setBusy(false);
    if (!response.ok) {
      // プランが足りないときは、赤い一言で終わらせずに案内まで出す。
      if (result.paywall) { setUpgradeNote(result.error ?? ''); setModal('upgrade'); return; }
      return showToast(result.error ?? 'オファーを送れませんでした。');
    }
    setModal(null); setOfferAd(null); form.reset(); await refreshBoard(); showToast('オファーを送りました。10ポイント加算されました。');
  }

  async function saveProfile() {
    setBusy(true);
    const body = new FormData();
    body.set('company', profileCompany); body.set('venue', profileVenue); body.set('positionTitle', profilePosition);
    body.set('displayName', profileName.trim()); body.set('nameKana', profileNameKana.trim());
    body.set('companyKana', profileCompanyKana.trim());
    body.set('businessArea', profileArea); body.set('primaryIndustry', profileIndustry);
    body.set('notifyIndustries', JSON.stringify(profileNotifyIndustries)); body.set('annualRevenueBand', profileRevenue); body.set('facebookUrl', profileFacebook);
    if (profilePhoto) body.set('avatar', profilePhoto);
    const response = await fetch('/api/profile', { method: 'PATCH', body });
    const result = await response.json() as { error?: string; avatarUrl?: string }; setBusy(false);
    if (!response.ok) return showToast(result.error ?? 'プロフィールを保存できませんでした。');
    const avatarUrl = result.avatarUrl ?? stats.avatarUrl;
    setStats((current) => ({ ...current, displayName: profileName.trim(), nameKana: profileNameKana.trim(), company: profileCompany, companyKana: profileCompanyKana.trim(), venue: profileVenue, positionTitle: profilePosition, businessArea: profileArea, primaryIndustry: profileIndustry, notifyIndustries: profileNotifyIndustries, annualRevenueBand: profileRevenue, facebookUrl: profileFacebook, avatarUrl }));
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
    if (!stats.avatarUrl) { showProfileSettings(); return showToast('投稿の前に顔写真を登録してください。'); }
    setEditingRequest(null); setRequestIndustries([]); clearRequestPhoto(); removeRequestVideo();
    setModal('request');
  }

  /** 自分の投稿を直す。同じモーダルを、中身を入れて開く。 */
  function openEditRequest(item: MyRequest) {
    setEditingRequest(item);
    setRequestIndustries(item.industryTags);
    setRequestIndustryGroup(getIndustryGroup(item.industryTags[0] ?? '')?.name ?? 'IT・システム');
    clearRequestPhoto(); removeRequestVideo();
    setModal('request');
  }

  function closeRequestModal() {
    setModal(null); setEditingRequest(null);
  }

  /** 自分の投稿を消す。取り消せないので、確かめてから呼ぶ。 */
  async function confirmDeleteRequest() {
    const target = deletingRequest;
    if (!target) return;
    setBusy(true);
    const response = await fetch(`/api/requests/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
    const result = await response.json() as { error?: string }; setBusy(false);
    setDeletingRequest(null);
    if (!response.ok) return showToast(result.error ?? '削除できませんでした。');
    await refreshBoard();
    await loadMyRequests().catch(() => {});
    showToast('探しごとを削除しました。');
  }

  /** 広告あてにオファーする。入力も線引きも探しごとと同じで、宛先が違うだけ。 */
  function openAdIntroduction(ad: AdSlot) {
    if (!stats.avatarUrl) { showProfileSettings(); return showToast('オファーの前に顔写真を登録してください。'); }
    setOfferAd(ad); setSelected(null); setOfferKind('referral'); setModal('intro');
  }

  function openIntroduction(need: BoardRequest) {
    if (!stats.avatarUrl) { showProfileSettings(); return showToast('オファーの前に顔写真を登録してください。'); }
    setOfferAd(null); setOfferKind('referral');
    setSelected(need); setModal('intro');
  }


  // いちばん近い空いている日。カレンダーの初期値に使う。
  // 空きは場所ごとに違う。いま選んでいる場所のぶんだけ見る。
  const adCalendarDays = adInfo?.calendars[adPlacement] ?? [];
  const currentPlacement = adInfo?.placements.find((item) => item.key === adPlacement) ?? adPlacements[0];
  const nextOpenDay = adCalendarDays.find((day) => day.remaining > 0);
  // 選んだ期間に満枠の日が1日でもあれば申し込めない。
  const periodOpen = useMemo(() => {
    if (!adInfo || !adStart) return false;
    const last = shiftDate(adStart, adDays - 1);
    const inRange = adCalendarDays.filter((day) => day.date >= adStart && day.date <= last);
    return inRange.length === adDays && inRange.every((day) => day.remaining > 0);
  }, [adInfo, adCalendarDays, adStart, adDays]);
  function openAdSettings() {
    setEditingAd('');
    setOpenStats('');
    setModal('ads');
  }

  function closeAdSettings() {
    setModal(null);
    setEditingAd('');
    setOpenStats('');
    closeAdFlow();
  }

  function startAdFlow() {
    setAdFileName('');
    setAdDraft(emptyAdDraft);
    setAdStep(0);
    setAdFlow(true);
  }

  function closeAdFlow() {
    setAdFlow(false);
    setAdStep(0);
    setAdFileName('');
    setAdDraft((current) => {
      if (current.imagePreview.startsWith('blob:')) URL.revokeObjectURL(current.imagePreview);
      return emptyAdDraft;
    });
  }

  // カレンダーを開いた時点で、空いている一番近い日を選んでおく。
  useEffect(() => {
    if (modal !== 'ads' || adStart || !nextOpenDay) return;
    const timer = window.setTimeout(() => {
      setAdStart(nextOpenDay.date);
      setAdDays((current) => Math.max(AD_MIN_DAYS, Math.min(current, adInfo?.maxDays ?? 30)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [modal, adStart, nextOpenDay, adInfo?.maxDays]);

  async function buyAdSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !adStart) return;
    setBusy(true);
    try {
      // 内容と期間を1回で送る。押さえるのと入稿が同時に済むので、
      // 買ったのに何も出ていない枠ができない。
      const body = new FormData();
      body.set('title', adDraft.title);
      body.set('description', adDraft.description);
      body.set('linkUrl', adDraft.linkUrl);
      body.set('placement', adPlacement);
      body.set('industry', adPlacement === 'list' ? adIndustry : '');
      body.set('startDate', adStart);
      body.set('days', String(adDays));
      // 縮小は出す人の端末でやる。Workersでは変換しない。
      if (adDraft.image) body.set('image', await detailImage(adDraft.image));
      const response = await fetch('/api/ads/checkout', { method: 'POST', body });
      const data = await response.json() as { url?: string; error?: string; stripeCode?: string; stripeParam?: string };
      if (data.url) { window.location.assign(data.url); return; }
      // 断られた理由の印を、文言のうしろに小さく足す。運営が原因を持ち帰れる
      // ようにするため（鍵や本文は出ない。Stripeが付ける短い識別子だけ）。
      // 印は**文の先頭**に出す。うしろに付けると、文が長いときに見切れて
      // いちばん知りたいところだけ読めなくなる。
      const hint = [data.stripeCode, data.stripeParam].filter(Boolean).join(' / ');
      showToast(`${hint ? `[${hint}] ` : ''}${data.error || 'お支払い画面を開けませんでした。'}`);
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
    setAdFileName('');
    setAdDraft({ title: ad.title, description: ad.description, linkUrl: ad.linkUrl, image: null, imagePreview: '' });
  }

  function chooseAdImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return showToast('画像は15MB以下を選んでください。');
    setAdFileName(file.name);
    setAdDraft((current) => {
      if (current.imagePreview.startsWith('blob:')) URL.revokeObjectURL(current.imagePreview);
      return { ...current, image: file, imagePreview: URL.createObjectURL(file) };
    });
  }

  async function saveAd(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const body = new FormData();
    body.set('title', adDraft.title);
    body.set('description', adDraft.description);
    body.set('linkUrl', adDraft.linkUrl);
    if (adDraft.image) body.set('image', await detailImage(adDraft.image));
    const response = await fetch(`/api/ads/${encodeURIComponent(id)}`, { method: 'POST', body });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return showToast(result.error ?? '保存できませんでした。');
    setEditingAd('');
    setAdFileName('');
    showToast('掲載内容を保存しました。');
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
      const data = await response.json() as { url?: string; error?: string; stripeCode?: string; stripeParam?: string };
      if (data.url) { window.location.assign(data.url); return; }
      // 断られた理由の印を**文の先頭**に出す。うしろに付けると、文が長いときに
      // 見切れて、いちばん知りたいところだけ読めなくなる。
      // 出るのはStripeが付ける短い識別子だけで、鍵も本文も出ない。
      const hint = [data.stripeCode, data.stripeParam].filter(Boolean).join(' / ');
      showToast(`${hint ? `[${hint}] ` : ''}${data.error || 'お支払い画面を開けませんでした。'}`);
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

  /** ランク・プラン・招待・広告のページ。下のメニューの「マイページ」。 */
  function showMyPage() {
    setModal(null);
    setActiveTab('mypage');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** マイページの中の画面へ移る。どのタイルからも同じ道を通す。 */
  function goTab(tab: MyTab) {
    setModal(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showMyPosts() { goTab('posts'); }

  /** プロフィールを入力するページ。入口は右上の顔写真だけ。 */
  function showProfileSettings() {
    setModal(null);
    setActiveTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 広告は出す場所で分かれる。バナーはカルーセル、一覧は掲示板の先頭。
  const bannerAds = useMemo(() => ads.filter((ad) => (ad.placement || DEFAULT_PLACEMENT) === 'banner'), [ads]);
  // 掲示板の上位。業種を狙った広告は、その大分類を見ているときだけ出す。
  // 狙っていない広告（industry が空）は、どの一覧でも先頭に出る。
  /**
   * マイページのタイル。**それぞれが下層ページの入口**で、マイページ自体には
   * 中身を並べない。全部を1枚に積むと、下の欄が遠くなって使われなくなる。
   */
  // **6つちょうど**にしてある。3列なので、7つあると最後の1枚だけが3段目に
  // ぽつんと残る。「仲間を招待」はこの下の帯に出してあり、ここには入れない。
  const mypageTiles = [
    // 数はタイルの右肩に出す。説明文にすると2行になって、タイルの高さが揃わない。
    { key: 'offers', icon: <OfferIcon className="mypage-glyph" />, label: 'オファー', badge: introCounts.received, note: introCounts.sent ? `出した ${introCounts.sent}件` : '', go: () => goTab('offers') },
    { key: 'posts', icon: <PostsIcon className="mypage-glyph" />, label: '自分の投稿', badge: myRequests.length, note: openPostCount ? `募集中 ${openPostCount}件` : '', go: () => goTab('posts') },
    { key: 'plan', icon: <PlanIcon className="mypage-glyph" />, label: 'プラン', badge: 0, note: planCatalog[stats.plan].name, go: () => goTab('plan') },
    { key: 'receipts', icon: <ReceiptIcon className="mypage-glyph" />, label: '支払い履歴', badge: receipts?.length ?? 0, note: '', go: () => goTab('receipts') },
    { key: 'profile', icon: <ProfileIcon className="mypage-glyph" />, label: 'プロフィール', badge: 0, note: '', go: () => goTab('profile') },
    { key: 'feedback', icon: <VoiceIcon className="mypage-glyph" />, label: 'ご意見', badge: 0, note: '', go: () => goTab('feedback') },
  ];

  // 出しすぎない歯止め。枠を押さえるときは日ごとに3件までしか通さないので
  // 普通はここに4件以上来ない。ただし**業種を狙った広告と全業種の広告が
  // 混ざる**ので、数え方が変わったときに一覧の先頭がPRだらけになりうる。
  // どの業種を見ていても、絞り込まなくても、出るのは先頭3件まで。
  const listAds = useMemo(() => shuffle(ads.filter((ad) => ad.placement === 'list'
    && (!ad.industry || ad.industry === (getIndustryGroup(industryFilter)?.name ?? industryFilter))))
    .slice(0, placementSlots('list')),
  [ads, industryFilter]);

  // 出稿された広告を先に置く。お金をいただいている枠なので、いちばん先に目に入る場所に出す。
  // 並びは開くたびに入れ替える。同じ月に出した人へ均等に順番が回るようにするため。
  const slides = useMemo(() => [
    ...shuffle(bannerAds).map((ad) => ({ src: ad.imageUrl, alt: `${ad.memberName}さんの広告「${ad.title}」`, ad })),
    ...topBanners.map((banner) => ({ ...banner, ad: null as AdSlot | null })),
  ], [bannerAds]);
  const slide = slides[Math.min(carouselIndex, slides.length - 1)];

  // 広告は自分から送らないと見てもらえないので、一定の間隔で次へ送る。
  // 枚数は広告の数で変わるため、必ず slides.length で折り返すこと（固定の数にしない）。
  // ホームを見ているあいだだけ動かす。自分で送った人は、そこで止める。
  useEffect(() => {
    if (activeTab !== 'home' || slides.length < 2 || carouselPaused) return;
    const timer = window.setInterval(() => setCarouselIndex((index) => (index + 1) % slides.length), AD_ROTATE_MS);
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

  /** 掲示板の上位に出している広告を押したとき。数え方はバナーと同じ。 */
  function openListAd(ad: AdSlot) {
    trackAd({ clicks: [ad.id] });
    if (ad.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
    else showToast(`${ad.memberCompany || ad.memberName}さまの広告です。詳しくは会場やメッセージで直接おたずねください。`);
  }

  // 掲示板を開いているあいだ、上位の広告も見られた数を数える。
  // 間引き方はバナーと同じ（同じ広告は1日1回まで）。
  useEffect(() => {
    if (activeTab !== 'search' || !listAds.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const key = `${adSeenStorageKey}:${today}`;
    let seen: string[] = [];
    try { seen = JSON.parse(window.localStorage.getItem(key) ?? '[]') as string[]; } catch { seen = []; }
    const fresh = listAds.filter((ad) => !seen.includes(ad.id)).map((ad) => ad.id);
    if (!fresh.length) return;
    try { window.localStorage.setItem(key, JSON.stringify([...seen, ...fresh])); } catch { /* 数えられないだけ */ }
    trackAd({ views: fresh });
  }, [activeTab, listAds]);

  function openCurrentBanner() {
    const ad = slide?.ad;
    if (ad) {
      trackAd({ clicks: [ad.id] });
      if (ad.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
      else showToast(`${ad.memberCompany || ad.memberName}さまの広告です。詳しくは会場やメッセージで直接おたずねください。`);
      return;
    }
    const fixedIndex = carouselIndex - (slides.length - topBanners.length);
    if (fixedIndex === 0) return openRequest();
    if (fixedIndex === 1) return setModal('responses');
    showMyPage();
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
        <button className="header-profile" onClick={showProfileSettings}><span><small>こんにちは</small><b>{shownName}</b></span><Avatar src={stats.avatarUrl} name={shownName} className="mini-avatar" /></button>
      </header>

      {activeTab === 'home' ? <div className="home-dashboard">
        <section className="hero-carousel" aria-label={`${serviceName}の使い方`}>
          <button key={carouselIndex} className={`hero-image-slide${slide?.ad ? ' is-ad' : ''}`} onClick={openCurrentBanner} aria-label={`${slide?.alt ?? ''}を開く`}>{slide?.ad
            ? <AdBanner ad={{ title: slide.ad.title, description: slide.ad.description, imageUrl: slide.ad.imageUrl, by: slide.ad.memberCompany || slide.ad.memberName }} />
            : <img src={slide?.src} alt={slide?.alt ?? ''} />}</button>
          {/* バナー全体が1つのボタンなので、オファーの入口は入れ子にできない。
              重ねて置く。押す先が違う（バナー＝広告主のページ、こちら＝オファー）
              ので、見た目でも分かれているほうがよい。 */}
          {slide?.ad && <button className="hero-ad-offer" onClick={() => openAdIntroduction(slide.ad!)}>この広告にオファー</button>}
          <div className="carousel-dots" aria-label="バナーを切り替える">{slides.map((entry, index) => <button key={index} aria-label={`${index + 1}枚目${entry.ad ? '（広告）' : ''}`} className={`${carouselIndex === index ? 'active' : ''}${entry.ad ? ' is-ad' : ''}`} onClick={() => { setCarouselPaused(true); setCarouselIndex(index); }} />)}</div>
        </section>

        <HomeShelf title="あなたにおすすめの探しごと" count={recommended.length}
          emptyTitle={!stats.notifyIndustries.length ? 'おすすめに出したい業種を選びましょう'
            : ownMatching > 0 ? 'いまは、ご自身の投稿だけです' : '今はおすすめできる探しごとがありません'}
          emptyText={!stats.notifyIndustries.length ? 'マイページで業種を選ぶと、関係のありそうな探しごとがここに並びます。'
            : ownMatching > 0 ? `選んだ業種に合う探しごとは${ownMatching}件ありますが、すべてご自身の投稿です。ここにはオファーできる相手だけを並べるため、ご自身の分は出しません。ほかの会員が投稿すると並びます。`
            : '選んだ業種の探しごとが投稿されると、ここに並びます。'}
          onMore={() => stats.notifyIndustries.length ? showSearch() : showProfileSettings()}>
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

        {!stats.avatarUrl && <button className="photo-required-banner" onClick={showProfileSettings}><span>顔写真の登録が必要です</span><b>本人だと分かる写真を登録すると、投稿・オファーができます。</b><i>登録する →</i></button>}
      </div> : activeTab === 'search' ? <section className="mobile-board search-page" id="board">
        <div className="section-title"><div><p>REQUESTS</p><h2>{industryFilter === 'all' ? '仕事の掲示板' : industryFilter}<button type="button" className="info-button" onClick={() => setModal('categories')} aria-label="案件・協業先・相談の違いを見る">i</button></h2></div><span>{shown.length}件</span></div>
        {industryFilter !== 'all' && <button className="clear-industry" onClick={() => setIndustryFilter('all')}><IndustryIcon group={getIndustryGroup(industryFilter)?.name ?? 'その他'} />{industryFilter}で絞り込み中 <i>×</i></button>}
        {industryFilter !== 'all' && getIndustryGroup(industryFilter) && <div className="subindustry-filter" aria-label="詳細業種で絞り込む"><button className={industryFilter === getIndustryGroup(industryFilter)?.name ? 'selected' : ''} onClick={() => setIndustryFilter(getIndustryGroup(industryFilter)?.name ?? 'all')}>すべて</button>{getIndustryGroup(industryFilter)?.children.map((industry) => <button key={industry} className={industryFilter === industry ? 'selected' : ''} onClick={() => setIndustryFilter(industry)}>{industry}</button>)}</div>}
        <div className="filters" role="group" aria-label="投稿を絞り込む">{[['all','すべて'],['project','案件'],['collaboration','協業先'],['consultation','相談']].map(([key,label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}<span>{count(key)}</span></button>)}</div>
        <div className="member-filters">
          <p>絞り込む</p>
          <label className="wide"><span>募集状況</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'open' | 'closed' | 'all')}><option value="open">募集中</option><option value="closed">募集終了</option><option value="all">すべて</option></select></label>
          <label><span>会場</span><select value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}><option value="all">すべての会場</option>{venueGroups.map(([prefecture, venues]) => <optgroup label={prefecture} key={prefecture}>{venues.map((venue) => <option value={venue} key={venue}>{venue}</option>)}</optgroup>)}</select></label>
          <label><span>エリア</span><select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}><option value="all">全国</option>{regions.map((region) => <option value={region.name} key={region.name}>{region.name}</option>)}</select></label>
          <label><span>業種</span><select value={getIndustryGroup(industryFilter)?.name ?? 'all'} onChange={(event) => setIndustryFilter(event.target.value)}><option value="all">すべての業種</option>{industryGroups.map((group) => <option value={group.name} key={group.name}>{group.name}</option>)}</select></label>
          <label className={canFilterByBudget(stats.level) ? '' : 'is-locked'}><span>案件の予算 {!canFilterByBudget(stats.level) && <em>{rankNames[2]}から</em>}</span><select value={budgetFilter} disabled={!canFilterByBudget(stats.level)} onChange={(event) => setBudgetFilter(event.target.value)}><option value="all">すべての予算</option>{Object.entries(budgetBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        <div className="card-list">
          {/* お金をいただいている枠なので、絞り込みに関係なくいちばん上に出す */}
          {listAds.map((ad) => <article className="need-card is-ad" key={ad.id} onClick={() => openListAd(ad)}>
            <div className="card-topline"><span className="kind ad-kind">PR</span><span className="card-top-actions"><span className="deadline">{ad.memberCompany || ad.memberName}</span></span></div>
            <h3>{ad.title}</h3>
            {ad.imageUrl && <img className="need-thumb" src={ad.imageUrl} alt="" loading="lazy" decoding="async" />}
            {ad.description && <p className="need-body">{ad.description}</p>}
            {ad.linkUrl && <p className="ad-card-link">{ad.linkUrl.replace(/^https?:\/\//, '')}</p>}
            {/* カードを押すと広告主のページへ飛ぶ（出した人が買ったのはそこ）ので、
                オファーは別のボタンにして、押し間違いで飛ばないよう伝播を止める。 */}
            <button className="intro-button" onClick={(event) => { event.stopPropagation(); openAdIntroduction(ad); }}>この広告にオファー <span>→</span></button>
          </article>)}
          {shown.length === 0 ? <div className="empty"><b>条件に合う投稿がありません</b><span>絞り込みを変えて探してみましょう。</span></div> : shown.map((need) => (
            <article className={isOpenRequest(need) ? 'need-card' : 'need-card closed'} key={need.id} onClick={() => openNeed(need)}>
              <div className="card-topline"><span className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</span><span className="card-top-actions">{isOpenRequest(need) ? <span className="deadline">あと{daysLeft(need.deadline)}日</span> : <span className="deadline ended">募集終了</span>}<button className={favoriteIds.includes(need.id) ? 'card-heart active' : 'card-heart'} aria-label={favoriteIds.includes(need.id) ? 'お気に入りから外す' : 'お気に入りに保存'} onClick={(event) => { event.stopPropagation(); toggleFavorite(need); }}>♥</button></span></div>
              <h3>{need.title}</h3>{need.thumbUrl && <img className="need-thumb" src={need.thumbUrl} alt="" loading="lazy" decoding="async" />}<p className="need-body">{need.description}</p>
              <div className="industry-tags" aria-label="関連業種">{need.industryTags.map((industry) => <span key={industry}>{industry}</span>)}</div>
              <dl className="details"><div><dt>予算</dt><dd>{budgetText(need)}</dd></div><div><dt>エリア</dt><dd>{need.area || '指定なし'}</dd></div></dl>
              <div className="card-person"><Avatar src={need.authorAvatarUrl} name={need.authorName} className="member-avatar" /><p><b>{need.authorName}</b><small>{need.authorPositionTitle && `${need.authorPositionTitle}｜`}{need.authorCompany || '会社名未設定'}</small></p><span>オファー {need.introCount}件</span></div>
              <div className="member-context">{need.commentCount > 0 && <span className="comment-count">やり取り {need.commentCount}件</span>}<span>会場 {need.authorVenue}</span>{need.authorBusinessArea && <span>エリア {need.authorBusinessArea}</span>}{need.authorRevenueBand && <span>年商 {revenueBands[need.authorRevenueBand]}</span>}</div>
              <button className="intro-button" onClick={(event) => { event.stopPropagation(); openIntroduction(need); }}>この人にオファー <span>→</span></button>
            </article>
          ))}
        </div>
      </section> : activeTab === 'mypage' ? <section className="profile-page" aria-labelledby="profile-page-title">
        <header className="profile-page-heading"><p>MY PAGE</p><h1 id="profile-page-title">マイページ</h1></header>
        <button className={`rank-card rank-${stats.rank.toLowerCase()} rank-card-slim`} onClick={() => setModal('perks')} aria-label={`${stats.rank}会員ランクカード。特典を見る`}>
          <p className="rank-slim-top"><CrownMark /><b>{serviceName}</b></p>
          <RankCrest rank={stats.rank} />
          <h2 className="rank-slim-title">{stats.rank}</h2>
          <p className="rank-slim-sub">MEMBER</p>
          <div className="rank-slim-foot">
            <span><small>会員名</small><b>{shownName}</b></span>
            <span className="rank-slim-venue"><small>会場</small><b>{stats.venue || '未設定'}</b></span>
          </div>
          <span className="rank-slim-more">特典を見る ›</span>
        </button>
        <button className="rank-next" onClick={() => setModal('perks')}>
          <div className="rank-next-copy"><b>{stats.level >= rankThresholds.length ? '最高ランクに到達' : `あと${invitesToNextRank}人の招待でランクアップ`}</b><span>参加した仲間 {stats.inviteCount}人・オファー {stats.introCount}件</span></div>
          <span className="rank-next-track"><i style={{ width: `${rankProgress}%` }} /></span>
        </button>
        <nav className="mypage-grid" aria-label="マイページのメニュー">
          {mypageTiles.map((tile) => <button key={tile.key} className="mypage-tile" onClick={tile.go}>
            <span className="mypage-tile-icon" aria-hidden="true">{tile.icon}
              {tile.badge > 0 && <i>{tile.badge > 99 ? '99+' : tile.badge}</i>}</span>
            <b>{tile.label}</b>
            <small>{tile.note}</small>
          </button>)}
        </nav>

        {/* 招待だけタイルから外して帯にしてある。7枚だと3列に収まらず最後の
            1枚が3段目に残るのと、**ランクが上がる唯一の道**なので、ほかの
            入口と同じ大きさで並べるより、ここで1本立てたほうが目に入る。 */}
        <button className="mypage-invite" onClick={() => goTab('invite')}>
          <span className="mypage-invite-icon" aria-hidden="true"><InviteIcon className="mypage-glyph" /></span>
          <span className="mypage-invite-copy">
            <b>仲間を招待する</b>
            <small>{stats.level >= rankThresholds.length
              ? `参加した仲間 ${stats.inviteCount}人・最高ランクです`
              : `参加した仲間 ${stats.inviteCount}人・あと${invitesToNextRank}人で ${rankNames[stats.level]}`}</small>
          </span>
          <span className="mypage-invite-go" aria-hidden="true">›</span>
        </button>

        <LegalLinks />
      </section> : activeTab === 'offers' ? <section className="profile-page" aria-labelledby="offers-title">
        <header className="profile-page-heading"><p>OFFERS</p><h1 id="offers-title">オファーのやり取り</h1><span>届いたオファーと、あなたが出したオファーです。相手とそのままやり取りできます。</span></header>
        <ReceivedIntroductions onUpgrade={() => goTab('plan')} />
        <button className="profile-back" onClick={showMyPage}>マイページへ戻る</button>
      </section> : activeTab === 'plan' ? <section className="profile-page" aria-labelledby="plan-title">
        <header className="profile-page-heading"><p>PLAN</p><h1 id="plan-title">プラン</h1><span>今のプランと、切り替え・お支払いの手続きです。</span></header>
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
                {/* 3つに分ける。読み込めなかっただけの人に「準備中です」と
                    言ってしまうと、こちらの設定漏れだと思われるうえ、
                    直し方（開き直す）も伝わらない。 */}
                {plan !== 'free' && plan !== stats.contractedPlan && (referral?.billing?.ready
                  ? <button className="plan-pick" onClick={() => startBilling(plan)} disabled={busy}>このプランにする</button>
                  : referralFailed
                    ? <p className="plan-not-ready">お支払いの情報を読み込めませんでした。画面を開き直してもう一度お試しください。</p>
                    : referral
                      ? <p className="plan-not-ready">オンラインでのお申し込みは準備中です。ご希望の方は運営窓口までお知らせください。</p>
                      : <p className="plan-not-ready">読み込んでいます…</p>)}
              </li>)}
            </ul>
            <PlanTable current={stats.plan} />
            {referral?.billing?.hasCustomer && <button className="plan-manage" onClick={openBillingPortal} disabled={busy}>お支払い・解約の手続き</button>}
            <p className="plan-note">仲間を1人招待してご利用が{referral?.qualifyDays ?? 30}日続くと、{stats.contractedPlan === 'free' ? <><b>自動でスタンダードが1ヶ月使えるようになります</b>（お手続きは要りません）</> : <><b>次回の請求から1ヶ月分自動で引かれます</b></>}。{referral?.billing?.ready ? '有料プランへのお申し込みは、上のボタンからいつでもどうぞ。解約もいつでもできます。' : ''}</p>
          </div>
        </details>

        <button className="profile-back" onClick={showMyPage}>マイページへ戻る</button>
      </section> : activeTab === 'invite' ? <section className="profile-page" aria-labelledby="invite-title">
        <header className="profile-page-heading"><p>INVITE</p><h1 id="invite-title">仲間を招待する</h1><span>あなたの招待リンク（または招待コード）から入会した方の人数で<b>ランクが上がります</b>。ご利用が続くと、会費も無料になります。</span></header>
        {referral && <section className="invite-card" aria-label="仲間を招待する">
          <div className="invite-heading"><p>INVITE</p><h2>仲間を招待する</h2><span>あなたの招待リンクから入会して{referral.qualifyDays}日続いた方1人につき、{stats.paid ? '会費が1ヶ月無料になります' : 'スタンダードが1ヶ月使えます'}（合計{referral.capTotal}ヶ月まで）。</span></div>
          <button className="invite-link" onClick={copyInviteLink}><span>{referral.url.replace(/^https?:\/\//, '')}</span><i>{inviteCopied ? 'コピーしました' : 'リンクをコピー'}</i></button>
          {/* リンクを送れない場面のために、コードそのものも出しておく。
              例会で口頭で伝えたり、名刺に書いて渡したりできる。
              受け取った人はログイン画面の「招待コードをお持ちの方」から入れる。 */}
          <p className="invite-code"><small>あなたの招待コード</small><b>{referral.code}</b>
            <em>リンクを送れないときは、このコードをお伝えください。ログイン画面から入力して参加できます。</em></p>
          <dl className="invite-stats">
            <div><dt>招待した人</dt><dd>{referral.invitedCount}<small>人</small></dd></div>
            <div><dt>利用中</dt><dd>{referral.activeCount}<small>人</small></dd></div>
            <div><dt>{stats.paid ? '無料になった月' : '有料になった月'}</dt><dd>{referral.earnedMonths}<small>ヶ月</small></dd></div>
          </dl>
          <ul className="invite-note">
            {referral.waitingCount > 0 && <li><b>{referral.waitingCount}人</b><span>いまご利用を停止しています</span></li>}
            {!!referral.billing?.creditPerReferralYen && <li><b>1人につき {referral.billing.creditPerReferralYen.toLocaleString('ja-JP')}円</b><span>{referral.billing.cycle === 'year' ? '次回の年額のお支払いから引かれます' : '次回の請求から引かれます'}</span></li>}
            {referral.remaining > 0 && referral.qualifyingCount > 0 && <li><b>{referral.qualifyingCount}人</b><span>ご利用が{referral.qualifyDays}日続くと、1ヶ月分の利用料が無料になります</span></li>}
            {referral.waitingCredits > 0 && <li><b>受け取り済み</b><span>合計{referral.capTotal}ヶ月分の上限に達しました。ご紹介はいつでも歓迎ですが、これ以上の無料月は付きません</span></li>}
          </ul>
          <p className="invite-terms">この特典は、予告なく内容の変更または終了をすることがあります。すでに確定した分は、そのままご利用いただけます。</p>
        </section>}

        <button className="profile-back" onClick={showMyPage}>マイページへ戻る</button>
      </section> : activeTab === 'receipts' ? <section className="profile-page" aria-labelledby="receipts-title">
        <header className="profile-page-heading"><p>RECEIPTS</p><h1 id="receipts-title">支払い履歴</h1><span>お支払いのたびに領収書が作られます。ここからいつでも開いて、印刷や保存ができます。</span></header>
        <section className="receipt-card" aria-label="支払い履歴">
          <div className="receipt-heading"><p>RECEIPTS</p><h2>支払い履歴</h2><span>お支払いのたびに領収書が作られます。ここからいつでも開いて、印刷や保存ができます。</span></div>
          {receipts === null ? <p className="receipt-empty">読み込んでいます…</p>
            : !receipts.length ? <p className="receipt-empty">まだお支払いはありません。有料プランや広告のお申し込みをいただくと、ここに並びます。</p>
            : <ul className="receipt-list">{receipts.map((record) => <li key={record.id}>
              <div className="receipt-row">
                <span className="receipt-date">{record.date.replace(/-/g, '/')}</span>
                <b className="receipt-yen">{record.yen.toLocaleString('ja-JP')}円</b>
              </div>
              <small className="receipt-what">{record.what}{!record.paid && <em>お支払い待ち</em>}</small>
              {record.receiptUrl && <a className="receipt-open" href={record.receiptUrl} target="_blank" rel="noopener noreferrer">領収書を開く ›</a>}
            </li>)}</ul>}
        </section>

        <button className="profile-back" onClick={showMyPage}>マイページへ戻る</button>
      </section> : activeTab === 'feedback' ? <section className="profile-page" aria-labelledby="feedback-title">
        <header className="profile-page-heading"><p>YOUR VOICE</p><h1 id="feedback-title">こうしてほしい、を聞かせてください</h1><span>{serviceName}は作っている途中です。足りないところ、使いにくいところを教えてください。</span></header>
        <section className="feedback-card" aria-label="機能改善のご意見">
          <div className="feedback-heading"><p>YOUR VOICE</p><h2>こうしてほしい、を聞かせてください</h2><span>{serviceName}は作っている途中です。使ってみて足りないところ、使いにくいところを教えてください。いただいたご意見は運営が必ず読みます。</span></div>
          {feedbackSent ? <div className="feedback-done"><b>お送りいただきました</b><span>ありがとうございます。続けてお気づきの点があれば、また送ってください。</span><button onClick={() => setFeedbackSent(false)}>もう1件送る</button></div> : <form className="feedback-form" onSubmit={submitFeedback}>
            <label><span>種類</span><select name="category" defaultValue="feature">{feedbackCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
            <label><span>内容</span><textarea name="body" required maxLength={1000} rows={4} placeholder="例：会場ごとの探しごとをまとめて見たい／会場での集まりの告知も出したい" /></label>
            <button className="submit-button" disabled={busy}>{busy ? '送信しています…' : '送る'}</button>
          </form>}
        </section>


        <button className="profile-back" onClick={showMyPage}>マイページへ戻る</button>
      </section> : activeTab === 'posts' ? <section className="profile-page" aria-labelledby="my-posts-title">
        {/* 自分の投稿。件数が増えるので、マイページの中ではなく1ページ取る。 */}
        <header className="profile-page-heading"><p>MY POSTS</p><h1 id="my-posts-title">自分の投稿</h1><span>これまでに出した探しごとです。募集が終わったものも残ります。内容はあとから直せます。</span></header>

        <dl className="post-totals">
          <div><dt>投稿</dt><dd>{myRequests.length}<small>件</small></dd></div>
          <div><dt>募集中</dt><dd>{openPostCount}<small>件</small></dd></div>
          <div><dt>届いたオファー</dt><dd>{postTotals.intro}<small>件</small></dd></div>
          <div><dt>やり取り</dt><dd>{postTotals.comment}<small>件</small></dd></div>
        </dl>

        <div className="post-filters" role="group" aria-label="投稿の絞り込み">
          {([['all', 'すべて', myRequests.length], ['open', '募集中', openPostCount], ['closed', '終わった募集', myRequests.length - openPostCount]] as const).map(([key, label, count]) =>
            <button key={key} className={postFilter === key ? 'selected' : ''} onClick={() => setPostFilter(key)} aria-pressed={postFilter === key}>{label} <span>{count}</span></button>)}
        </div>

        {!myRequests.length
          ? <p className="my-requests-empty">まだ投稿がありません。下の「＋」から、探している人を書いてみてください。</p>
          : !shownPosts.length
          ? <p className="my-requests-empty">この条件に当てはまる投稿はありません。</p>
          : <ul className="my-request-list">{shownPosts.map((item) => {
            const expired = item.deadline < today;
            return <li key={item.id} className={`my-request${isPostOpen(item) ? '' : ' is-done'}`}>
              <div className="my-request-top">
                <span className="my-request-state">{item.status === 'closed' ? '募集終了' : expired ? '期限切れ' : '募集中'}</span>
                <small>{item.createdAt.slice(0, 10).replace(/-/g, '/')} 投稿</small>
              </div>
              <b className="my-request-title">{item.title}</b>
              <p className="my-request-meta">
                <span>期限 {item.deadline.replace(/-/g, '/')}</span>
                <span>オファー {item.introCount}件</span>
                <span>やり取り {item.commentCount}件</span>
                {item.imageCount > 0 && <span>写真 {item.imageCount}枚</span>}
                {item.hasVideo && <span>動画あり</span>}
              </p>
              <div className="my-request-actions">
                <button onClick={() => openEditRequest(item)}>編集する</button>
                <button className="is-danger" onClick={() => setDeletingRequest(item)}>削除する</button>
              </div>
            </li>;
          })}</ul>}

        <button className="profile-back" onClick={showMyPage}>マイページへ戻る</button>
      </section> : <section className="profile-page" aria-labelledby="profile-settings-title">
        {/* プロフィール設定。入口は右上の顔写真と、マイページの「プロフィールを編集する」。 */}
        <header className="profile-page-heading"><p>PROFILE</p><h1 id="profile-settings-title">プロフィール設定</h1><span>ここで登録した内容が、探しごとやオファーのときに相手に見えます。</span></header>
        <div className="profile-form profile-page-form">
          <label className="photo-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} /><span className="photo-upload-preview">{photoPreview ? <img src={photoPreview} alt="登録する顔写真のプレビュー" /> : <b>＋</b>}</span><span><b>顔写真 <em>必須</em></b><small>本人だと分かる正面の写真を選択<br />JPEG・PNG・WebP／5MBまで</small></span><i>{stats.avatarUrl ? '変更する' : '写真を選ぶ'}</i></label>
          <label>お名前 <small className="req">必須</small><input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={40} placeholder="二俣 将" required /></label>
          <label>お名前のふりがな <small>任意</small><input value={profileNameKana} onChange={(event) => setProfileNameKana(event.target.value)} maxLength={60} placeholder="ふたまた しょう" /></label>
          <label>会社名 <small className="req">必須</small><input value={profileCompany} onChange={(event) => setProfileCompany(event.target.value)} maxLength={80} placeholder="株式会社〇〇" required /></label>
          <label>会社名のふりがな <small>任意</small><input value={profileCompanyKana} onChange={(event) => setProfileCompanyKana(event.target.value)} maxLength={100} placeholder="かぶしきがいしゃ〇〇" /></label>
          <div className="profile-venue-select">
            <p>所属会場 <small className="req">必須</small></p>
            <label>都道府県<select value={venuePrefecture} onChange={(event) => { setVenuePrefecture(event.target.value); setVenueChoice(''); }}><option value="">選択してください</option>{venuePrefectures.map((prefecture) => <option value={prefecture} key={prefecture}>{prefecture}</option>)}</select></label>
            <label>会場<select value={venueChoice} onChange={(event) => setVenueChoice(event.target.value)} disabled={!venuePrefecture && venueChoice !== OTHER_VENUE}><option value="">会場を選択</option>{(venuesByPrefecture[venuePrefecture] ?? []).map((venue) => <option value={venue} key={venue}>{venue}</option>)}<option value={OTHER_VENUE}>その他（自由入力）</option></select></label>
            {venueChoice === OTHER_VENUE && <label className="wide">会場名 <small>正式な会場名を入力</small><input value={venueOther} onChange={(event) => setVenueOther(event.target.value)} maxLength={60} placeholder="例：ひるのめぐろ会場" /></label>}
          </div>
          <label>肩書き <small>任意</small><input value={profilePosition} onChange={(event) => setProfilePosition(event.target.value)} maxLength={60} placeholder="世話人" /></label>
          <label>活動エリア <small>任意・検索に使われます</small><select value={profileArea} onChange={(event) => setProfileArea(event.target.value)}><option value="">選択しない</option>{prefectures.map((prefecture) => <option value={prefecture} key={prefecture}>{prefecture}</option>)}</select></label>
          <div className="profile-industry-select"><p>自分の業種 <small>おすすめの設定に使われます</small></p><label>大分類<select value={profileIndustryGroup} onChange={(event) => { setProfileIndustryGroup(event.target.value); setProfileIndustry(''); }}><option value="">選択してください</option>{industryGroups.map((group) => <option value={group.name} key={group.name}>{group.name}</option>)}</select></label><label>詳細業種<select value={profileIndustry} onChange={(event) => { const value = event.target.value; setProfileIndustry(value); if (value && !profileNotifyIndustries.includes(value)) setProfileNotifyIndustries((current) => [...current, value].slice(0, notifyIndustryLimit(stats.level))); }} disabled={!profileIndustryGroup}><option value="">詳細業種を選択</option>{profileIndustry === profileIndustryGroup && <option value={profileIndustryGroup}>大分類のみ（旧設定）</option>}{industryGroups.find((group) => group.name === profileIndustryGroup)?.children.map((industry) => <option value={industry} key={industry}>{industry}</option>)}</select></label></div>
          <IndustryPicker legend="おすすめに出したい業種" note={`${notifyIndustryLimit(stats.level)}個まで`} description="選んだ詳細業種の探しごとが、ホームの「あなたにおすすめ」に出ます。" selected={profileNotifyIndustries} activeGroup={profileNotifyGroup} onGroupChange={setProfileNotifyGroup} onToggle={(industry) => toggleIndustry(industry, profileNotifyIndustries, setProfileNotifyIndustries, notifyIndustryLimit(stats.level))} className="profile-tag-field" />
          <label>会社の年商 <small>任意</small><select value={profileRevenue} onChange={(event) => setProfileRevenue(event.target.value)}><option value="">選択しない</option>{Object.entries(revenueBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Facebook <small>任意・オファーのあとに直接やり取りできます</small><input value={profileFacebook} onChange={(event) => setProfileFacebook(event.target.value)} maxLength={200} placeholder="https://www.facebook.com/your.name" inputMode="url" /></label>
          <button className="profile-save-button" onClick={saveProfile} disabled={busy || !profileName.trim() || !profileCompany.trim() || !profileVenue.trim() || (!stats.avatarUrl && !profilePhoto)}>{busy ? '保存中…' : 'プロフィールを保存する'}</button>
        </div>
        <button className="profile-back" onClick={showMyPage}>マイページへ戻る</button>
      </section>}

      <nav className="bottom-nav" aria-label="アプリメニュー">
        <button className={activeTab === 'home' ? 'active' : ''} onClick={showHome}><span><HomeIcon /></span><small>ホーム</small></button>
        <button className={activeTab === 'search' ? 'active' : ''} onClick={() => showSearch()}><span><SearchIcon /></span><small>探す</small></button>
        <button className="nav-post" onClick={openRequest} aria-label="探しごとを投稿する"><span>＋</span></button>
        <button className={modal === 'ads' ? 'active' : ''} onClick={openAdSettings}><span><BannerIcon /></span><small>広告</small></button>
        <button className={modal !== 'ads' && activeTab !== 'home' && activeTab !== 'search' ? 'active' : ''} onClick={showMyPage}><span><PersonIcon /></span><small>マイページ</small></button>
      </nav>

      {modal === 'request' && !canPostRequest && !editingRequest && <Modal title="今月分の投稿は完了しています" lead={`${planCatalog[stats.plan].name}プランで投稿できる探しごとは月${stats.requestLimit}件までです。`} onClose={() => setModal(null)}><div className="quota-block"><p>来月になるとまた投稿できます。今すぐ続けて投稿したい場合は、マイページのプラン欄からスタンダードへお切り替えください。何件でも投稿できるようになります。</p><p>仲間を1人招待して{referral?.qualifyDays ?? 30}日続けてご利用いただくと、スタンダードを1ヶ月お試しいただけます。マイページの「仲間を招待する」から招待リンクをお送りください。</p><button className="submit-button" onClick={() => { setModal(null); showMyPage(); }}>マイページを開く</button></div></Modal>}

      {modal === 'request' && (canPostRequest || editingRequest) && <Modal title={editingRequest ? '探しごとを編集' : '探しごとを投稿'} lead={editingRequest ? '直したいところを書き替えて、保存してください。' : 'どんな人にオファーしてほしいかを具体的に書きましょう。'} onClose={closeRequestModal}><form className="form" key={editingRequest?.id ?? 'new'} onSubmit={submitRequest}><label>探しているもの <button type="button" className="info-button" onClick={() => setModal('categories')} aria-label="3つの違いを見る">i</button><select name="category" required defaultValue={editingRequest?.category ?? ''}><option value="" disabled>選択してください</option>{categoryGuide.map((item) => <option value={item.key} key={item.key}>{item.pick}</option>)}</select></label><label>タイトル<input name="title" required maxLength={90} placeholder="例：採用に強い動画制作会社" defaultValue={editingRequest?.title ?? ''} /></label><label>詳しい内容 {descriptionLimit(stats.level) > 600 && <small className="req">上限なし</small>}<textarea name="description" required maxLength={descriptionLimit(stats.level)} rows={4} placeholder="どんな課題があり、どんな人をオファーしてほしいか" defaultValue={editingRequest?.description ?? ''} /></label><IndustryPicker legend="関連する業種" note="必須・3個まで" selected={requestIndustries} activeGroup={requestIndustryGroup} onGroupChange={setRequestIndustryGroup} onToggle={(industry) => toggleIndustry(industry, requestIndustries, setRequestIndustries, 3)} /><label>予算<select name="budgetBand" required defaultValue={editingRequest?.budgetBand ?? ''}><option value="" disabled>選択してください</option>{Object.entries(budgetBands).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>予算のくわしい書き方 <small>任意</small><input name="budgetLabel" maxLength={60} placeholder="例：月額20〜40万円／初回は50万円まで" defaultValue={editingRequest?.budgetLabel ?? ''} /></label><label>希望エリア <small>任意</small><select name="area" defaultValue={editingRequest?.area ?? ''}><option value="">指定しない</option>{requestAreaOptions.map((area) => <option value={area} key={area}>{area}</option>)}</select></label><label>募集期限<input name="deadline" type="date" required min="2026-08-27" defaultValue={editingRequest?.deadline ?? ''} /></label>{editingRequest && <label>募集状況<select name="status" defaultValue={editingRequest.status}><option value="open">募集中</option><option value="closed">募集を終了する</option></select></label>}{/* 写真と動画の枠は、**使えない人にも見せておく**。隠してしまうと
          「そんな機能がある」ことに気づかないので、上のランクへ上がる理由が
          伝わらない。掲示板の絞り込みと同じで、鍵の札を出して押せなくする。 */}
        <div className="request-photos"><p><b>写真を付ける <em>任意</em></b><small>{photoLimit(stats.level) > 1 ? `${stats.rank}は${photoLimit(stats.level)}枚まで付けられます` : '現場や商品の写真があると、一覧で見つけてもらいやすくなります'}</small></p><div className="request-photo-grid">{requestPhotoPreviews.map((preview, index) => <span key={preview} className="request-photo-item"><img src={preview} alt={`添付する写真 ${index + 1}枚目`} /><button type="button" onClick={() => removeRequestPhoto(index)} aria-label={`${index + 1}枚目を削除`}>×</button></span>)}{requestPhotos.length < photoLimit(stats.level) && <label className="request-photo-add"><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" multiple={photoLimit(stats.level) > 1} onChange={chooseRequestPhoto} /><b>＋</b><small>{requestPhotos.length ? 'もう1枚' : '写真を選ぶ'}</small></label>}{photoLimit(stats.level) < PHOTO_LIMIT_TOP && Array.from({ length: PHOTO_LIMIT_TOP - photoLimit(stats.level) }, (_, index) => <span className="request-photo-add is-locked" key={`locked-${index}`} aria-hidden="true"><b>＋</b><small>{rankNames[2]}から</small></span>)}</div>{photoLimit(stats.level) < PHOTO_LIMIT_TOP && <p className="request-locked-note"><em>{rankNames[2]}から</em>写真を{PHOTO_LIMIT_TOP}枚まで付けられます。仲間を{Math.max(0, rankThresholds[2] - stats.inviteCount)}人ご招待いただくと {rankNames[2]} です。</p>}</div><div className={canPostVideo(stats.level) ? 'request-video' : 'request-video is-locked'}><p><b>動画を付ける <em>任意</em></b><small>{VIDEO_MAX_SECONDS}秒まで。選ぶと端末の中で自動的に小さくします。</small></p>
        {!canPostVideo(stats.level)
          ? <><span className="request-video-add is-locked" aria-hidden="true"><b>＋</b><small>{rankNames[2]}から</small></span>
            <p className="request-locked-note"><em>{rankNames[2]}から</em>探しごとに短い動画を付けられます。仲間を{Math.max(0, rankThresholds[2] - stats.inviteCount)}人ご招待いただくと {rankNames[2]} です。</p></>
          : <>
        {videoProgress >= 0
          ? <div className="request-video-busy"><span style={{ width: `${Math.round(videoProgress * 100)}%` }} /><b>動画を小さくしています… {Math.round(videoProgress * 100)}%</b></div>
          : requestVideoPreview
            ? <div className="request-video-item"><video src={requestVideoPreview} controls playsInline preload="metadata" /><button type="button" onClick={removeRequestVideo}>動画を外す</button></div>
            : <label className="request-video-add"><input name="videoPick" type="file" accept="video/*" onChange={chooseRequestVideo} /><b>＋</b><small>動画を選ぶ</small></label>}</>}
      </div><button className="submit-button" disabled={busy || !requestIndustries.length || videoProgress >= 0}>{busy ? '保存しています…' : editingRequest ? '保存する' : '投稿する'}</button></form></Modal>}

      {deletingRequest && <Modal title="この探しごとを削除しますか" lead="削除すると元に戻せません。" onClose={() => setDeletingRequest(null)}>
        <div className="quota-block">
          <p><b>{deletingRequest.title}</b></p>
          <p>この探しごとに届いたオファー {deletingRequest.introCount}件と、やり取り {deletingRequest.commentCount}件も一緒に消えます。写真や動画も消えます。</p>
          <p>募集を止めたいだけなら、削除ではなく<b>編集から「募集を終了する」</b>を選ぶと、記録とやり取りを残したまま新しいオファーを止められます。</p>
          <button className="submit-button is-danger" onClick={confirmDeleteRequest} disabled={busy}>{busy ? '削除しています…' : '削除する'}</button>
          <button className="quota-cancel" onClick={() => setDeletingRequest(null)} disabled={busy}>やめる</button>
        </div>
      </Modal>}

      {/* オファーには2つある。**人を紹介する**のはギブなので無料のまま、
          **自社で請け負う**のは受注そのものなのでスタンダードから。
          切り替えで入力そのものが変わるのは、自社の場合「あなたとの関係」に
          書きようがないため。 */}
      {modal === 'intro' && (selected || offerAd) && <Modal
        title={offerAd ? 'この広告にオファー' : 'この探しごとにオファー'}
        lead={offerAd ? `「${offerAd.title}」（${offerAd.memberCompany || offerAd.memberName}さま）へのオファーです。` : `「${selected?.title}」へのオファーです。`}
        onClose={() => { setModal(null); setOfferAd(null); }}>
        <div className="offer-kind" role="group" aria-label="オファーの種類">
          <button type="button" className={offerKind === 'referral' ? 'selected' : ''} onClick={() => setOfferKind('referral')} aria-pressed={offerKind === 'referral'}>
            <b>リファラル<em>無料</em></b><small>知り合いを紹介します。人をつなぐだけなので、どのプランでもどうぞ。</small></button>
          <button type="button" className={offerKind === 'self' ? 'selected' : ''} onClick={() => setOfferKind('self')} aria-pressed={offerKind === 'self'}>
            <b>オファー<em>有料</em></b><small>自社で請け負います。仕事を受ける話なので、スタンダードから。</small></button>
        </div>
        {offerKind === 'self' && stats.plan === 'free'
          ? <div className="offer-locked">
            <p><b>オファー（自社で請け負う）は、スタンダードプランからお送りいただけます。</b></p>
            <p>リファラル（知り合いのご紹介）は、無料プランのままいつでもどうぞ。</p>
            <button className="submit-button" onClick={() => { setUpgradeNote(''); setModal('upgrade'); }}>プランを見る</button>
          </div>
          : <form className="form" onSubmit={submitIntroduction} key={offerKind}>
            {offerKind === 'self' ? <>
              <label>ご担当者名<input name="personName" required maxLength={60} defaultValue={stats.displayName} /></label>
              <label>会社・屋号<input name="personCompany" required maxLength={80} defaultValue={stats.company} /></label>
              <label>お請けできること・実績<textarea name="fitReason" required maxLength={400} rows={3} placeholder="例：同じ規模の内装を年10件。着工まで2週間でお請けできます。" /></label>
            </> : <>
              <label>お名前<input name="personName" required maxLength={60} /></label>
              <label>会社・屋号<input name="personCompany" required maxLength={80} /></label>
              <label>あなたとの関係<input name="relationship" required maxLength={120} placeholder="例：取引先、友人" /></label>
              <label>オファーしたい理由<textarea name="fitReason" required maxLength={400} rows={3} /></label>
              <label className="consent"><input type="checkbox" name="consentConfirmed" required /> ご本人にオファーの了承を得ています</label>
            </>}
            <button className="submit-button" disabled={busy}>{busy ? '送っています…' : 'オファーを送る'}</button>
          </form>}
      </Modal>}

      {/* 無料のままオファーが届いた人への案内。数と日付までは受け箱で見えて
          いるので、ここは「開けます」の一言に絞る。 */}
      {modal === 'upgrade' && <Modal title="オファーが届いています" lead={upgradeNote || (lockedIntros ? `あなたの探しごとに ${lockedIntros}件のオファーが届いています。` : '')} onClose={() => setModal(null)}>
        <div className="upgrade-panel">
          <p>スタンダードプランにすると、<b>オファーを受け取ることができます</b>。</p>
          <ul>
            <li>届いたオファーの中身を読む</li>
            <li>オファーをくれた方とやり取りする</li>
            <li>オファー（自社で請け負う）を送る</li>

          </ul>
          <p className="upgrade-free">リファラル（知り合いのご紹介）は、これまでどおり無料プランのままどうぞ。</p>
          <button className="submit-button" onClick={() => { setModal(null); goTab('plan'); }}>プランを見る</button>
          <button className="quota-cancel" onClick={() => setModal(null)}>あとで</button>
        </div>
      </Modal>}

      {modal === 'perks' && <Modal title="ランクの特典" lead="招待して参加した仲間の人数でランクが上がり、できることが増えます。一度上がったランクは下がりません。" onClose={() => { setModal(null); setOpenPerk(''); }}>
        <div className="perk-panel">
          <ol className="perk-ladder" aria-label="ランクの段階">{rankNames.map((name, index) => {
            const level = index + 1;
            return <li key={name} className={`${level === stats.level ? 'now' : ''}${level < stats.level ? ' done' : ''}`}>
              <span className={`perk-ladder-dot rank-${name.toLowerCase()}`} aria-hidden="true" />
              <b>{name}</b>
              {/* ランクの物差しは**招待して参加した仲間の人数**。オファーの件数ではない。 */}
              <small>{rankThresholds[index] === 0 ? 'はじめから' : `招待${rankThresholds[index]}人`}</small>
            </li>;
          })}</ol>

          <p className="perk-now">
            <b><small>会員ランク</small>{stats.rank}</b>
            <span>{stats.level >= rankNames.length ? '最高ランクです。ありがとうございます。' : `あと${invitesToNextRank}人の仲間をご招待いただくと ${rankNames[stats.level]} になります。`}</span>
          </p>

          <ul className="perk-grid">{rankPerks.map((perk) => {
            const unlocked = stats.level >= perk.minLevel;
            return <li key={perk.key}>
              <button className={`perk-tile${unlocked ? '' : ' locked'}${openPerk === perk.key ? ' open' : ''} needs-${rankNames[perk.minLevel - 1].toLowerCase()}`} onClick={() => setOpenPerk(openPerk === perk.key ? '' : perk.key)}>
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
              {!unlocked && !perk.soon && <p className="perk-detail-note">あと{Math.max(0, rankThresholds[perk.minLevel - 1] - stats.inviteCount)}人の仲間をご招待いただくと使えるようになります。</p>}
            </div>;
          })()}

          <p className="perk-terms">特典の内容は、予告なく変更または終了することがあります。ランクは招待して参加した仲間の人数で決まり、下がることはありません。</p>
        </div>
      </Modal>}

      {modal === 'ads' && adInfo && <Modal title="広告を出す" lead={`ご指定の期間だけ広告を掲載できます。お支払いは日数分の1回のみ（税込）。`} onClose={closeAdSettings}>
        <div className="ad-panel">
          {/* いま持っている枠。ここは見るところで、申し込みは下の流れで行う。 */}
          {adInfo.slots.length > 0 && !adFlow && <ul className="ad-slot-list">{adInfo.slots.map((ad) => {
            const state = adState(ad);
            return <li key={ad.id} className={`ad-slot is-${state.tone}`}>
              <div className="ad-slot-head"><b>{formatRange(ad.startDate, ad.endDate)}</b><span className={`ad-state is-${state.tone}`}>{state.label}</span></div>
              {editingAd !== ad.id && <AdBanner ad={{ title: ad.title, description: ad.description, imageUrl: ad.imageUrl, by: stats.company || shownName }} />}

              {editingAd === ad.id
                ? <form className="ad-fields" onSubmit={(event) => saveAd(event, ad.id)}>
                    <AdFields offer={adInfo} draft={adDraft} onChange={setAdDraft} onImage={chooseAdImage} imageName={adFileName} keepImage={Boolean(ad.imageUrl)} />
                    <AdPreview draft={adDraft} fallbackImage={ad.imageUrl} by={stats.company || shownName} />
                    <div className="ad-step-actions"><button type="button" onClick={() => setEditingAd('')} disabled={busy}>キャンセル</button><button className="submit-button" disabled={busy}>{busy ? '保存しています…' : '変更を保存'}</button></div>
                  </form>
                : <>
                    <div className="ad-slot-foot"><b>{ad.linkUrl ? ad.linkUrl.replace(/^https?:\/\//, '') : 'リンク先なし'}</b>{state.editable && <button onClick={() => startEditingAd(ad)}>掲載内容を変更</button>}</div>
                    {(ad.viewCount > 0 || state.tone !== 'soon') && <button className="ad-stats-open" onClick={() => toggleStats(ad.id)}>{openStats === ad.id ? 'レポートを閉じる' : '掲載レポートを見る'}<i aria-hidden="true">{openStats === ad.id ? '▴' : '▾'}</i></button>}
                    {openStats === ad.id && (adStats ? <AdAnalytics slot={adStats.slot} days={adStats.days} /> : <p className="ad-analytics-empty">読み込んでいます…</p>)}
                  </>}
            </li>;
          })}</ul>}

          {!adInfo.ready
            ? <p className="ad-note">広告の受け付けは準備中です。ご希望の方は運営窓口までお問い合わせください。</p>
            : !nextOpenDay
            ? <p className="ad-note">ただいま{adInfo.daysAhead}日先まで、{placementName(adPlacement)}の{currentPlacement.slots}枠すべてが埋まっています。空きが出ましたらお申し込みいただけます。</p>
            : !adFlow
              ? <button className="ad-entry-open ad-flow-open" onClick={startAdFlow}>
                  <span><b>新規のお申し込み</b><small>4ステップで完了します。掲載日数分のお支払いが1回のみ</small></span>
                  <i aria-hidden="true">›</i>
                </button>
              : <form className="ad-flow" onSubmit={buyAdSlot}>
                  <ol className="ad-steps" aria-label="出すまでの手順">
                    {['掲載枠', '掲載内容', '掲載期間', 'ご確認'].map((name, index) => <li key={name} className={`${index === adStep ? 'now' : ''}${index < adStep ? ' done' : ''}`.trim()}>
                      <b>{index < adStep ? '✓' : index + 1}</b><span>{name}</span>
                    </li>)}
                  </ol>

                  {adStep === 0 && <div className="ad-step">
                    <p className="ad-step-head"><b>掲載枠</b><span>どこに出すかをお選びください。場所によって枠数と見え方が変わります。</span></p>
                    <div className="ad-placements">{adInfo.placements.map((item) => {
                      // 残りは日によって違う。**いちばん早く空いている日**の残りを出す。
                      // その日がまず選ばれるので、出稿する人がいちばん知りたい数になる。
                      const calendar = adInfo.calendars[item.key] ?? [];
                      const firstOpen = calendar.find((day) => day.remaining > 0);
                      const fromToday = Boolean(firstOpen && calendar[0] && firstOpen.date === calendar[0].date);
                      return <button type="button" key={item.key}
                        className={`ad-placement${adPlacement === item.key ? ' is-picked' : ''}`}
                        aria-pressed={adPlacement === item.key}
                        onClick={() => { setAdPlacement(item.key); setAdStart(''); }}>
                        <PlacementDemo placement={item.key} />
                        <span className="ad-placement-copy">
                          <b>{item.name}<em>{item.slots}枠</em></b>
                          <small>{item.where}</small>
                          <small>{item.detail}</small>
                          <i className={firstOpen ? '' : 'is-full'}>{!firstOpen ? 'ただいま満枠です'
                            : fromToday ? `${item.slots}枠のうち 残り${firstOpen.remaining}枠`
                            : `${formatDay(firstOpen.date)}から 残り${firstOpen.remaining}枠`}</i>
                        </span>
                      </button>;
                    })}</div>
                    {adPlacement === 'list' && <label className="ad-industry-pick"><span>どの業種の一覧に出しますか <small>任意</small></span>
                      <select value={adIndustry} onChange={(event) => setAdIndustry(event.target.value)}>
                        <option value="">すべての業種の一覧に出す</option>
                        {industryGroups.map((group) => <option value={group.name} key={group.name}>{group.name}の一覧だけに出す</option>)}
                      </select>
                      <small>業種を選ぶと、その大分類を見ている方にだけ出ます。届く人数は減りますが、その業種を探している方に確実に当たります。</small>
                    </label>}
                    <div className="ad-step-actions"><button type="button" onClick={closeAdFlow}>キャンセル</button><button type="button" className="submit-button" onClick={() => setAdStep(1)}>次へ：掲載内容</button></div>
                  </div>}

                  {adStep === 1 && <div className="ad-step">
                    <p className="ad-step-head"><b>掲載内容</b><span>タイトルのみでも掲載できます。画像を添えると目に留まりやすくなります。</span></p>
                    <div className="ad-fields"><AdFields offer={adInfo} draft={adDraft} onChange={setAdDraft} onImage={chooseAdImage} imageName={adFileName} /></div>
                    <AdPreview draft={adDraft} by={stats.company || shownName} />
                    <div className="ad-step-actions"><button type="button" onClick={() => setAdStep(0)}>戻る</button><button type="button" className="submit-button" disabled={!adDraft.title.trim()} onClick={() => setAdStep(2)}>{adDraft.title.trim() ? '次へ：掲載期間の指定' : 'タイトルをご入力ください'}</button></div>
                  </div>}

                  {adStep === 2 && <div className="ad-step">
                    <p className="ad-step-head"><b>掲載期間</b><span>カレンダーから掲載開始日を選び、掲載日数をご指定ください。{placementName(adPlacement)}は同一期間に{currentPlacement.slots}枠までです。</span></p>
                    <AdCalendar days={adCalendarDays} startDate={adStart} spanDays={adDays} onPick={setAdStart} />
                    <label className="ad-days"><span>掲載日数 <small>{AD_MIN_DAYS}〜{adInfo.maxDays}日</small></span>
                      <input type="range" min={AD_MIN_DAYS} max={adInfo.maxDays} value={adDays} onChange={(event) => setAdDays(Number(event.target.value))} />
                      <b>{adDays}日</b>
                    </label>
                    {/* 動かした結果がいくらになるのか、その場で見えるようにする */}
                    <p className="ad-quote">
                      {adInfo.discountRate > 0 && <s>{adTotalPrice(adPlacement, adDays)}</s>}
                      <b>{adTotalPrice(adPlacement, adDays, adInfo.discountRate)}</b>
                      <small>{adDailyPrice(adPlacement)} × {adDays}日（税込・1回のみ）
                        {adInfo.discountRate > 0 && `／${adInfo.rank}の${Math.round(adInfo.discountRate * 100)}%OFF適用`}</small>
                    </p>
                    <p className={`ad-period${adStart && !periodOpen ? ' is-full' : ''}`}>{!adStart
                      ? 'カレンダーから掲載開始日をお選びください'
                      : periodOpen
                        ? `掲載期間　${formatRange(adStart, shiftDate(adStart, adDays - 1))}`
                        : 'ご指定の期間に満枠の日が含まれています。掲載日数を短くするか、開始日を変更してください'}</p>
                    <div className="ad-step-actions"><button type="button" onClick={() => setAdStep(1)}>戻る</button><button type="button" className="submit-button" disabled={!adStart || !periodOpen} onClick={() => setAdStep(3)}>次へ：内容のご確認</button></div>
                  </div>}

                  {adStep === 3 && <div className="ad-step">
                    <p className="ad-step-head"><b>お申し込み内容</b><span>お支払いの完了後、ただちに掲載を開始します。</span></p>
                    <AdBanner ad={{ title: adDraft.title, description: adDraft.description, imageUrl: adDraft.imagePreview, by: stats.company || shownName }} />
                    <dl className="ad-check">
                      <div><dt>掲載枠</dt><dd>{placementName(adPlacement)}<small>{currentPlacement.slots}枠のうち1枠{adPlacement === 'list' && `／${adIndustry ? `${adIndustry}の一覧` : 'すべての業種の一覧'}`}</small></dd></div><div><dt>掲載期間</dt><dd>{adStart && formatRange(adStart, shiftDate(adStart, adDays - 1))}<small>{adDays}日間</small></dd></div>
                      <div><dt>リンク先</dt><dd>{adDraft.linkUrl ? adDraft.linkUrl.replace(/^https?:\/\//, '') : <em>設定なし</em>}</dd></div>
                      <div className="ad-check-pay"><dt>お支払い額</dt><dd>{adTotalPrice(adPlacement, adDays, adInfo.discountRate)}<small>{adDailyPrice(adPlacement)}×{adDays}日{adInfo.discountRate > 0 && `・${adInfo.rank}の${Math.round(adInfo.discountRate * 100)}%OFF`}・税込・1回のみ</small></dd></div>
                    </dl>
                    <div className="ad-step-actions"><button type="button" onClick={() => setAdStep(2)}>戻る</button><button className="submit-button" disabled={busy || !adStart || !periodOpen}>{busy ? '処理しています…' : 'お支払いへ進む'}</button></div>
                    <p className="ad-note">お支払いは決済代行会社（Stripe）の画面で行います。掲載内容は掲載開始後も変更いただけます。</p>
                  </div>}
                </form>}
        </div>
      </Modal>}

      {modal === 'categories' && <Modal title="3つの違い" lead="迷ったら「お金がどう動くか」で選んでください。" onClose={() => setModal(null)}>
        <ul className="category-guide">{categoryGuide.map((item) => <li key={item.key}>
          <p className="category-guide-head"><span className={`kind ${categories[item.key].className}`}>{item.label}</span><b>{item.summary}</b></p>
          <p className="category-guide-detail">{item.detail}</p>
          <p className="category-guide-example"><small>例</small>{item.example}</p>
        </li>)}</ul>
        <p className="category-guide-note">あとから選び直せます。近いものを選んでいただければ大丈夫です。</p>
      </Modal>}

      {modal === 'responses' && <Modal title="オファーのやり取り" lead="届いたオファーと、あなたが出したオファーです。相手とそのままやり取りできます。" onClose={() => setModal(null)}><ReceivedIntroductions onUpgrade={() => { setModal(null); goTab('plan'); }} /></Modal>}

      {modal === 'detail' && selected && <Modal title="探しごとの詳細" lead={`${selected.authorName}さんの探しごとです。`} onClose={() => setModal(null)}><article className="need-detail">
        <div className="card-topline"><span className={`kind ${categories[selected.category].className}`}>{categories[selected.category].label}</span><button className={favoriteIds.includes(selected.id) ? 'detail-heart active' : 'detail-heart'} onClick={() => toggleFavorite(selected)}>♥ {favoriteIds.includes(selected.id) ? '保存済み' : 'お気に入り'}</button></div>
        <h3>{selected.title}</h3>
        {selected.imageUrls.length > 1
          ? <div className="need-gallery">{selected.imageUrls.map((url, index) => <img key={url} src={url} alt={`${selected.title}に添えられた写真 ${index + 1}枚目`} loading="lazy" decoding="async" />)}</div>
          : selected.imageUrl && <img className="need-photo" src={selected.imageUrl} alt={`${selected.title}に添えられた写真`} loading="lazy" decoding="async" />}
        <p>{selected.description}</p>
        {selected.videoUrl && <video className="need-video" src={selected.videoUrl} controls playsInline preload="metadata" />}
        <div className="industry-tags">{selected.industryTags.map((industry) => <span key={industry}>{industry}</span>)}</div>
        <dl><div><dt>予算</dt><dd>{budgetText(selected)}</dd></div><div><dt>希望エリア</dt><dd>{selected.area || '指定なし'}</dd></div><div><dt>募集期限</dt><dd>{selected.deadline}</dd></div></dl>
        <div className="detail-author"><Avatar src={selected.authorAvatarUrl} name={selected.authorName} className="member-avatar" /><p><b>{selected.authorName}</b><span>{selected.authorPositionTitle && `${selected.authorPositionTitle}｜`}{selected.authorCompany || '会社名未設定'}</span><small>{selected.authorVenue}{selected.authorBusinessArea && `・${selected.authorBusinessArea}`}</small></p><FacebookLink url={selected.authorFacebookUrl} name={selected.authorName} /></div>
        {selected.mine
          ? <div className="owner-tools">
              <p className="owner-tools-head"><b>あなたの探しごと</b><span>{stats.rank}の特典が使えます</span></p>
              <div className="owner-tools-row">
                <button disabled={busy || !canExtend(selected)} onClick={() => extendOwnRequest(selected)}>{selected.extendedAt ? '延長ずみ' : `期限を${EXTEND_DAYS}日のばす`}</button>
                <button onClick={() => { setSelected(null); openAdSettings(); }}>広告で上位に出す</button>
              </div>
              <p className="owner-tools-note">{ownerToolsNote(selected)}</p>
            </div>
          : <button className="submit-button" onClick={() => openIntroduction(selected)}>この人にオファーする</button>}
        {(selected.myIntroCount > 0 || (selected.mine && selected.introCount > 0)) && <div className="intro-notice">
          <span aria-hidden="true">✓</span>
          {selected.mine
            ? <p><b>オファーが{selected.introCount}件届いています</b><small>オファーの中身は「届いたオファー」で読めます</small></p>
            : <p><b>あなたはこの探しごとにオファーを{selected.myIntroCount}件送りました</b><small>中身は投稿者だけが読めます。ここには出ません</small></p>}
          {selected.mine && <button type="button" onClick={() => { setSelected(null); setModal('responses'); }}>届いたオファーを見る</button>}
        </div>}

        <RequestComments requestId={selected.id} viewerId={stats.memberId} isRequestAuthor={selected.mine} onCountChange={(count) => setRequests((current) => current.map((item) => item.id === selected.id ? { ...item, commentCount: count } : item))} />
      </article></Modal>}

      {cropSource && <div className="crop-backdrop"><section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title"><header><button onClick={() => setCropSource('')}>キャンセル</button><div><h2 id="crop-title">顔写真を調整</h2><p>指で動かして、顔が中央に来るようにします</p></div><button className="crop-confirm" onClick={confirmCrop} disabled={cropping || !croppedArea}>{cropping ? '処理中' : '決定'}</button></header><div className="crop-stage"><Cropper image={cropSource} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} minZoom={1} maxZoom={4} zoomSpeed={0.35} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setCroppedArea(pixels)} disableAutomaticStylesInjection /></div><div className="crop-controls"><label><span>顔の大きさ</span><input type="range" min="1" max="4" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="顔写真の拡大率" /><b>{Math.round(zoom * 100)}%</b></label><p>写真を指で動かせます。丸の中がプロフィール写真に表示されます。</p></div></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

/** 出稿する人に入れてもらう5つのうち、内容の4つ。期間はカレンダーで選ぶ。 */
function AdFields({ offer, draft, onChange, onImage, imageName, keepImage }: {
  offer: AdOffer; draft: AdDraft; onChange: (draft: AdDraft) => void;
  onImage: (event: ChangeEvent<HTMLInputElement>) => void; imageName: string; keepImage?: boolean;
}) {
  return <>
    <label><span>タイトル <small>{offer.titleMax}文字以内</small></span>
      <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} maxLength={offer.titleMax} required placeholder="例：内装工事の職人を募集しています" /></label>
    <label><span>説明文 <small>{offer.descriptionMax}文字以内</small></span>
      <input value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} maxLength={offer.descriptionMax} placeholder="例：都内の店舗改装。継続的にお取引いただける方を募集" /></label>
    <label><span>リンク先 <small>任意・広告を押したときに開くページ</small></span>
      <input value={draft.linkUrl} onChange={(event) => onChange({ ...draft, linkUrl: event.target.value })} maxLength={200} inputMode="url" placeholder="https://example.com" /></label>
    <label className="ad-file"><span>画像 <small>任意・横長（3:2）を推奨</small></span>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onImage} />
      {/* これは押すと写真を選ぶボタン。いま何が載っているかの説明ではなく、
          **押したら何が起きるか**を書く。「現在の画像を使用」だと、押しても
          何も変わらない札に見えてしまう。 */}
      <i>{imageName || (keepImage ? '画像を変更する' : '画像を選択')}</i>
      {keepImage && !imageName && <em className="ad-file-now">いまの画像のままにする場合は、そのまま保存してください</em>}</label>
  </>;
}

/**
 * プラン別にできることの表。
 *
 * **○×は `can()` から作る。** ここに手で書くと、線引きを直したときに
 * 表だけ古いまま残る。実際に止めている判断と同じものを見せることで、
 * 「表ではできると書いてあるのに使えない」を起こさない。
 *
 * 「探しごとの投稿」だけは○×では足りない（月1件と無制限の差）ので、
 * 件数を出す行にしてある。
 */
function PlanTable({ current }: { current: Plan }) {
  return <div className="plan-table-wrap">
    <table className="plan-table">
      <caption>プランでできること</caption>
      <thead>
        <tr>
          <th scope="col">できること</th>
          {plans.map((plan) => <th scope="col" key={plan} className={plan === current ? 'is-current' : ''}>
            {planCatalog[plan].name}{plan === current && <em>いま</em>}
          </th>)}
        </tr>
      </thead>
      <tbody>
        {planRows.map((row) => <tr key={row.label}>
          <th scope="row">
            <b>{row.label}{row.soon && <em className="plan-table-soon">準備中</em>}</b>
            {row.note && <small>{row.note}</small>}
          </th>
          {plans.map((plan) => {
            const value = row.value(plan);
            return <td key={plan} className={`${plan === current ? 'is-current' : ''}${value === false ? ' is-no' : ''}`}>
              {value === true ? <span aria-label="使えます">○</span>
                : value === false ? <span aria-label="使えません">×</span>
                : <em>{value}</em>}
            </td>;
          })}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

/** 表に出す行。○×は entitlements の `can()` に聞く（ここで判断を持たない）。 */
const planRows: { label: string; note?: string; soon?: boolean; value: (plan: Plan) => boolean | string }[] = [
  { label: '掲示板を見る', value: (plan) => allows(plan, 'view_board') },
  { label: '会員を探す', note: '業種・エリア・会場', soon: true, value: (plan) => allows(plan, 'member_search') },
  { label: 'リファラルを送る', note: '知り合いの紹介', value: (plan) => allows(plan, 'introduce') },
  { label: '探しごとでやり取り', note: 'コメント', value: (plan) => allows(plan, 'comment') },
  { label: '探しごとの投稿', value: (plan) => planPostLimit(plan) },
  { label: 'オファーを受け取る', note: '中身を読む・返事する', value: (plan) => allows(plan, 'receive_introductions') },
  { label: 'オファーを送る', note: '自社で請け負う', value: (plan) => allows(plan, 'self_offer') },
];

/** そのプラン単体で使えるか。期限や招待特典は絡めず、プランの素の力を見る。 */
function allows(plan: Plan, feature: Feature) {
  return can({ plan, planPeriodEnd: '' }, feature);
}

/** 入れた内容が、ホームでどう出るか。掲載と同じ部品で描くので、見えたままが載る。 */
function AdPreview({ draft, fallbackImage = '', by }: { draft: AdDraft; fallbackImage?: string; by: string }) {
  return <div className="ad-preview">
    <p>掲載イメージ</p>
    <AdBanner ad={{ title: draft.title, description: draft.description, imageUrl: draft.imagePreview || fallbackImage, by }} />
  </div>;
}

/**
 * 出し始める日を選ぶカレンダー。満枠の日は押せない。
 * 1ヶ月ずつ送る。何ヶ月ぶんも縦に並べると、どこを見ればいいのか分からなくなる。
 */
/**
 * どこに出るのかを、実際の画面の形で見せる小さな図。
 *
 * 文字で「画面上部」「一覧の上位」と言われても、どこのことか伝わらない。
 * スマホの画面を縮めた絵の中で、その枠だけを色付きで光らせる。
 */
/** 「9月3日」の形。空き状況の一行に添える。 */
function formatDay(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

function PlacementDemo({ placement }: { placement: string }) {
  const isBanner = placement === 'banner';
  return <span className="placement-demo" aria-hidden="true">
    <span className={`placement-demo-screen${isBanner ? ' is-banner' : ''}`}>
      {/* バナーは画面のいちばん上に出るので、その上には何も置かない。
          掲示板の上位は、見出しと絞り込みの下に出るので1本だけ残す。 */}
      {!isBanner && <b className="pd-header" />}
      {isBanner
        // バナーは縦長（4:5）。ホームを開いて最初に目に入る面。
        ? <>
            <b className="pd-banner is-here"><i>PR</i></b>
            <b className="pd-card" />
            <b className="pd-card" />
          </>
        // 掲示板の上位は、一覧のいちばん上の3本。上に何も挟まない。
        : <>
            {[0, 1, 2].map((index) => <b key={index} className="pd-card is-here"><i>PR</i></b>)}
            {[3, 4, 5, 6, 7].map((index) => <b key={index} className="pd-card" />)}
          </>}
      <b className="pd-nav" />
    </span>
  </span>;
}

function AdCalendar({ days, startDate, spanDays, onPick }: {
  days: AdCalendarDay[]; startDate: string; spanDays: number; onPick: (date: string) => void;
}) {
  const endDate = startDate ? shiftDate(startDate, spanDays - 1) : '';
  const months = useMemo(() => {
    const grouped = new Map<string, AdCalendarDay[]>();
    for (const day of days) {
      const key = day.date.slice(0, 7);
      grouped.set(key, [...(grouped.get(key) ?? []), day]);
    }
    return [...grouped.entries()];
  }, [days]);

  // 選んだ日のある月を開いておく。送ったあとは、その月のまま。
  const startIndex = Math.max(0, months.findIndex(([month]) => month === (startDate || '').slice(0, 7)));
  const [page, setPage] = useState(startIndex);
  const at = Math.min(page, months.length - 1);
  const [month, entries] = months[at] ?? ['', []];
  if (!entries.length) return null;

  return <div className="ad-calendar">
    <div className="ad-calendar-nav">
      <button type="button" onClick={() => setPage(at - 1)} disabled={at === 0} aria-label="前の月">‹</button>
      <b>{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</b>
      <button type="button" onClick={() => setPage(at + 1)} disabled={at >= months.length - 1} aria-label="次の月">›</button>
    </div>
    <div className="ad-calendar-week" aria-hidden="true">{weekdayNames.map((name) => <span key={name}>{name}</span>)}</div>
    <div className="ad-calendar-grid">
      {Array.from({ length: weekdayOf(entries[0].date) }, (_, index) => <span key={`pad-${index}`} />)}
      {entries.map((day) => {
        const inPeriod = Boolean(startDate) && day.date >= startDate && day.date <= endDate;
        const full = day.remaining <= 0;
        return <button key={day.date} type="button" disabled={full}
          className={`${day.date === startDate ? 'start ' : ''}${inPeriod ? 'in ' : ''}${full ? 'full' : ''}`.trim()}
          aria-label={`${Number(day.date.slice(5, 7))}月${Number(day.date.slice(8))}日${full ? '・満枠' : `・残り${day.remaining}枠`}`}
          onClick={() => onPick(day.date)}>
          <b>{Number(day.date.slice(8))}</b>
          <i>{full ? '満枠' : day.remaining <= 3 ? `残${day.remaining}` : ''}</i>
        </button>;
      })}
    </div>
    <p className="ad-calendar-legend"><span className="is-start" />掲載開始日<span className="is-in" />掲載期間<span className="is-full" />満枠</p>
  </div>;
}

/* 下のメニューの4つは、同じ 24 の枠・同じ線の太さで描く。
   もとの「ホーム」と「探す」は ⌂ ⌕ という**文字**だった。文字は書体まかせで
   大きさも太さも決まるので、SVGで描いた他の2つと揃わなかった。 */
function HomeIcon() {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M3.2 11 12 3.6 20.8 11" />
    <path d="M5.6 9.8V20.4h12.8V9.8" />
    <path d="M9.8 20.4v-5.4h4.4v5.4" />
  </svg>;
}

function SearchIcon() {
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <circle cx="10.6" cy="10.6" r="6.9" />
    <path d="m15.7 15.7 4.9 4.9" />
  </svg>;
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

/**
 * 業種を選ぶところ。上段は**大分類の切り替え**で、選択そのものではない。
 *
 * もとは上段にも下段（実際の選択）にも同じ青い塗りを使っていたため、
 * 「6個まで」と書いてあるのに1つしか選べない、と読めてしまっていた。
 * 上段は「いま開いている」だけの見た目にして、選んだ数を各大分類の肩に出す。
 * どこに何個入っているかが、開かなくても分かる。
 */
function IndustryPicker({ legend, note, description, selected, activeGroup, onGroupChange, onToggle, className = '' }: {
  legend: string; note: string; description?: string; selected: string[];
  activeGroup: string; onGroupChange: (value: string) => void; onToggle: (value: string) => void; className?: string;
}) {
  const active = industryGroups.find((group) => group.name === activeGroup) ?? industryGroups[0];
  const countIn = (group: typeof industryGroups[number]) => group.children.filter((child) => selected.includes(child)).length;

  return <fieldset className={`tag-field hierarchical-industry-picker ${className}`}>
    <legend>{legend} <small>{note}</small></legend>
    {description && <p>{description}</p>}

    {/* 切り替えであることが分かるように、タブとして読ませる */}
    <div className="industry-major-picker" role="tablist" aria-label="業種の大分類を切り替える">
      {industryGroups.map((group) => {
        const count = countIn(group);
        return <button type="button" key={group.name} role="tab"
          aria-selected={active.name === group.name}
          className={active.name === group.name ? 'open' : ''}
          onClick={() => onGroupChange(group.name)}>
          {group.name}{count > 0 && <em>{count}</em>}
        </button>;
      })}
    </div>

    <div className="industry-detail-panel">
      <h4><span>大分類</span>{active.name}<small>この中から選びます{selected.length > 0 && `（選択中 ${selected.length}）`}</small></h4>
      <div className="tag-picker">{active.children.map((industry) => <button type="button" key={industry}
        className={selected.includes(industry) ? 'selected' : ''}
        onClick={() => onToggle(industry)}>{industry}</button>)}</div>
    </div>

    {selected.length > 0 && <div className="selected-industry-list">
      <b>選択中</b>
      {selected.map((industry) => <button type="button" key={industry} onClick={() => onToggle(industry)}>{industry}<span>×</span></button>)}
    </div>}
  </fieldset>;
}

function HomeRequestCard({ need, favorite, onOpen, onFavorite }: { need: BoardRequest; favorite: boolean; onOpen: () => void; onFavorite: () => void }) {
  const primaryIndustry = need.industryTags[0] || 'その他';
  const primaryGroup = getIndustryGroup(primaryIndustry)?.name ?? 'その他';
  return <article className="home-request-card"><button className={favorite ? 'home-heart active' : 'home-heart'} aria-label={favorite ? 'お気に入りから外す' : 'お気に入りに保存'} onClick={onFavorite}>♥</button><button className="home-request-open" onClick={onOpen}>
    <span className={need.thumbUrl ? 'home-request-cover has-photo' : 'home-request-cover'}>{need.thumbUrl
      ? <img src={need.thumbUrl} alt="" loading="lazy" decoding="async" />
      : <><IndustryIcon group={primaryGroup} /><small>{primaryIndustry}</small></>}</span>
    <span className="home-request-copy"><small><b className={`kind ${categories[need.category].className}`}>{categories[need.category].label}</b> あと{daysLeft(need.deadline)}日</small><strong>{need.title}</strong><span>{budgetText(need)}</span><em>{need.authorName}・{need.authorVenue}</em></span>
  </button></article>;
}

function Modal({ title, lead, onClose, children }: { title: string; lead: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-top"><span className="sheet-handle" /><button className="modal-close" onClick={onClose} aria-label="閉じる">×</button></div><h2 id="modal-title">{title}</h2><p className="modal-lead">{lead}</p>{children}</section></div>; }
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
