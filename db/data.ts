import { env } from 'cloudflare:workers';
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import type { SessionUser } from '@/app/session-user';
import { cleanFacebookUrl } from '@/app/social-links';
import { FEEDBACK_PER_DAY, type FeedbackCategory } from '@/app/feedback-options';
import { AD_DESCRIPTION_MAX, AD_RESERVATION_MINUTES, AD_TITLE_MAX, DEFAULT_PLACEMENT, placementSlots } from '@/app/ad-options';
import { UNLIMITED, bonusPlan, contractedPlan, currentPlan, extendedPlanEnd, hasPaidContract, isPaid, limits, remainingRequests, toBillingCycle, toPlan, type BillingCycle, type Plan, type PlanState } from '@/app/entitlements';
import { EXTEND_DAYS, canExtendRequest, canPostVideo, descriptionLimit, levelFor, notifyIndustryLimit, photoLimit, rankName, rankThresholds } from '@/app/rank-perks';
import { matchesIndustry } from '@/app/industry-options';

export type BoardRequest = {
  id: string;
  /** 一覧に出す小さい画像。無ければ空。業種アイコンを出す。 */
  thumbUrl: string;
  /** 詳細で出す大きい画像。無ければ空。 */
  imageUrl: string;
  /** 2枚目以降を含めた、詳細用の画像すべて。1枚だけなら imageUrl と同じ1件。 */
  imageUrls: string[];
  /** 付いている動画。無ければ空。1本まで。 */
  videoUrl: string;
  category: 'project' | 'collaboration' | 'consultation';
  title: string;
  description: string;
  budgetLabel: string;
  area: string;
  industryTags: string[];
  deadline: string;
  status: string;
  createdAt: string;
  /** 自分がこの探しごとへ出した紹介の数。中身は出さない（本人と投稿者だけのもの）。 */
  myIntroCount: number;
  /** 注目ピンでいちばん上に出している期限。空なら普通の並び。 */
  pinnedUntil: string;
  /** 募集を延長した日時。1件につき1回まで。空ならまだ使っていない。 */
  extendedAt: string;
  /** 業種別プロモーションで、この業種の一覧では先頭に出す。 */
  promoIndustry: string;
  promoUntil: string;
  /** 自分の投稿かどうか。延長やピンのボタンを出すかの判断に使う。 */
  mine: boolean;
  authorName: string;
  authorCompany: string;
  authorVenue: string;
  authorPositionTitle: string;
  authorBusinessArea: string;
  authorRevenueBand: string;
  authorAvatarUrl: string;
  authorFacebookUrl: string;
  introCount: number;
  commentCount: number;
};

export type MemberStats = {
  displayName: string;
  /** お名前のふりがな。会員が自分で入れる。 */
  nameKana: string;
  venue: string;
  company: string;
  /** 会社名のふりがな。 */
  companyKana: string;
  positionTitle: string;
  businessArea: string;
  primaryIndustry: string;
  notifyIndustries: string[];
  annualRevenueBand: string;
  facebookUrl: string;
  avatarUrl: string;
  introCount: number;
  receivedIntroCount: number;
  dealCount: number;
  points: number;
  rank: string;
  level: number;
  nextRankAt: number;
  plan: Plan;
  paid: boolean;
  /** 契約しているプラン。招待特典が切れたらここへ戻る。 */
  contractedPlan: Plan;
  /** 招待特典で開いているプラン。無ければ free。 */
  bonusPlan: Plan;
  bonusPeriodEnd: string;
  planPeriodEnd: string;
  requestsThisMonth: number;
  requestLimit: number;
};

export type ReceivedIntroduction = {
  id: string;
  requestId: string;
  requestTitle: string;
  requestCategory: 'project' | 'collaboration' | 'consultation';
  personName: string;
  personCompany: string;
  relationship: string;
  fitReason: string;
  status: string;
  createdAt: string;
  introducerName: string;
  introducerCompany: string;
  introducerVenue: string;
  introducerAvatarUrl: string;
  introducerFacebookUrl: string;
};

export type IntroductionMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderName: string;
  senderAvatarUrl: string;
  /** 自分が書いたものか。吹き出しを左右に分けるのに使う。 */
  mine: boolean;
};

/** 自分が出した紹介。相手（投稿者）とやり取りするために返す。 */
export type SentIntroduction = {
  id: string;
  requestId: string;
  requestTitle: string;
  requestCategory: 'project' | 'collaboration' | 'consultation';
  personName: string;
  personCompany: string;
  relationship: string;
  fitReason: string;
  createdAt: string;
  authorName: string;
  authorCompany: string;
  authorVenue: string;
  authorAvatarUrl: string;
  authorFacebookUrl: string;
  messageCount: number;
};

export type AttendancePerson = {
  id: string;
  eventId: string;
  personName: string;
  company: string;
  note: string;
  isImportant: boolean;
  meetingDate: string;
  meetingName: string;
  venue: string;
};

export type AttendanceEvent = {
  id: string;
  meetingDate: string;
  meetingName: string;
  venue: string;
  createdAt: string;
  people: AttendancePerson[];
};

export type MembershipStatus = 'invited' | 'active' | 'past_due' | 'canceled';
export type MembershipAccess = {
  status: MembershipStatus;
  source: 'direct_contract' | 'organization_contract';
  currentPeriodEnd: string;
  organizationId: string;
  canUseApp: boolean;
};

const statements = [
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    name_kana TEXT NOT NULL DEFAULT '',
    venue TEXT NOT NULL DEFAULT 'ひるのめぐろ会場',
    company TEXT NOT NULL DEFAULT '',
    company_kana TEXT NOT NULL DEFAULT '',
    position_title TEXT NOT NULL DEFAULT '',
    -- バッヂは廃止。列は残す（消すと既存のDBと食い違い、起動が壊れる）。誰も読み書きしない。
    badge TEXT NOT NULL DEFAULT '',
    business_area TEXT NOT NULL DEFAULT '',
    primary_industry TEXT NOT NULL DEFAULT '',
    notify_industries TEXT NOT NULL DEFAULT '[]',
    annual_revenue_band TEXT NOT NULL DEFAULT '',
    membership_status TEXT NOT NULL DEFAULT 'active',
    membership_source TEXT NOT NULL DEFAULT 'direct_contract',
    membership_period_end TEXT NOT NULL DEFAULT '',
    organization_id TEXT NOT NULL DEFAULT '',
    avatar_key TEXT NOT NULL DEFAULT '',
    avatar_version INTEGER NOT NULL DEFAULT 0,
    intro_count INTEGER NOT NULL DEFAULT 0,
    deal_count INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    invite_code TEXT NOT NULL DEFAULT '',
    invited_by TEXT NOT NULL DEFAULT '',
    activated_at TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_period_end TEXT NOT NULL DEFAULT '',
    plan_source TEXT NOT NULL DEFAULT '',
    facebook_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS request_comments (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES requests(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS referral_credits (
    id TEXT PRIMARY KEY,
    inviter_id TEXT NOT NULL REFERENCES members(id),
    invitee_id TEXT NOT NULL UNIQUE REFERENCES members(id),
    status TEXT NOT NULL DEFAULT 'earned',
    earned_at TEXT NOT NULL,
    applied_month TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES members(id),
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    budget_label TEXT NOT NULL,
    area TEXT NOT NULL,
    industry_tags TEXT NOT NULL DEFAULT '[]',
    deadline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    image_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ad_slots (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    month TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    link_url TEXT NOT NULL DEFAULT '',
    image_version INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'reserved',
    stripe_session_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ad_daily (
    ad_id TEXT NOT NULL REFERENCES ad_slots(id),
    date TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (ad_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    category TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS introductions (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES requests(id),
    introducer_id TEXT NOT NULL REFERENCES members(id),
    person_name TEXT NOT NULL,
    person_company TEXT NOT NULL,
    relationship TEXT NOT NULL,
    fit_reason TEXT NOT NULL,
    consent_confirmed INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    points_awarded INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL
  )`,
  // 紹介1件ごとの、投稿者と紹介者だけのやり取り。
  // 探しごとのコメント欄（request_comments）は会員みんなが読めるが、
  // こちらは**2人しか読めない**。紹介の中身は他の会員に見せないため。
  `CREATE TABLE IF NOT EXISTS introduction_messages (
    id TEXT PRIMARY KEY,
    introduction_id TEXT NOT NULL REFERENCES introductions(id),
    sender_id TEXT NOT NULL REFERENCES members(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_auth_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_sessions (
    token_hash TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_push_tokens (
    token TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_events (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES members(id),
    meeting_date TEXT NOT NULL,
    meeting_name TEXT NOT NULL,
    venue TEXT NOT NULL,
    ocr_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_people (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES attendance_events(id),
    owner_id TEXT NOT NULL REFERENCES members(id),
    person_name TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    is_important INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_ad_slots_member ON ad_slots(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_requests_status_created_at ON requests(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category)',
  'CREATE INDEX IF NOT EXISTS idx_introductions_introducer_id ON introductions(introducer_id)',
  'CREATE INDEX IF NOT EXISTS idx_introductions_request_id ON introductions(request_id)',
  'CREATE INDEX IF NOT EXISTS idx_introduction_messages_introduction_id ON introduction_messages(introduction_id)',
  'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member_id ON push_subscriptions(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_mobile_sessions_member_id ON mobile_sessions(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_mobile_sessions_expires_at ON mobile_sessions(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_member_id ON mobile_push_tokens(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_events_owner_date ON attendance_events(owner_id, meeting_date)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_people_event_id ON attendance_people(event_id)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_people_owner_important ON attendance_people(owner_id, is_important)',
];

let initialized = false;

export async function ensureDatabase() {
  if (initialized) return;
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  const memberColumns = await env.DB.prepare('PRAGMA table_info(members)').all<{ name: string }>();
  const existingColumns = new Set(memberColumns.results.map((column) => column.name));
  const missingColumns = [
    ['name_kana', "ALTER TABLE members ADD COLUMN name_kana TEXT NOT NULL DEFAULT ''"],
    ['company_kana', "ALTER TABLE members ADD COLUMN company_kana TEXT NOT NULL DEFAULT ''"],
    ['position_title', "ALTER TABLE members ADD COLUMN position_title TEXT NOT NULL DEFAULT ''"],
    ['badge', "ALTER TABLE members ADD COLUMN badge TEXT NOT NULL DEFAULT ''"],
    ['business_area', "ALTER TABLE members ADD COLUMN business_area TEXT NOT NULL DEFAULT ''"],
    ['primary_industry', "ALTER TABLE members ADD COLUMN primary_industry TEXT NOT NULL DEFAULT ''"],
    ['notify_industries', "ALTER TABLE members ADD COLUMN notify_industries TEXT NOT NULL DEFAULT '[]'"],
    ['annual_revenue_band', "ALTER TABLE members ADD COLUMN annual_revenue_band TEXT NOT NULL DEFAULT ''"],
    ['membership_status', "ALTER TABLE members ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'invited'"],
    ['membership_source', "ALTER TABLE members ADD COLUMN membership_source TEXT NOT NULL DEFAULT 'direct_contract'"],
    ['membership_period_end', "ALTER TABLE members ADD COLUMN membership_period_end TEXT NOT NULL DEFAULT ''"],
    ['organization_id', "ALTER TABLE members ADD COLUMN organization_id TEXT NOT NULL DEFAULT ''"],
    ['avatar_key', "ALTER TABLE members ADD COLUMN avatar_key TEXT NOT NULL DEFAULT ''"],
    ['avatar_version', 'ALTER TABLE members ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0'],
    ['invite_code', "ALTER TABLE members ADD COLUMN invite_code TEXT NOT NULL DEFAULT ''"],
    ['invited_by', "ALTER TABLE members ADD COLUMN invited_by TEXT NOT NULL DEFAULT ''"],
    ['activated_at', "ALTER TABLE members ADD COLUMN activated_at TEXT NOT NULL DEFAULT ''"],
    ['plan', "ALTER TABLE members ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'"],
    ['plan_period_end', "ALTER TABLE members ADD COLUMN plan_period_end TEXT NOT NULL DEFAULT ''"],
    ['plan_source', "ALTER TABLE members ADD COLUMN plan_source TEXT NOT NULL DEFAULT ''"],
    ['facebook_url', "ALTER TABLE members ADD COLUMN facebook_url TEXT NOT NULL DEFAULT ''"],
    ['stripe_customer_id', "ALTER TABLE members ADD COLUMN stripe_customer_id TEXT NOT NULL DEFAULT ''"],
    ['stripe_subscription_id', "ALTER TABLE members ADD COLUMN stripe_subscription_id TEXT NOT NULL DEFAULT ''"],
    ['plan_interval', "ALTER TABLE members ADD COLUMN plan_interval TEXT NOT NULL DEFAULT 'month'"],
    ['bonus_plan', "ALTER TABLE members ADD COLUMN bonus_plan TEXT NOT NULL DEFAULT 'free'"],
    ['bonus_period_end', "ALTER TABLE members ADD COLUMN bonus_period_end TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [columnName, sql] of missingColumns) {
    if (!existingColumns.has(columnName)) await env.DB.prepare(sql).run();
  }
  const requestColumns = await env.DB.prepare('PRAGMA table_info(requests)').all<{ name: string }>();
  const requestColumnNames = new Set(requestColumns.results.map((column) => column.name));
  if (!requestColumnNames.has('industry_tags')) {
    await env.DB.prepare("ALTER TABLE requests ADD COLUMN industry_tags TEXT NOT NULL DEFAULT '[]'").run();
  }
  if (!requestColumnNames.has('image_version')) {
    await env.DB.prepare('ALTER TABLE requests ADD COLUMN image_version INTEGER NOT NULL DEFAULT 0').run();
  }
  for (const [columnName, sql] of [
    // 注目ピン。この日時までは一覧のいちばん上に出す。
    ['pinned_until', "ALTER TABLE requests ADD COLUMN pinned_until TEXT NOT NULL DEFAULT ''"],
    // 募集の延長は1件につき1回まで。使ったかどうかを持つ。
    ['extended_at', "ALTER TABLE requests ADD COLUMN extended_at TEXT NOT NULL DEFAULT ''"],
    // 写真の枚数。0なら写真なし、1以上ならその枚数だけR2に置いてある。
    ['image_count', 'ALTER TABLE requests ADD COLUMN image_count INTEGER NOT NULL DEFAULT 0'],
    // 動画は1本まで。版番号は写真と同じ考え方（0なら無し）。
    ['video_version', 'ALTER TABLE requests ADD COLUMN video_version INTEGER NOT NULL DEFAULT 0'],
    ['video_type', "ALTER TABLE requests ADD COLUMN video_type TEXT NOT NULL DEFAULT ''"],
    // 業種別プロモーション。この業種の一覧で、この日時まで先頭に出す。
    ['promo_industry', "ALTER TABLE requests ADD COLUMN promo_industry TEXT NOT NULL DEFAULT ''"],
    ['promo_until', "ALTER TABLE requests ADD COLUMN promo_until TEXT NOT NULL DEFAULT ''"],
  ] as const) {
    if (!requestColumnNames.has(columnName)) await env.DB.prepare(sql).run();
  }
  const adColumns = await env.DB.prepare('PRAGMA table_info(ad_slots)').all<{ name: string }>();
  const adColumnNames = new Set(adColumns.results.map((column) => column.name));
  for (const [columnName, sql] of [
    ['view_count', 'ALTER TABLE ad_slots ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0'],
    ['click_count', 'ALTER TABLE ad_slots ADD COLUMN click_count INTEGER NOT NULL DEFAULT 0'],
    // 掲載は月単位をやめ、開始日と終了日で持つようにした。
    ['start_date', "ALTER TABLE ad_slots ADD COLUMN start_date TEXT NOT NULL DEFAULT ''"],
    ['end_date', "ALTER TABLE ad_slots ADD COLUMN end_date TEXT NOT NULL DEFAULT ''"],
    // 説明文。バナーはタイトルと説明文から組み立てるようにした。
    ['description', "ALTER TABLE ad_slots ADD COLUMN description TEXT NOT NULL DEFAULT ''"],
    // 出す場所。バナーと困りごとの上位で、空きの数え方を分ける。
    // 既存の枠はすべてバナーとして扱う（既定値がそうなる）。
    ['placement', "ALTER TABLE ad_slots ADD COLUMN placement TEXT NOT NULL DEFAULT 'banner'"],
    // 掲示板の上位に出すとき、どの大分類の一覧に出すか。空なら全業種の先頭。
    ['industry', "ALTER TABLE ad_slots ADD COLUMN industry TEXT NOT NULL DEFAULT ''"],
    // 実際に請求した税込額。あとから日数×単価で計算し直すと、ランク割引の
    // かかり方が分からず実際とずれる。押さえた時点の額をそのまま残す。
    ['amount_yen', 'ALTER TABLE ad_slots ADD COLUMN amount_yen INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    if (!adColumnNames.has(columnName)) await env.DB.prepare(sql).run();
  }
  // 月で持っていた枠を、その月の初日〜末日に移す。1回だけ効く。
  await env.DB.prepare(`UPDATE ad_slots SET start_date = month || '-01',
      end_date = date(month || '-01', '+1 month', '-1 day')
    WHERE start_date = '' AND month <> ''`).run();
  // 索引は列ができたあとに作る。statements に混ぜると、列が無い初回に全部こける。
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ad_slots_period ON ad_slots(placement, status, start_date, end_date)').run();
  // 写真を1枚だけ持っていた投稿を、枚数1として数え直す。1回だけ効く。
  await env.DB.prepare('UPDATE requests SET image_count = 1 WHERE image_count = 0 AND image_version > 0').run();
  await env.DB.prepare("UPDATE referral_credits SET status = 'waiting', earned_at = '' WHERE status = 'capped'").run();
  // 招待特典は契約プランと別の列に持つようにした。前の置き場から移す。
  await env.DB.prepare(`UPDATE members SET bonus_plan = plan, bonus_period_end = plan_period_end,
      plan = 'free', plan_period_end = '', plan_source = ''
    WHERE plan_source = 'referral'`).run();
  // 登録した人はその場で使えるようにしたので、承認待ちで止まっていた人を通す。
  // 以後 'invited' は作られない。利用を止めるときは 'suspended' を使うこと。
  await env.DB.prepare(`UPDATE members SET membership_status = 'active',
      activated_at = CASE WHEN activated_at = '' THEN created_at ELSE activated_at END
    WHERE membership_status = 'invited'`).run();
  await env.DB.prepare("UPDATE members SET plan = 'premium' WHERE plan = 'pro'").run();
  await seedDemoData();
  initialized = true;
}

export async function requestMobileAuthCode(rawEmail: string) {
  await ensureDatabase();
  const email = normalizeAuthEmail(rawEmail);
  if (!email) throw new Error('正しいメールアドレスを入力してください。');

  const membership = await env.DB.prepare(`SELECT membership_status AS status,
    membership_period_end AS currentPeriodEnd FROM members WHERE email = ?`)
    .bind(email).first<{ status: MembershipStatus; currentPeriodEnd: string }>();
  if (!membership) {
    throw new Error('登録済みの会員メールアドレスを入力してください。');
  }
  if (!canUseMembership(membership.status, membership.currentPeriodEnd)) {
    throw new Error('このメールアドレスには現在利用権限がありません。運営窓口へお問い合わせください。');
  }

  const existing = await env.DB.prepare('SELECT requested_at AS requestedAt FROM mobile_auth_codes WHERE email = ?')
    .bind(email).first<{ requestedAt: string }>();
  if (existing && Date.now() - new Date(existing.requestedAt).getTime() < 60_000) {
    throw new Error('認証コードは1分後に再送できます。');
  }

  const reviewCode = configuredReviewCode(email);
  const code = reviewCode || String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const codeHash = await hashMobileSecret(`${email}:${code}`);
  await env.DB.prepare(`INSERT INTO mobile_auth_codes (email, code_hash, expires_at, requested_at, attempts)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      requested_at = excluded.requested_at, attempts = 0`)
    .bind(email, codeHash, expiresAt, now.toISOString()).run();

  if (reviewCode) return;

  if (!env.RESEND_API_KEY || !env.AUTH_FROM_EMAIL) {
    await env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(email).run();
    throw new Error('メール認証の送信設定が未完了です。');
  }
  const delivery = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.AUTH_FROM_EMAIL,
      to: [email],
      subject: '会員アプリ ログイン認証コード',
      html: `<div style="font-family:Arial,sans-serif;color:#15213a"><h2>ログイン認証コード</h2><p>アプリに次の6桁を入力してください。</p><p style="font-size:34px;font-weight:800;letter-spacing:8px;color:#2563eb">${code}</p><p>有効期限は10分です。心当たりがない場合はこのメールを破棄してください。</p></div>`,
    }),
  });
  if (!delivery.ok) {
    await env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(email).run();
    throw new Error('認証メールを送信できませんでした。');
  }
}

export async function verifyMobileAuthCode(rawEmail: string, rawCode: string) {
  await ensureDatabase();
  const email = normalizeAuthEmail(rawEmail);
  const code = rawCode.trim();
  if (!email || !/^\d{6}$/.test(code)) throw new Error('メールアドレスと6桁のコードを確認してください。');
  const row = await env.DB.prepare(`SELECT code_hash AS codeHash, expires_at AS expiresAt, attempts
    FROM mobile_auth_codes WHERE email = ?`).bind(email).first<{ codeHash: string; expiresAt: string; attempts: number }>();
  if (!row || new Date(row.expiresAt).getTime() < Date.now() || row.attempts >= 5) {
    await env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(email).run();
    throw new Error('認証コードの有効期限が切れています。再送してください。');
  }
  const codeHash = await hashMobileSecret(`${email}:${code}`);
  if (!safeHashEqual(codeHash, row.codeHash)) {
    await env.DB.prepare('UPDATE mobile_auth_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
    throw new Error('認証コードが違います。');
  }

  const member = await env.DB.prepare(`SELECT id, display_name AS displayName,
    membership_status AS membershipStatus, membership_period_end AS membershipPeriodEnd
    FROM members WHERE email = ?`)
    .bind(email).first<{ id: string; displayName: string; membershipStatus: MembershipStatus; membershipPeriodEnd: string }>();
  if (!member) {
    await env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(email).run();
    throw new Error('登録済みの会員メールアドレスを入力してください。');
  }
  if (!canUseMembership(member.membershipStatus, member.membershipPeriodEnd)) {
    await env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(email).run();
    throw new Error('このメールアドレスには現在利用権限がありません。運営窓口へお問い合わせください。');
  }

  const token = randomMobileToken();
  const tokenHash = await hashMobileSecret(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(email),
    env.DB.prepare('DELETE FROM mobile_sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare(`INSERT INTO mobile_sessions (token_hash, member_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)`).bind(tokenHash, member.id, expiresAt, now, now),
  ]);
  return { token, expiresAt, user: { userId: member.id, email, displayName: member.displayName, fullName: member.displayName } satisfies SessionUser };
}

export async function startMemberSessionByEmail(rawEmail: string) {
  await ensureDatabase();
  const email = normalizeAuthEmail(rawEmail);
  if (!email) throw new Error('メールアドレスを確認できませんでした。');

  const member = await env.DB.prepare(`SELECT id, display_name AS displayName,
    membership_status AS membershipStatus, membership_period_end AS membershipPeriodEnd
    FROM members WHERE email = ?`)
    .bind(email).first<{ id: string; displayName: string; membershipStatus: MembershipStatus; membershipPeriodEnd: string }>();
  if (!member) throw new Error('登録済みの会員メールアドレスでログインしてください。');
  if (!canUseMembership(member.membershipStatus, member.membershipPeriodEnd)) {
    throw new Error('このアカウントには現在利用権限がありません。運営窓口へお問い合わせください。');
  }

  const token = randomMobileToken();
  const tokenHash = await hashMobileSecret(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mobile_sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare(`INSERT INTO mobile_sessions (token_hash, member_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)`).bind(tokenHash, member.id, expiresAt, now, now),
  ]);
  return { token, expiresAt, user: { userId: member.id, email, displayName: member.displayName, fullName: member.displayName } satisfies SessionUser };
}

/**
 * 手元で動かすときのログイン。**呼び出し側（/api/dev/signin）が
 * import.meta.env.DEV で閉じているので、本番のビルドには入らない。**
 *
 * もとはChatGPT Sitesのプラグインが `seedy@sites.test` として入れてくれていた。
 * Sitesから切り離したので、同じ会員を自前で用意する。IDを変えると手元のD1に
 * 溜めた投稿や紹介の実績が迷子になるため、`local_seedy` のまま引き継ぐ。
 */
export async function startLocalDevSession(asMemberId = '') {
  await ensureDatabase();
  const now = new Date().toISOString();
  // 手元で「別の会員として」動きを見たいときのため。紹介のやり取りのように
  // 2人いないと確かめられない画面があるので、既にいる会員に成り代われる。
  // **開発サーバー専用**（呼び出し側が import.meta.env.DEV とlocalhostで閉じている）。
  if (asMemberId) {
    const other = await env.DB.prepare('SELECT id FROM members WHERE id = ?').bind(asMemberId).first<{ id: string }>();
    if (!other) throw new Error('その会員はいません。');
    return startSessionFor(other.id, now);
  }
  const id = 'local_seedy';
  const email = 'seedy@sites.test';
  await env.DB.prepare(`INSERT INTO members (id, email, display_name, membership_status, activated_at, created_at)
    VALUES (?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET membership_status = 'active'`).bind(id, email, 'Seedy', now, now).run();

  return startSessionFor(id, now);
}

async function startSessionFor(memberId: string, now: string) {
  const token = randomMobileToken();
  const tokenHash = await hashMobileSecret(token);
  const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mobile_sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare(`INSERT INTO mobile_sessions (token_hash, member_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)`).bind(tokenHash, memberId, expiresAt, now, now),
  ]);
  return { token, expiresAt };
}

export async function getMobileSessionAccess(token: string): Promise<{ user: SessionUser; membership: MembershipAccess } | null> {
  await ensureDatabase();
  if (token.length < 32 || token.length > 256) return null;
  const tokenHash = await hashMobileSecret(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`SELECT m.id AS userId, m.email, m.display_name AS displayName,
    m.membership_status AS membershipStatus, m.membership_source AS membershipSource,
    m.membership_period_end AS membershipPeriodEnd, m.organization_id AS organizationId,
    s.expires_at AS expiresAt FROM mobile_sessions s JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(tokenHash, now)
    .first<{ userId: string; email: string; displayName: string; membershipStatus: MembershipStatus; membershipSource: string; membershipPeriodEnd: string; organizationId: string; expiresAt: string }>();
  if (!row) return null;
  await env.DB.prepare('UPDATE mobile_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  const status = normalizeMembershipStatus(row.membershipStatus);
  return {
    user: { userId: row.userId, email: row.email, displayName: row.displayName, fullName: row.displayName },
    membership: {
      status,
      source: row.membershipSource === 'organization_contract' ? 'organization_contract' : 'direct_contract',
      currentPeriodEnd: row.membershipPeriodEnd,
      organizationId: row.organizationId,
      canUseApp: canUseMembership(status, row.membershipPeriodEnd),
    },
  };
}


export async function revokeMobileSession(token: string) {
  await ensureDatabase();
  if (token.length < 32 || token.length > 256) return;
  await env.DB.prepare('DELETE FROM mobile_sessions WHERE token_hash = ?').bind(await hashMobileSecret(token)).run();
}

export async function getMembershipAccess(userId: string): Promise<MembershipAccess> {
  await ensureDatabase();
  const row = await env.DB.prepare(`SELECT membership_status AS status, membership_source AS source,
    membership_period_end AS currentPeriodEnd, organization_id AS organizationId
    FROM members WHERE id = ?`).bind(userId).first<Omit<MembershipAccess, 'canUseApp'>>();
  const status = normalizeMembershipStatus(row?.status);
  const currentPeriodEnd = row?.currentPeriodEnd ?? '';
  return {
    status,
    source: row?.source === 'organization_contract' ? 'organization_contract' : 'direct_contract',
    currentPeriodEnd,
    organizationId: row?.organizationId ?? '',
    canUseApp: canUseMembership(status, currentPeriodEnd),
  };
}

export async function saveMobilePushToken(user: SessionUser, token: string, platform: string) {
  await upsertMember(user);
  if (!/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(token) && !/^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token)) {
    throw new Error('通知端末を登録できませんでした。');
  }
  const safePlatform = platform === 'ios' || platform === 'android' ? platform : 'unknown';
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO mobile_push_tokens (token, member_id, platform, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET member_id = excluded.member_id, platform = excluded.platform,
      updated_at = excluded.updated_at`)
    .bind(token, user.userId, safePlatform, now, now).run();
}

export async function deleteMobilePushToken(user: SessionUser, token: string) {
  await ensureDatabase();
  await env.DB.prepare('DELETE FROM mobile_push_tokens WHERE token = ? AND member_id = ?')
    .bind(token, user.userId).run();
}

export async function deleteMobileAccount(user: SessionUser) {
  await ensureDatabase();
  const member = await env.DB.prepare('SELECT avatar_key AS avatarKey FROM members WHERE id = ?')
    .bind(user.userId).first<{ avatarKey: string }>();
  if (!member) return;
  const eventIds = await env.DB.prepare('SELECT id FROM attendance_events WHERE owner_id = ?')
    .bind(user.userId).all<{ id: string }>();
  const requestIds = await env.DB.prepare('SELECT id FROM requests WHERE author_id = ?')
    .bind(user.userId).all<{ id: string }>();
  const adIds = await env.DB.prepare('SELECT id FROM ad_slots WHERE member_id = ?')
    .bind(user.userId).all<{ id: string }>();
  const statementsToDelete = [
    // 紹介のやり取りは、紹介より先に消す（外部キーで止まるため）。
    // 自分が出した紹介ぶんと、自分の探しごとに届いた紹介ぶんの両方。
    env.DB.prepare('DELETE FROM introduction_messages WHERE sender_id = ?').bind(user.userId),
    ...requestIds.results.map(({ id }) => env.DB.prepare('DELETE FROM introduction_messages WHERE introduction_id IN (SELECT id FROM introductions WHERE request_id = ?)').bind(id)),
    env.DB.prepare('DELETE FROM introduction_messages WHERE introduction_id IN (SELECT id FROM introductions WHERE introducer_id = ?)').bind(user.userId),
    ...requestIds.results.map(({ id }) => env.DB.prepare('DELETE FROM introductions WHERE request_id = ?').bind(id)),
    ...eventIds.results.map(({ id }) => env.DB.prepare('DELETE FROM attendance_people WHERE event_id = ?').bind(id)),
    env.DB.prepare('DELETE FROM introductions WHERE introducer_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM push_subscriptions WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM mobile_push_tokens WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM mobile_sessions WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM attendance_people WHERE owner_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM attendance_events WHERE owner_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM request_comments WHERE author_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM requests WHERE author_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM ad_slots WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM feedback WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(user.email.toLowerCase()),
    env.DB.prepare('DELETE FROM members WHERE id = ?').bind(user.userId),
  ];
  await env.DB.batch(statementsToDelete);
  // R2に置いた画像も消す。探しごとの写真は一覧用と詳細用の2つある。
  const objectKeys = [
    member.avatarKey,
    ...requestIds.results.flatMap(({ id }) => [`request-thumbs/${id}`, `request-images/${id}`]),
    ...adIds.results.map(({ id }) => `ad-images/${id}`),
  ].filter(Boolean);
  await Promise.allSettled(objectKeys.map((key) => env.AVATARS.delete(key)));
}

function normalizeAuthEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

function configuredReviewCode(email: string) {
  const reviewEmail = normalizeAuthEmail(String(env.REVIEW_AUTH_EMAIL || ''));
  const reviewCode = String(env.REVIEW_AUTH_CODE || '').trim();
  return email === reviewEmail && /^\d{6}$/.test(reviewCode) ? reviewCode : '';
}

function normalizeMembershipStatus(value: unknown): MembershipStatus {
  return value === 'active' || value === 'past_due' || value === 'canceled' ? value : 'invited';
}

function canUseMembership(status: unknown, currentPeriodEnd: string) {
  const normalized = normalizeMembershipStatus(status);
  if (normalized === 'invited' || normalized === 'canceled') return false;
  if (normalized === 'past_due') return Boolean(currentPeriodEnd) && new Date(currentPeriodEnd).getTime() > Date.now();
  return true;
}

async function hashMobileSecret(value: string) {
  // 手元は .dev.vars が無くても動いてほしい。import.meta.env.DEV は本番ビルドで
  // false に置き換わるため、この既定値が本番に紛れ込むことはない。
  const pepper = env.AUTH_CODE_PEPPER || (import.meta.env.DEV ? 'local-development-pepper' : '');
  if (!pepper) throw new Error('認証用の秘密鍵が未設定です。');
  const bytes = new TextEncoder().encode(`${value}:${pepper}`);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeHashEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function randomMobileToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * 手元で動かすときのサンプル。**本番には入れない。**
 *
 * import.meta.env.DEV は本番ビルドで false になるので、この関数の中身ごと消える。
 * もとは本番でも入れていて、投稿が0件になると入り直す作りだった。会員が
 * サンプルを消しても、次に誰かが開いた瞬間また生えてくることになる。
 */
async function seedDemoData() {
  if (!import.meta.env.DEV) return;
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM requests').first<{ count: number }>();
  if (Number(row?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO members (id, email, display_name, venue, company, intro_count, deal_count, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('sample-tanaka', 'tanaka@example.jp', '田中 美咲', 'ひるのめぐろ会場', '株式会社ミナト｜採用支援', 11, 4, 520, now),
    env.DB.prepare('INSERT OR IGNORE INTO members (id, email, display_name, venue, company, intro_count, deal_count, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('sample-sato', 'sato@example.jp', '佐藤 健一', '渋谷会場', 'SATO HAIR｜美容室経営', 6, 2, 260, now),
  ]);

  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO requests (id, author_id, category, title, description, budget_label, area, deadline, status, industry_tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('sample-video-partner', 'sample-tanaka', 'collaboration', '店舗の採用課題を一緒に解決できる、動画制作会社を探しています', '飲食店向けの採用支援をしています。採用SNSの企画から撮影・編集まで、長く組める制作パートナーと出会いたいです。', '月額 20〜40万円', '東京都', '2026-09-30', 'open', '["映像・写真","Web・広告"]', '2026-08-27T09:00:00.000Z'),
    env.DB.prepare('INSERT OR IGNORE INTO requests (id, author_id, category, title, description, budget_label, area, deadline, status, industry_tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('sample-salon-designer', 'sample-sato', 'project', '10月オープン予定の美容室に強い、内装デザイナーを探しています', '恵比寿の18坪の物件です。動線設計と照明にこだわりたいので、美容室の実績がある方をご紹介ください。', '300〜450万円', '東京都', '2026-09-10', 'open', '["美容・健康","建設・不動産"]', '2026-08-26T10:30:00.000Z'),
  ]);
}

/**
 * 会員の行があることを確かめ、名前とメールを最新にする。
 *
 * **新しく作る場合は `invited`。`active` にしない。** 以前はChatGPT Sitesの
 * ヘッダでログインした人をここで自動的に有効会員にしていたが、その経路は
 * 無くなった。いま呼ばれるのは既にセッションを持っている人だけなので、
 * 行は必ず既にある。作る枝が動くとしたら想定外の経路なので、そのときに
 * 権限まで与えてしまわないようにしておく。
 */
export async function upsertMember(user: SessionUser) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO members (id, email, display_name, membership_status, created_at)
    VALUES (?, ?, ?, 'invited', ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name`).bind(user.userId, user.email, user.displayName, now).run();
}

/**
 * サンプルの投稿を本番の一覧から外す条件。
 *
 * サンプルの会員はメールが `@example.jp`（RFC2606の予約ドメインなので、
 * 本物の会員とぶつからない）。行そのものを消すのは1回きりの作業なので
 * `docs/sample-cleanup-ja.md` の手順に譲り、**ここでは見せないだけ**にする。
 * 消す処理を起動経路に置いて全画面を落としたことがあるため、二度とやらない。
 *
 * 手元の開発サーバーでは外さない。中身が無いと画面の確認ができない。
 * `import.meta.env.DEV` は本番ビルドで false の定数に置き換わる。
 */
const hideSamples = import.meta.env.DEV ? ''
  : "WHERE m.email NOT LIKE '%@example.jp' AND m.email NOT LIKE '%@example.com'";

export async function getBoardData(user: SessionUser) {
  await upsertMember(user);
  const requestsResult = await env.DB.prepare(`SELECT r.id, r.category, r.title, r.description,
    r.budget_label AS budgetLabel, r.area, r.industry_tags AS industryTagsJson,
    r.deadline, r.status, r.image_version AS imageVersion, r.created_at AS createdAt,
    r.pinned_until AS pinnedUntil, r.extended_at AS extendedAt,
    r.image_count AS imageCount, r.video_version AS videoVersion,
    r.promo_industry AS promoIndustry, r.promo_until AS promoUntil,
    m.display_name AS authorName, m.company AS authorCompany, m.venue AS authorVenue,
    m.position_title AS authorPositionTitle,
    m.business_area AS authorBusinessArea,
    m.annual_revenue_band AS authorRevenueBand,
    m.id AS authorId, m.avatar_key AS authorAvatarKey, m.avatar_version AS authorAvatarVersion,
    m.facebook_url AS authorFacebookUrl,
    (SELECT COUNT(*) FROM introductions i WHERE i.request_id = r.id) AS introCount,
    -- 自分が出した紹介の数。紹介は本人と投稿者にしか見えないので、
    -- やり取り欄では「出した／届いている」という事実だけを出す。
    (SELECT COUNT(*) FROM introductions i WHERE i.request_id = r.id AND i.introducer_id = ?) AS myIntroCount,
    (SELECT COUNT(*) FROM request_comments c WHERE c.request_id = r.id) AS commentCount
    FROM requests r
    JOIN members m ON m.id = r.author_id
    ${hideSamples}
    ORDER BY CASE WHEN r.pinned_until > ? THEN 0 ELSE 1 END, r.created_at DESC`)
    .bind(user.userId, new Date().toISOString())
    .all<Omit<BoardRequest, 'industryTags' | 'thumbUrl' | 'imageUrl' | 'imageUrls' | 'mine'> & { industryTagsJson: string; imageVersion: number; imageCount: number; videoVersion: number; authorId: string; authorAvatarKey: string; authorAvatarVersion: number }>();

  const member = await env.DB.prepare(`SELECT display_name AS displayName, name_kana AS nameKana,
    venue, company, company_kana AS companyKana,
    position_title AS positionTitle, business_area AS businessArea,
    primary_industry AS primaryIndustry, notify_industries AS notifyIndustriesJson,
    annual_revenue_band AS annualRevenueBand, facebook_url AS facebookUrl,
    avatar_key AS avatarKey, avatar_version AS avatarVersion,
    intro_count AS introCount, deal_count AS dealCount, points,
    (SELECT COUNT(*) FROM introductions i JOIN requests r ON r.id = i.request_id
      WHERE r.author_id = members.id) AS receivedIntroCount
    FROM members WHERE id = ?`).bind(user.userId).first<Omit<MemberStats, 'rank' | 'level' | 'nextRankAt' | 'avatarUrl' | 'notifyIndustries'> & { notifyIndustriesJson: string; avatarKey: string; avatarVersion: number }>();

  const baseMember = member ?? { displayName: user.displayName, nameKana: '', venue: 'ひるのめぐろ会場', company: '', companyKana: '', positionTitle: '', businessArea: '', primaryIndustry: '', notifyIndustriesJson: '[]', annualRevenueBand: '', facebookUrl: '', avatarKey: '', avatarVersion: 0, introCount: 0, receivedIntroCount: 0, dealCount: 0, points: 0 };
  const { notifyIndustriesJson, ...memberFields } = baseMember;
  const plan = await getPlanSummary(user.userId);
  const stats = calculateRank({ ...memberFields, notifyIndustries: parseStringArray(notifyIndustriesJson), avatarUrl: avatarUrl(user.userId, baseMember.avatarKey, baseMember.avatarVersion),
    plan: plan.activePlan, paid: plan.paid, planPeriodEnd: plan.planPeriodEnd,
    contractedPlan: plan.contracted, bonusPlan: plan.bonus, bonusPeriodEnd: plan.bonusPeriodEnd ?? '',
    requestsThisMonth: plan.requestsThisMonth, requestLimit: plan.requestLimit,
  });
  const requests = requestsResult.results.map(({ authorId, authorAvatarKey, authorAvatarVersion, industryTagsJson, imageVersion, imageCount, videoVersion, ...request }) => ({
    ...request,
    mine: authorId === user.userId,
    videoUrl: requestVideoUrl(request.id, videoVersion),
    imageUrls: Array.from({ length: Math.max(0, imageCount) }, (_, index) => requestImageUrl(request.id, imageVersion, 'full', index)),
    industryTags: parseStringArray(industryTagsJson),
    thumbUrl: requestImageUrl(request.id, imageVersion, 'thumb'),
    imageUrl: requestImageUrl(request.id, imageVersion, 'full'),
    authorAvatarUrl: avatarUrl(authorId, authorAvatarKey, authorAvatarVersion),
  }));
  return { requests, stats, ads: await listActiveAds() };
}

export async function updateMemberProfile(user: SessionUser, input: { displayName: string; nameKana: string; company: string; companyKana: string; venue: string; positionTitle: string; businessArea: string; primaryIndustry: string; notifyIndustries: string[]; annualRevenueBand: string; facebookUrl: string; avatar?: { bytes: ArrayBuffer; contentType: string } }) {
  await upsertMember(user);
  const existing = await env.DB.prepare('SELECT avatar_key AS avatarKey, avatar_version AS avatarVersion FROM members WHERE id = ?')
    .bind(user.userId).first<{ avatarKey: string; avatarVersion: number }>();
  let avatarKey = existing?.avatarKey ?? '';
  let avatarVersion = existing?.avatarVersion ?? 0;
  if (input.avatar) {
    avatarKey = `member-photos/${user.userId}`;
    avatarVersion = Date.now();
    await env.AVATARS.put(avatarKey, input.avatar.bytes, {
      httpMetadata: { contentType: input.avatar.contentType },
      customMetadata: { ownerId: user.userId },
    });
  }
  if (!avatarKey) throw new Error('顔写真を登録してください。');
  // display_name もここで書き替える。upsertMember はセッションが持っている名前を
  // 書き戻すが、その名前は毎回このテーブルから読んだものなので、上書き合戦にならない。
  // 呼ぶ順番も upsertMember → UPDATE なので、新しい名前が最後に残る。
  await env.DB.prepare(`UPDATE members SET display_name = ?, name_kana = ?,
    company = ?, company_kana = ?, venue = ?, position_title = ?,
    business_area = ?, primary_industry = ?, notify_industries = ?, annual_revenue_band = ?,
    facebook_url = ?, avatar_key = ?, avatar_version = ? WHERE id = ?`)
    .bind(input.displayName, input.nameKana,
      input.company, input.companyKana, input.venue, input.positionTitle, input.businessArea,
      input.primaryIndustry, JSON.stringify(input.notifyIndustries), input.annualRevenueBand,
      cleanFacebookUrl(input.facebookUrl), avatarKey, avatarVersion, user.userId).run();
  return avatarUrl(user.userId, avatarKey, avatarVersion);
}

export type RequestImageUpload = { thumb: { bytes: ArrayBuffer; contentType: string }; full: { bytes: ArrayBuffer; contentType: string } };
/** 動画は端末側で圧縮ずみのものを1本だけ受け取る。サーバーでは変換しない。 */
export type RequestVideoUpload = { bytes: ArrayBuffer; contentType: string };

export async function createRequest(user: SessionUser, input: { category: string; title: string; description: string; budgetLabel: string; area: string; industryTags: string[]; deadline: string; images?: RequestImageUpload[]; video?: RequestVideoUpload | null }) {
  await upsertMember(user);
  await requireFacePhoto(user.userId);
  const requestPlan = await getPlanState(user.userId);
  const requestCap = limits(requestPlan).requestsPerMonth;
  if (requestCap !== UNLIMITED && await countRequestsThisMonth(user.userId) >= requestCap) {
    throw new Error(`いまのプランで投稿できる探しごとは月${requestCap}件までです。今月分はすでに投稿済みです。`);
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  // 縮小は投稿する人の端末で済ませてある。サーバーでは変換しない（Workersの計算時間は従量）。
  // 何枚まで付けられるかはランクで決まる。画面ではなく、ここで切り詰める。
  const { level } = await getMemberRank(user.userId);
  const images = (input.images ?? []).slice(0, photoLimit(level));
  let imageVersion = 0;
  if (images.length) {
    imageVersion = Date.now();
    await Promise.all(images.flatMap((image: RequestImageUpload, index: number) => [
      env.AVATARS.put(requestImageKey(id, 'thumb', index), image.thumb.bytes, {
        httpMetadata: { contentType: image.thumb.contentType },
        customMetadata: { ownerId: user.userId, requestId: id },
      }),
      env.AVATARS.put(requestImageKey(id, 'full', index), image.full.bytes, {
        httpMetadata: { contentType: image.full.contentType },
        customMetadata: { ownerId: user.userId, requestId: id },
      }),
    ]));
  }
  // 動画はPLATINUM以上の特典。画面ではなくここで止める。
  let videoVersion = 0;
  let videoType = '';
  if (input.video && canPostVideo(level)) {
    videoVersion = Date.now();
    videoType = input.video.contentType;
    await env.AVATARS.put(requestVideoKey(id), input.video.bytes, {
      httpMetadata: { contentType: videoType },
      customMetadata: { ownerId: user.userId, requestId: id },
    });
  }
  await env.DB.prepare('INSERT INTO requests (id, author_id, category, title, description, budget_label, area, industry_tags, deadline, status, image_version, image_count, video_version, video_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.userId, input.category, input.title, input.description.slice(0, descriptionLimit(level)), input.budgetLabel, input.area, JSON.stringify(input.industryTags), input.deadline, 'open', imageVersion, images.length, videoVersion, videoType, createdAt).run();
  await sendMatchingPushNotifications(user.userId, { id, title: input.title, industryTags: input.industryTags }).catch(() => undefined);
  await sendMatchingMobileNotifications(user.userId, { id, title: input.title, industryTags: input.industryTags }).catch(() => undefined);
  return id;
}

/**
 * 自分が出した探しごとを、新しい順に返す。マイページの「自分の投稿」に出す。
 *
 * 掲示板の一覧とは別に引く。掲示板は募集中のものを他人に見せる場所で、
 * ここは**期限が切れたものも含めて自分の記録を全部見せる**場所だから。
 */
export async function listMyRequests(user: SessionUser) {
  await upsertMember(user);
  const rows = await env.DB.prepare(`SELECT r.id, r.category, r.title, r.description,
    r.budget_label AS budgetLabel, r.area, r.industry_tags AS industryTagsJson,
    r.deadline, r.status, r.image_version AS imageVersion, r.image_count AS imageCount,
    r.video_version AS videoVersion, r.created_at AS createdAt, r.extended_at AS extendedAt,
    (SELECT COUNT(*) FROM introductions i WHERE i.request_id = r.id) AS introCount,
    (SELECT COUNT(*) FROM request_comments c WHERE c.request_id = r.id) AS commentCount
    FROM requests r WHERE r.author_id = ? ORDER BY r.created_at DESC`)
    .bind(user.userId).all<{ id: string; category: string; title: string; description: string;
      budgetLabel: string; area: string; industryTagsJson: string; deadline: string; status: string;
      imageVersion: number; imageCount: number; videoVersion: number; createdAt: string;
      extendedAt: string; introCount: number; commentCount: number }>();
  return rows.results.map(({ industryTagsJson, imageVersion, imageCount, videoVersion, ...rest }) => ({
    ...rest,
    industryTags: parseStringArray(industryTagsJson),
    thumbUrl: requestImageUrl(rest.id, imageVersion, 'thumb'),
    imageCount,
    hasVideo: videoVersion > 0,
  }));
}

/**
 * 自分の探しごとを直す。
 *
 * **他人の投稿を書き替えられないよう、WHERE に author_id を入れる。**
 * 画面側で編集ボタンを出し分けるだけでは、APIを直接叩かれたときに守れない。
 * 写真は「選び直したときだけ」入れ替える。触らなければそのまま残る。
 */
export async function updateRequest(user: SessionUser, id: string, input: {
  category: string; title: string; description: string; budgetLabel: string; area: string;
  industryTags: string[]; deadline: string; status: string; images?: RequestImageUpload[];
}) {
  await upsertMember(user);
  const own = await env.DB.prepare('SELECT image_count AS imageCount FROM requests WHERE id = ? AND author_id = ?')
    .bind(id, user.userId).first<{ imageCount: number }>();
  if (!own) throw new Error('この探しごとは編集できません。');

  const { level } = await getMemberRank(user.userId);
  let imageSet = '';
  const imageBinds: (string | number)[] = [];
  const images = input.images ?? [];
  if (images.length) {
    // 選び直したぶんで全部入れ替える。前より枚数が減ったときに、古い写真が
    // 残って見えてしまわないよう、余ったキーはあとで消す。
    const kept = images.slice(0, photoLimit(level));
    const version = Date.now();
    await Promise.all(kept.flatMap((image, index) => [
      env.AVATARS.put(requestImageKey(id, 'thumb', index), image.thumb.bytes, {
        httpMetadata: { contentType: image.thumb.contentType },
        customMetadata: { ownerId: user.userId, requestId: id },
      }),
      env.AVATARS.put(requestImageKey(id, 'full', index), image.full.bytes, {
        httpMetadata: { contentType: image.full.contentType },
        customMetadata: { ownerId: user.userId, requestId: id },
      }),
    ]));
    for (let index = kept.length; index < (own.imageCount ?? 0); index += 1) {
      await Promise.allSettled([
        env.AVATARS.delete(requestImageKey(id, 'thumb', index)),
        env.AVATARS.delete(requestImageKey(id, 'full', index)),
      ]);
    }
    imageSet = ', image_version = ?, image_count = ?';
    imageBinds.push(version, kept.length);
  }

  await env.DB.prepare(`UPDATE requests SET category = ?, title = ?, description = ?,
    budget_label = ?, area = ?, industry_tags = ?, deadline = ?, status = ?${imageSet}
    WHERE id = ? AND author_id = ?`)
    .bind(input.category, input.title, input.description.slice(0, descriptionLimit(level)),
      input.budgetLabel, input.area, JSON.stringify(input.industryTags), input.deadline,
      input.status === 'closed' ? 'closed' : 'open', ...imageBinds, id, user.userId).run();
}

/**
 * 自分の探しごとを消す。ぶら下がっているやり取りと紹介も一緒に消す。
 *
 * 順番が要る。子（コメント・紹介）を先に消さないと外部キーで止まる。
 * D1に `ON DELETE CASCADE` は入っていないので、ここで面倒を見る。
 */
export async function deleteRequest(user: SessionUser, id: string) {
  await upsertMember(user);
  const own = await env.DB.prepare('SELECT image_count AS imageCount, video_version AS videoVersion FROM requests WHERE id = ? AND author_id = ?')
    .bind(id, user.userId).first<{ imageCount: number; videoVersion: number }>();
  if (!own) throw new Error('この探しごとは削除できません。');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM request_comments WHERE request_id = ?').bind(id),
    // やり取りは紹介にぶら下がっている。**紹介より先に消す。**
    env.DB.prepare('DELETE FROM introduction_messages WHERE introduction_id IN (SELECT id FROM introductions WHERE request_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM introductions WHERE request_id = ?').bind(id),
    env.DB.prepare('DELETE FROM requests WHERE id = ? AND author_id = ?').bind(id, user.userId),
  ]);

  // R2の後片づけ。ここが失敗しても投稿は消えているので、握りつぶしてよい。
  const keys = [requestVideoKey(id)];
  for (let index = 0; index < Math.max(1, own.imageCount ?? 0); index += 1) {
    keys.push(requestImageKey(id, 'thumb', index), requestImageKey(id, 'full', index));
  }
  await Promise.allSettled(keys.map((key) => env.AVATARS.delete(key)));
}

export async function savePushSubscription(user: SessionUser, subscription: PushSubscription) {
  await upsertMember(user);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh,
      auth = excluded.auth, updated_at = excluded.updated_at`)
    .bind(subscription.endpoint, user.userId, subscription.keys.p256dh, subscription.keys.auth, now, now).run();
}

export async function deletePushSubscription(user: SessionUser, endpoint: string) {
  await upsertMember(user);
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?').bind(endpoint, user.userId).run();
}

export async function createIntroduction(user: SessionUser, input: { requestId: string; personName: string; personCompany: string; relationship: string; fitReason: string; }) {
  await upsertMember(user);
  await requireFacePhoto(user.userId);
  const request = await env.DB.prepare('SELECT id FROM requests WHERE id = ? AND status = ?').bind(input.requestId, 'open').first();
  if (!request) throw new Error('募集が終了しているか、見つかりません。');
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO introductions (id, request_id, introducer_id, person_name, person_company, relationship, fit_reason, consent_confirmed, status, points_awarded, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.requestId, user.userId, input.personName, input.personCompany, input.relationship, input.fitReason, 1, 'proposed', 10, createdAt),
    env.DB.prepare('UPDATE members SET intro_count = intro_count + 1, points = points + 10 WHERE id = ?').bind(user.userId),
  ]);
  return id;
}

export async function getReceivedIntroductions(user: SessionUser) {
  await upsertMember(user);
  const result = await env.DB.prepare(`SELECT i.id, i.request_id AS requestId, r.title AS requestTitle,
    r.category AS requestCategory, i.person_name AS personName, i.person_company AS personCompany,
    i.relationship, i.fit_reason AS fitReason, i.status, i.created_at AS createdAt,
    m.display_name AS introducerName, m.company AS introducerCompany, m.venue AS introducerVenue, m.facebook_url AS introducerFacebookUrl,
    m.id AS introducerId, m.avatar_key AS introducerAvatarKey, m.avatar_version AS introducerAvatarVersion
    FROM introductions i
    JOIN requests r ON r.id = i.request_id
    JOIN members m ON m.id = i.introducer_id
    WHERE r.author_id = ?
    ORDER BY i.created_at DESC`)
    .bind(user.userId).all<Omit<ReceivedIntroduction, 'introducerAvatarUrl'> & { introducerId: string; introducerAvatarKey: string; introducerAvatarVersion: number }>();
  return result.results.map(({ introducerId, introducerAvatarKey, introducerAvatarVersion, ...introduction }) => ({
    ...introduction,
    introducerAvatarUrl: avatarUrl(introducerId, introducerAvatarKey, introducerAvatarVersion),
  }));
}

/**
 * その紹介を読み書きしてよい2人かどうかを確かめ、相手が誰かを返す。
 *
 * **読むときも書くときも、必ずここを通す。** 画面を出し分けるだけでは、
 * URLを直接叩かれたときに他人の紹介のやり取りが読めてしまう。
 * 紹介の中身は、投稿者と紹介者しか見てはいけない決まりになっている。
 */
async function introductionPartner(userId: string, introductionId: string) {
  const row = await env.DB.prepare(`SELECT i.introducer_id AS introducerId, r.author_id AS authorId,
      r.title AS requestTitle
    FROM introductions i JOIN requests r ON r.id = i.request_id WHERE i.id = ?`)
    .bind(introductionId).first<{ introducerId: string; authorId: string; requestTitle: string }>();
  if (!row) return null;
  if (userId !== row.introducerId && userId !== row.authorId) return null;
  return {
    ...row,
    partnerId: userId === row.introducerId ? row.authorId : row.introducerId,
    /** 自分が投稿者の側か。文言を出し分けるのに使う。 */
    isAuthor: userId === row.authorId,
  };
}

/** 紹介1件ぶんのやり取りを、古い順に返す。関係のない人には空ではなく例外。 */
export async function listIntroductionMessages(user: SessionUser, introductionId: string): Promise<IntroductionMessage[]> {
  await upsertMember(user);
  const access = await introductionPartner(user.userId, introductionId);
  if (!access) throw new Error('このやり取りは表示できません。');
  const rows = await env.DB.prepare(`SELECT n.id, n.body, n.created_at AS createdAt, n.sender_id AS senderId,
      m.display_name AS senderName, m.avatar_key AS senderAvatarKey, m.avatar_version AS senderAvatarVersion
    FROM introduction_messages n JOIN members m ON m.id = n.sender_id
    WHERE n.introduction_id = ? ORDER BY n.created_at ASC`)
    .bind(introductionId).all<{ id: string; body: string; createdAt: string; senderId: string;
      senderName: string; senderAvatarKey: string; senderAvatarVersion: number }>();
  return rows.results.map(({ senderId, senderAvatarKey, senderAvatarVersion, ...row }) => ({
    ...row,
    senderAvatarUrl: avatarUrl(senderId, senderAvatarKey, senderAvatarVersion),
    mine: senderId === user.userId,
  }));
}

export const INTRODUCTION_MESSAGE_MAX = 1000;

/** やり取りを1つ送る。送れるのは投稿者と紹介者の2人だけ。 */
export async function addIntroductionMessage(user: SessionUser, introductionId: string, body: string) {
  await upsertMember(user);
  const access = await introductionPartner(user.userId, introductionId);
  if (!access) throw new Error('このやり取りには書き込めません。');
  const text = body.trim().slice(0, INTRODUCTION_MESSAGE_MAX);
  if (!text) throw new Error('メッセージを入力してください。');
  await env.DB.prepare('INSERT INTO introduction_messages (id, introduction_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), introductionId, user.userId, text, new Date().toISOString()).run();
  // 相手に知らせる。届かなくてもやり取りは残るので、失敗は握りつぶす。
  await sendIntroductionMessageNotice(access.partnerId, user.displayName, access.requestTitle).catch(() => undefined);
  return listIntroductionMessages(user, introductionId);
}

/** 自分が出した紹介の一覧。相手（投稿者）とやり取りするための入口。 */
export async function getSentIntroductions(user: SessionUser): Promise<SentIntroduction[]> {
  await upsertMember(user);
  const rows = await env.DB.prepare(`SELECT i.id, i.request_id AS requestId, r.title AS requestTitle,
      r.category AS requestCategory, i.person_name AS personName, i.person_company AS personCompany,
      i.relationship, i.fit_reason AS fitReason, i.created_at AS createdAt,
      m.display_name AS authorName, m.company AS authorCompany, m.venue AS authorVenue,
      m.facebook_url AS authorFacebookUrl, m.id AS authorId,
      m.avatar_key AS authorAvatarKey, m.avatar_version AS authorAvatarVersion,
      (SELECT COUNT(*) FROM introduction_messages n WHERE n.introduction_id = i.id) AS messageCount
    FROM introductions i
    JOIN requests r ON r.id = i.request_id
    JOIN members m ON m.id = r.author_id
    WHERE i.introducer_id = ?
    ORDER BY i.created_at DESC`)
    .bind(user.userId).all<Omit<SentIntroduction, 'authorAvatarUrl'> & { authorId: string; authorAvatarKey: string; authorAvatarVersion: number }>();
  return rows.results.map(({ authorId, authorAvatarKey, authorAvatarVersion, ...row }) => ({
    ...row,
    authorAvatarUrl: avatarUrl(authorId, authorAvatarKey, authorAvatarVersion),
  }));
}

export async function getMemberAvatar(memberId: string) {
  await ensureDatabase();
  const member = await env.DB.prepare('SELECT avatar_key AS avatarKey FROM members WHERE id = ?')
    .bind(memberId).first<{ avatarKey: string }>();
  if (!member?.avatarKey) return null;
  return env.AVATARS.get(member.avatarKey);
}

export async function getAttendanceData(user: SessionUser) {
  await upsertMember(user);
  const eventsResult = await env.DB.prepare(`SELECT id, meeting_date AS meetingDate,
    meeting_name AS meetingName, venue, created_at AS createdAt
    FROM attendance_events WHERE owner_id = ? ORDER BY meeting_date DESC, created_at DESC`)
    .bind(user.userId).all<Omit<AttendanceEvent, 'people'>>();
  const peopleResult = await env.DB.prepare(`SELECT p.id, p.event_id AS eventId, p.person_name AS personName,
    p.company, p.note, p.is_important AS isImportant,
    e.meeting_date AS meetingDate, e.meeting_name AS meetingName, e.venue
    FROM attendance_people p JOIN attendance_events e ON e.id = p.event_id
    WHERE p.owner_id = ? ORDER BY e.meeting_date DESC, p.sort_order ASC`)
    .bind(user.userId).all<Omit<AttendancePerson, 'isImportant'> & { isImportant: number }>();
  const people = peopleResult.results.map((person) => ({ ...person, isImportant: Boolean(person.isImportant) }));
  const events = eventsResult.results.map((event) => ({ ...event, people: people.filter((person) => person.eventId === event.id) }));
  return { events, importantPeople: people.filter((person) => person.isImportant) };
}

export async function createAttendanceEvent(user: SessionUser, input: {
  meetingDate: string;
  meetingName: string;
  venue: string;
  ocrText: string;
  people: Array<{ personName: string; company: string; note: string; isImportant: boolean }>;
}) {
  await upsertMember(user);
  const eventId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const queries = [
    env.DB.prepare(`INSERT INTO attendance_events
      (id, owner_id, meeting_date, meeting_name, venue, ocr_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(eventId, user.userId, input.meetingDate, input.meetingName, input.venue, input.ocrText, createdAt),
    ...input.people.map((person, index) => env.DB.prepare(`INSERT INTO attendance_people
      (id, event_id, owner_id, person_name, company, note, is_important, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), eventId, user.userId, person.personName, person.company, person.note, person.isImportant ? 1 : 0, index, createdAt)),
  ];
  await env.DB.batch(queries);
  return eventId;
}

export async function updateAttendancePerson(user: SessionUser, input: {
  id: string;
  personName: string;
  company: string;
  note: string;
  isImportant: boolean;
}) {
  await upsertMember(user);
  const result = await env.DB.prepare(`UPDATE attendance_people
    SET person_name = ?, company = ?, note = ?, is_important = ?
    WHERE id = ? AND owner_id = ?`)
    .bind(input.personName, input.company, input.note, input.isImportant ? 1 : 0, input.id, user.userId).run();
  if (!result.meta.changes) throw new Error('対象の出席者が見つかりません。');
}

async function requireFacePhoto(memberId: string) {
  const member = await env.DB.prepare('SELECT avatar_key AS avatarKey FROM members WHERE id = ?')
    .bind(memberId).first<{ avatarKey: string }>();
  if (!member?.avatarKey) throw new Error('投稿・紹介の前に、プロフィールへ顔写真を登録してください。');
}

function avatarUrl(memberId: string, avatarKey: string, avatarVersion: number) {
  return avatarKey ? `/api/avatar/${encodeURIComponent(memberId)}?v=${avatarVersion}` : '';
}

// 1枚目は番号なしのまま置く。以前に投稿された写真をそのまま読めるようにするため。
/** 動画の置き場。1つの探しごとにつき1本。 */
function requestVideoKey(id: string) {
  return `request-videos/${id}`;
}

/** 保存した動画を読み出す。 */
export async function getRequestVideo(id: string) {
  await ensureDatabase();
  return env.AVATARS.get(requestVideoKey(id));
}

/** 動画のURL。版番号つきなので1年キャッシュできる。 */
function requestVideoUrl(id: string, version: number) {
  return version ? `/api/request-video/${encodeURIComponent(id)}?v=${version}` : '';
}

function requestImageKey(id: string, size: 'thumb' | 'full', index = 0) {
  const folder = size === 'thumb' ? 'request-thumbs' : 'request-images';
  return index === 0 ? `${folder}/${id}` : `${folder}/${id}/${index}`;
}

/** 探しごとの画像を返す。会員なら誰でも見られる（掲示板に出ているもの）。 */
export async function getRequestImage(id: string, size: 'thumb' | 'full', index = 0) {
  await ensureDatabase();
  const row = await env.DB.prepare('SELECT image_version AS imageVersion, image_count AS imageCount FROM requests WHERE id = ?')
    .bind(id).first<{ imageVersion: number; imageCount: number }>();
  if (!row?.imageVersion || index >= Math.max(1, row.imageCount)) return null;
  return env.AVATARS.get(requestImageKey(id, size, index));
}

/**
 * 探しごとの画像。一覧用の小さい版と、詳細用の大きい版を別に持つ。
 * 一覧は1画面に何件も並ぶので、小さい版を分けておかないと読み出しが重くなる。
 * 版番号がURLに入るので、1年キャッシュしても差し替えは効く。
 */
function requestImageUrl(id: string, version: number, size: 'thumb' | 'full', index = 0) {
  if (!version) return '';
  const at = index > 0 ? `&n=${index}` : '';
  return `/api/request-image/${encodeURIComponent(id)}?v=${version}&size=${size}${at}`;
}

/**
 * 紹介のやり取りが届いたことを、相手1人にだけ知らせる。
 * 中身は本文に入れない（通知は端末の画面に出るため、他人に見えうる）。
 */
async function sendIntroductionMessageNotice(partnerId: string, senderName: string, requestTitle: string) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const rows = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ?')
    .bind(partnerId).all<{ endpoint: string; p256dh: string; auth: string }>();
  await Promise.allSettled(rows.results.map(async (row) => {
    const subscription: PushSubscription = {
      endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth },
    };
    const payload = await buildPushPayload({
      data: {
        title: `${senderName}さんからメッセージが届きました`,
        body: `「${requestTitle}」の紹介について`,
        url: '/?intro=1',
        tag: 'introduction-message',
      },
      options: { ttl: 86400, urgency: 'normal' },
    }, subscription, {
      subject: env.VAPID_SUBJECT || 'mailto:info@give-hub.jp',
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    });
    await fetch(subscription.endpoint, { ...payload, body: new Uint8Array(payload.body) });
  }));
}

async function sendMatchingPushNotifications(authorId: string, request: { id: string; title: string; industryTags: string[] }) {
  if (!request.industryTags.length || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const subscriptions = await env.DB.prepare(`SELECT p.endpoint, p.p256dh, p.auth,
    m.notify_industries AS notifyIndustriesJson
    FROM push_subscriptions p JOIN members m ON m.id = p.member_id
    WHERE p.member_id != ?`).bind(authorId).all<{ endpoint: string; p256dh: string; auth: string; notifyIndustriesJson: string }>();
  const targets = subscriptions.results.filter((subscription) => {
    const wanted = parseStringArray(subscription.notifyIndustriesJson);
    return wanted.some((industry) => matchesIndustry(request.industryTags, industry));
  });
  const expiredEndpoints: string[] = [];
  await Promise.allSettled(targets.map(async (target) => {
    const subscription: PushSubscription = {
      endpoint: target.endpoint,
      expirationTime: null,
      keys: { p256dh: target.p256dh, auth: target.auth },
    };
    const payload = await buildPushPayload({
      data: {
        title: '関連する探しごとが投稿されました',
        body: request.title,
        url: `/?request=${encodeURIComponent(request.id)}`,
        tag: `request-${request.id}`,
      },
      options: { ttl: 86400, urgency: 'normal' },
    }, subscription, {
      subject: env.VAPID_SUBJECT || 'mailto:info@give-hub.jp',
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    });
    const response = await fetch(subscription.endpoint, { ...payload, body: new Uint8Array(payload.body) });
    if (response.status === 404 || response.status === 410) expiredEndpoints.push(subscription.endpoint);
  }));
  if (expiredEndpoints.length) {
    await env.DB.batch(expiredEndpoints.map((endpoint) => env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint)));
  }
}

async function sendMatchingMobileNotifications(authorId: string, request: { id: string; title: string; industryTags: string[] }) {
  if (!request.industryTags.length) return;
  const now = new Date().toISOString();
  const subscriptions = await env.DB.prepare(`SELECT p.token, m.notify_industries AS notifyIndustriesJson
    FROM mobile_push_tokens p JOIN members m ON m.id = p.member_id
    WHERE p.member_id != ? AND (m.membership_status = 'active'
      OR (m.membership_status = 'past_due' AND m.membership_period_end > ?))`)
    .bind(authorId, now).all<{ token: string; notifyIndustriesJson: string }>();
  const targets = subscriptions.results.filter((subscription) => {
    const wanted = parseStringArray(subscription.notifyIndustriesJson);
    return wanted.some((industry) => matchesIndustry(request.industryTags, industry));
  });
  if (!targets.length) return;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(targets.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: '関連する探しごとが投稿されました',
      body: request.title,
      data: { requestId: request.id, path: '/requests' },
    }))),
  });
  if (!response.ok) throw new Error('端末通知を送信できませんでした。');
  const payload = await response.json().catch(() => null) as { data?: Array<{ status?: string; details?: { error?: string } }> } | null;
  const invalidTokens = targets.filter((_, index) => payload?.data?.[index]?.details?.error === 'DeviceNotRegistered').map(({ token }) => token);
  if (invalidTokens.length) {
    await env.DB.batch(invalidTokens.map((token) => env.DB.prepare('DELETE FROM mobile_push_tokens WHERE token = ?').bind(token)));
  }
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function calculateRank(member: Omit<MemberStats, 'rank' | 'level' | 'nextRankAt'>): MemberStats {
  const level = levelFor(member.introCount);
  return { ...member, rank: rankName(level), level, nextRankAt: rankThresholds[level] ?? member.introCount };
}

// --- ランクの特典 ここから ----------------------------------------------------
// 何が使えるかは app/rank-perks.ts が決める。ここは書き込みと、その前の確認だけ。
// **画面は隠すだけ。実際に止めるのはここ。**

/** 募集の期限を延ばす。1件につき1回まで。GOLD以上の特典。 */
export async function extendRequest(memberId: string, requestId: string) {
  await ensureDatabase();
  const { level } = await getMemberRank(memberId);
  if (!canExtendRequest(level)) throw new Error('募集の延長は GOLD 以上の特典です。');

  const row = await env.DB.prepare('SELECT deadline, extended_at AS extendedAt FROM requests WHERE id = ? AND author_id = ?')
    .bind(requestId, memberId).first<{ deadline: string; extendedAt: string }>();
  if (!row) throw new Error('この探しごとは延長できません。');
  if (row.extendedAt) throw new Error('この探しごとは、すでに1回延長しています。');

  // 期限切れのものは今日から、まだ先のものはその期限から延ばす。
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(`${row.deadline < today ? today : row.deadline}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() + EXTEND_DAYS);
  const deadline = from.toISOString().slice(0, 10);

  await env.DB.prepare("UPDATE requests SET deadline = ?, status = 'open', extended_at = ? WHERE id = ?")
    .bind(deadline, new Date().toISOString(), requestId).run();
  return deadline;
}

/** おすすめに出したい業種を、いくつまで選べるか。ランクで増える。 */
export async function notifyIndustryCap(memberId: string) {
  const { level } = await getMemberRank(memberId);
  return notifyIndustryLimit(level);
}
// --- ランクの特典 ここまで ----------------------------------------------------

// --- トップバナーの出稿枠 ここから ---------------------------------------------
// ランク上位の会員だけが買える掲載枠。開始日と期間（既定は最大30日）を選び、
// 同じ日に出せるのは AD_CONCURRENT_SLOTS 本まで。早い者勝ちで押さえる。
// 紹介を積んでランクを上げると、先の日付まで予約でき、期間も延ばせる。
//
// 金額はここに置かない（アプリ内に価格を出せないため）。決済は app/api/ads/ が
// 扱い、ここは枠の押さえ方と読み出しだけを持つ。

export type AdSlot = {
  id: string;
  /** 掲載の初日（YYYY-MM-DD）。 */
  startDate: string;
  /** 掲載の最終日（YYYY-MM-DD）。この日いっぱいまで出る。 */
  endDate: string;
  title: string;
  description: string;
  linkUrl: string;
  imageUrl: string;
  status: string;
  /** 出している場所。'banner'（画面上部）か 'list'（仕事の掲示板の上位）。 */
  placement: string;
  /** 狙う大分類。空なら全業種の先頭に出る。'list' のときだけ意味がある。 */
  industry: string;
  memberName: string;
  memberCompany: string;
  /** 見た人の合計。同じ会員は1日1回までしか数えない。 */
  viewCount: number;
  clickCount: number;
};

/** 1日の掲載と、その日の表示・クリック。アナリティクスの元になる。 */
export type AdDay = { date: string; views: number; clicks: number };

function adImageKey(id: string) {
  return `ad-images/${id}`;
}

function adImageUrl(id: string, version: number) {
  return version ? `/api/ad-image/${encodeURIComponent(id)}?v=${version}` : '';
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** 日付をずらす。YYYY-MM-DD のまま扱う。 */
export function shiftDate(date: string, days: number) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** 決済されないまま押さえられている枠を解放する。呼ばれるたびに掃除する。 */
async function releaseStaleAdReservations() {
  const limit = new Date(Date.now() - AD_RESERVATION_MINUTES * 60000).toISOString();
  await env.DB.prepare("DELETE FROM ad_slots WHERE status = 'reserved' AND created_at < ?").bind(limit).run();
}

/**
 * その期間に重なっている枠を、日付だけ読み出す。
 * 日ごとに数えると問い合わせが増えるので、重なるものを1回で取ってJS側で数える。
 */
async function overlappingSlots(from: string, to: string, placement: string) {
  const rows = await env.DB.prepare(`SELECT start_date AS startDate, end_date AS endDate FROM ad_slots
    WHERE status IN ('reserved', 'active') AND placement = ? AND start_date <= ? AND end_date >= ?`)
    .bind(placement, to, from).all<{ startDate: string; endDate: string }>();
  return rows.results;
}

/** 日ごとの空き枠。0なら満枠。 */
function remainingByDay(slots: { startDate: string; endDate: string }[], from: string, days: number, limit: number) {
  const used = new Map<string, number>();
  for (const slot of slots) {
    for (let date = slot.startDate; date <= slot.endDate; date = shiftDate(date, 1)) {
      used.set(date, (used.get(date) ?? 0) + 1);
    }
  }
  const calendar: { date: string; remaining: number }[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = shiftDate(from, index);
    calendar.push({ date, remaining: Math.max(0, limit - (used.get(date) ?? 0)) });
  }
  return calendar;
}

/**
 * 申し込める日をカレンダーで返す。今日から daysAhead 日ぶん。
 * 先まで見えるようにしているのは、催しや繁忙期に合わせて先に押さえたい人がいるため。
 */
export async function adCalendar(daysAhead: number, placement: string = DEFAULT_PLACEMENT) {
  await ensureDatabase();
  await releaseStaleAdReservations();
  const from = today();
  const to = shiftDate(from, daysAhead - 1);
  return remainingByDay(await overlappingSlots(from, to, placement), from, daysAhead, placementSlots(placement));
}

/**
 * 枠を1つ押さえる。決済が終わるまでは reserved で、放置すると自動で解放される。
 * 期間のどこか1日でも満枠なら断る。早い者勝ちなので、押さえた順に確定する。
 */
export async function reserveAdSlot(memberId: string, startDate: string, days: number, content: AdContent, placement: string = DEFAULT_PLACEMENT, industry = '', amountYen = 0) {
  await ensureDatabase();
  await releaseStaleAdReservations();
  const endDate = shiftDate(startDate, days - 1);

  const limit = placementSlots(placement);
  const full = remainingByDay(await overlappingSlots(startDate, endDate, placement), startDate, days, limit).find((day) => day.remaining <= 0);
  if (full) throw new Error(`${formatDay(full.date)}は満枠です。ほかの期間をお選びください。`);

  const id = crypto.randomUUID();
  // 中身は押さえるのと同時に入れる。申し込みと入稿を1つの画面にまとめたため、
  // 支払いのあとに「まだ何も出ていない枠」ができない。
  const imageVersion = content.image ? await putAdImage(id, memberId, content.image) : 0;
  await env.DB.prepare(`INSERT INTO ad_slots (id, member_id, month, start_date, end_date, status, created_at,
      placement, industry, title, description, link_url, image_version, amount_yen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, memberId, startDate.slice(0, 7), startDate, endDate, 'reserved', new Date().toISOString(), placement, industry,
      cleanAdTitle(content.title), cleanAdDescription(content.description), cleanAdLink(content.linkUrl), imageVersion, Math.max(0, Math.round(amountYen))).run();

  // 押さえたあとにもう一度数えて、競り負けていたら取り消す。
  const lost = remainingByDay(await overlappingSlots(startDate, endDate, placement), startDate, days, limit).find((day) => day.remaining < 0);
  if (lost) {
    await env.DB.prepare('DELETE FROM ad_slots WHERE id = ?').bind(id).run();
    throw new Error(`${formatDay(lost.date)}は満枠になりました。ほかの期間をお選びください。`);
  }
  return { id, endDate };
}

function formatDay(date: string) {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

/** 決済画面を開けなかったときに、押さえた枠をすぐ返す。放置で待たせないため。 */
export async function releaseAdSlot(id: string) {
  await env.DB.prepare("DELETE FROM ad_slots WHERE id = ? AND status = 'reserved'").bind(id).run();
}

export async function saveAdSlotSession(id: string, sessionId: string) {
  await env.DB.prepare('UPDATE ad_slots SET stripe_session_id = ? WHERE id = ?').bind(sessionId, id).run();
}

/** 決済が済んだ枠を掲載中にする。webhookから呼ぶ。 */
export async function activateAdSlot(id: string) {
  await ensureDatabase();
  await env.DB.prepare("UPDATE ad_slots SET status = 'active' WHERE id = ? AND status = 'reserved'").bind(id).run();
}

const adSelect = `SELECT a.id, a.start_date AS startDate, a.end_date AS endDate, a.title, a.description,
    a.link_url AS linkUrl, a.image_version AS imageVersion,
    a.status, a.placement, a.industry, a.view_count AS viewCount, a.click_count AS clickCount,
    m.display_name AS memberName, m.company AS memberCompany
  FROM ad_slots a JOIN members m ON m.id = a.member_id`;

type AdRow = Omit<AdSlot, 'imageUrl'> & { imageVersion: number };
const toAdSlot = ({ imageVersion, ...ad }: AdRow): AdSlot => ({ ...ad, imageUrl: adImageUrl(ad.id, imageVersion) });

/**
 * いま出ている広告。ホームのバナーに出す。
 * 運営が止めた枠（status='stopped'）はここから外れる。docs/ad-slots-ja.md 参照。
 */
export async function listActiveAds(placement?: string): Promise<AdSlot[]> {
  await ensureDatabase();
  const now = today();
  const rows = placement
    ? await env.DB.prepare(`${adSelect}
        WHERE a.start_date <= ? AND a.end_date >= ? AND a.status = 'active' AND a.title <> '' AND a.placement = ?
        ORDER BY a.created_at`).bind(now, now, placement).all<AdRow>()
    : await env.DB.prepare(`${adSelect}
        WHERE a.start_date <= ? AND a.end_date >= ? AND a.status = 'active' AND a.title <> ''
        ORDER BY a.created_at`).bind(now, now).all<AdRow>();
  return rows.results.map(toAdSlot);
}

/**
 * その会員が持っている枠。掲載内容を入れる画面で使う。
 * 終わったものも90日ぶん返す。「いくら払って、何人に届いたか」を後から見返せるように。
 */
export async function listMemberAds(memberId: string): Promise<AdSlot[]> {
  await ensureDatabase();
  const rows = await env.DB.prepare(`${adSelect}
    WHERE a.member_id = ? AND a.end_date >= ? AND a.status IN ('active', 'stopped')
    ORDER BY a.start_date DESC`).bind(memberId, shiftDate(today(), -90)).all<AdRow>();
  return rows.results.map(toAdSlot);
}

/**
 * 日ごとの成果。アナリティクスの本体。
 * 掲載の初日から今日（または最終日）までを、抜けている日も0で埋めて返す。
 */
export async function adDailyStats(memberId: string, adId: string): Promise<{ slot: AdSlot; days: AdDay[] } | null> {
  await ensureDatabase();
  const row = await env.DB.prepare(`${adSelect} WHERE a.id = ? AND a.member_id = ?`).bind(adId, memberId).first<AdRow>();
  if (!row) return null;
  const slot = toAdSlot(row);

  const stored = await env.DB.prepare('SELECT date, views, clicks FROM ad_daily WHERE ad_id = ? ORDER BY date')
    .bind(adId).all<AdDay>();
  const byDate = new Map(stored.results.map((day) => [day.date, day]));

  const last = slot.endDate < today() ? slot.endDate : today();
  const days: AdDay[] = [];
  for (let date = slot.startDate; date <= last; date = shiftDate(date, 1)) {
    days.push(byDate.get(date) ?? { date, views: 0, clicks: 0 });
  }
  return { slot, days };
}

/** 出稿する人に入れてもらうもの。これだけ。 */
export type AdContent = {
  title: string;
  description: string;
  linkUrl: string;
  image?: { bytes: ArrayBuffer; contentType: string };
};

/** 掲載内容を入れ替える。画像は端末で縮小済みのものを受け取る。 */
export async function updateAdSlot(memberId: string, id: string, input: AdContent) {
  await ensureDatabase();
  const owned = await env.DB.prepare("SELECT image_version AS imageVersion FROM ad_slots WHERE id = ? AND member_id = ? AND status IN ('reserved', 'active')")
    .bind(id, memberId).first<{ imageVersion: number }>();
  if (!owned) throw new Error('この枠は編集できません。');

  const imageVersion = input.image ? await putAdImage(id, memberId, input.image) : owned.imageVersion;
  await env.DB.prepare('UPDATE ad_slots SET title = ?, description = ?, link_url = ?, image_version = ? WHERE id = ?')
    .bind(cleanAdTitle(input.title), cleanAdDescription(input.description), cleanAdLink(input.linkUrl), imageVersion, id).run();
}

/** バナーの画像を置く。版番号を返す（URLに入れて1年キャッシュするため）。 */
async function putAdImage(id: string, memberId: string, image: { bytes: ArrayBuffer; contentType: string }) {
  const version = Date.now();
  await env.AVATARS.put(adImageKey(id), image.bytes, {
    httpMetadata: { contentType: image.contentType },
    customMetadata: { ownerId: memberId, adSlotId: id },
  });
  return version;
}

function cleanAdTitle(value: string) {
  return value.trim().slice(0, AD_TITLE_MAX);
}

function cleanAdDescription(value: string) {
  return value.trim().slice(0, AD_DESCRIPTION_MAX);
}

export async function getAdImage(id: string) {
  await ensureDatabase();
  const row = await env.DB.prepare('SELECT image_version AS imageVersion FROM ad_slots WHERE id = ?')
    .bind(id).first<{ imageVersion: number }>();
  if (!row?.imageVersion) return null;
  return env.AVATARS.get(adImageKey(id));
}

/**
 * 見られた回数を数える。合計と、その日ぶんの両方に足す。
 * 間引きは端末側でやる（同じ会員・同じ広告は1日1回まで）。掲示板を開くたびに
 * D1へ書くと書き込み回数が読めなくなるため。
 */
export async function recordAdViews(ids: string[]) {
  if (!ids.length) return;
  await ensureDatabase();
  await countAdEvents(ids, 'views');
}

/** 押された回数を数える。クリックはもともと少ないので、その場で書く。 */
export async function recordAdClick(id: string) {
  await ensureDatabase();
  await countAdEvents([id], 'clicks');
}

/** 合計（ad_slots）と日ごと（ad_daily）を、1往復でまとめて足す。 */
async function countAdEvents(ids: string[], kind: 'views' | 'clicks') {
  const now = today();
  const totalColumn = kind === 'views' ? 'view_count' : 'click_count';
  const statements = ids.flatMap((id) => [
    env.DB.prepare(`UPDATE ad_slots SET ${totalColumn} = ${totalColumn} + 1
      WHERE id = ? AND status = 'active' AND start_date <= ? AND end_date >= ?`).bind(id, now, now),
    env.DB.prepare(`INSERT INTO ad_daily (ad_id, date, views, clicks) VALUES (?, ?, ?, ?)
      ON CONFLICT(ad_id, date) DO UPDATE SET ${kind} = ${kind} + 1`)
      .bind(id, now, kind === 'views' ? 1 : 0, kind === 'clicks' ? 1 : 0),
  ]);
  await env.DB.batch(statements);
}

/** ランクだけを引く。出稿枠の判定で、掲示板ぜんぶを読まないため。 */
export async function getMemberRank(memberId: string) {
  await ensureDatabase();
  const row = await env.DB.prepare('SELECT intro_count AS introCount FROM members WHERE id = ?')
    .bind(memberId).first<{ introCount: number }>();
  const level = levelFor(Number(row?.introCount ?? 0));
  return { rank: rankName(level), level };
}

/** 出稿できるランクかどうか。紹介を積んだ人だけが買える。 */
/** 広告は会員なら誰でも買える。ランクで変わるのは値段（割引）だけ。 */
export function canBuyAdSlot() {
  return true;
}

// リンク先は http/https だけ。javascript: などを弾く。
function cleanAdLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString().slice(0, 300);
  } catch {
    return '';
  }
}
// --- トップバナーの出稿枠 ここまで ---------------------------------------------

// --- 機能改善の受け口 ここから ------------------------------------------------
// 会員が「こうしてほしい」を送れるようにする。運営はD1を見て拾う。
// 画像は受け取らない（保存も配信も増やさないため）。

export async function createFeedback(user: SessionUser, input: { category: FeedbackCategory; body: string }) {
  await upsertMember(user);
  const body = input.body.trim().slice(0, 1000);
  if (!body) throw new Error('内容を入力してください。');

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const sent = await env.DB.prepare('SELECT COUNT(*) AS count FROM feedback WHERE member_id = ? AND created_at >= ?')
    .bind(user.userId, dayAgo).first<{ count: number }>();
  if (Number(sent?.count ?? 0) >= FEEDBACK_PER_DAY) {
    throw new Error(`1日に送れるご意見は${FEEDBACK_PER_DAY}件までです。また明日お聞かせください。`);
  }

  await env.DB.prepare('INSERT INTO feedback (id, member_id, category, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.userId, input.category, body, 'new', new Date().toISOString()).run();
}

/** その会員がこれまでに送った件数。「届いています」と返すために使う。 */
export async function countFeedback(memberId: string) {
  await ensureDatabase();
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM feedback WHERE member_id = ?')
    .bind(memberId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}
// --- 機能改善の受け口 ここまで ------------------------------------------------

// --- 探しごとへのコメント ここから -----------------------------------------
// 紹介の前後で、投稿した人と答える人がその場でやり取りできるようにするための機能。
// ギブ側の行動なので、無料会員でも使える（docs/pricing-plan-ja.md）。

export type RequestComment = {
  id: string;
  requestId: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorCompany: string;
  authorVenue: string;
  authorAvatarUrl: string;
  authorFacebookUrl: string;
  isAuthorOfRequest: boolean;
};

export const COMMENT_MAX_LENGTH = 600;

export async function getRequestComments(requestId: string) {
  await ensureDatabase();
  const rows = await env.DB.prepare(`SELECT c.id, c.request_id AS requestId, c.body, c.created_at AS createdAt,
    m.id AS authorId, m.display_name AS authorName, m.company AS authorCompany, m.venue AS authorVenue,
    m.avatar_key AS authorAvatarKey, m.avatar_version AS authorAvatarVersion, m.facebook_url AS authorFacebookUrl,
    r.author_id AS requestAuthorId
    FROM request_comments c
    JOIN members m ON m.id = c.member_id
    JOIN requests r ON r.id = c.request_id
    WHERE c.request_id = ?
    ORDER BY c.created_at`).bind(requestId).all<Omit<RequestComment, 'authorAvatarUrl' | 'isAuthorOfRequest'> & { authorAvatarKey: string; authorAvatarVersion: number; requestAuthorId: string }>();

  return rows.results.map(({ authorAvatarKey, authorAvatarVersion, requestAuthorId, ...comment }) => ({
    ...comment,
    authorAvatarUrl: avatarUrl(comment.authorId, authorAvatarKey, authorAvatarVersion),
    isAuthorOfRequest: comment.authorId === requestAuthorId,
  }));
}

export async function addRequestComment(user: SessionUser, requestId: string, rawBody: string) {
  await upsertMember(user);
  const body = rawBody.trim().slice(0, COMMENT_MAX_LENGTH);
  if (!body) throw new Error('コメントを入力してください。');

  const request = await env.DB.prepare('SELECT id FROM requests WHERE id = ?').bind(requestId).first<{ id: string }>();
  if (!request) throw new Error('この探しごとは見つかりませんでした。');

  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO request_comments (id, request_id, member_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), requestId, user.userId, body, now).run();
  return getRequestComments(requestId);
}

export async function deleteRequestComment(user: SessionUser, commentId: string) {
  await ensureDatabase();
  // 自分が書いたコメントだけ消せる。
  const result = await env.DB.prepare('DELETE FROM request_comments WHERE id = ? AND member_id = ?')
    .bind(commentId, user.userId).run();
  if (!result.meta.changes) throw new Error('このコメントは削除できません。');
}
// --- 探しごとへのコメント ここまで -----------------------------------------

// --- プラン（無料 / 有料）ここから ------------------------------------------
// 会員かどうか（membership_status）と、お金を払っているか（plan）は別の軸。
// 判定そのものは app/entitlements.ts に置いてある。

export type PlanSummary = PlanState & { activePlan: Plan; paid: boolean; source: string;
  /** 契約しているプラン。特典を除いたもの。特典が切れたらここへ戻る。 */
  contracted: Plan;
  /** 招待特典で開いているプラン。無ければ free。 */
  bonus: Plan;
  requestsThisMonth: number; requestLimit: number; requestsLeft: number;
};

export async function getPlanState(memberId: string): Promise<PlanState> {
  await ensureDatabase();
  const row = await env.DB.prepare(`SELECT plan, plan_period_end AS planPeriodEnd,
      bonus_plan AS bonusPlan, bonus_period_end AS bonusPeriodEnd FROM members WHERE id = ?`)
    .bind(memberId).first<{ plan: string; planPeriodEnd: string; bonusPlan: string; bonusPeriodEnd: string }>();
  return {
    plan: toPlan(row?.plan), planPeriodEnd: row?.planPeriodEnd ?? '',
    bonusPlan: toPlan(row?.bonusPlan), bonusPeriodEnd: row?.bonusPeriodEnd ?? '',
  };
}

/**
 * 日本時間での「今月1日の0時」を、UTCの瞬間で返す。
 *
 * `requests.created_at` はUTCで入っているので、境目もUTCの値でないと比べられない。
 * 日本の9月1日0時は、UTCでは8月31日15時。
 */
export function monthStartUtc(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 3600_000).toISOString();
}

/**
 * 今月の投稿数。区切りは**カレンダーの月**で、入会日は関係ない。毎月1日に戻る。
 *
 * 数えるのは日本時間の月。もとは `new Date().toISOString().slice(0,7)` と
 * UTCで区切っていたので、日本の1日の0時〜8時59分に投稿しようとすると、
 * UTCではまだ前月の末日で**前の月の枠から引かれていた**。使う人から見ると
 * 「1日になったのに、まだ投稿できない」時間が毎月9時間あった。
 */
export async function countRequestsThisMonth(memberId: string) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM requests WHERE author_id = ? AND created_at >= ?')
    .bind(memberId, monthStartUtc()).first<{ count: number }>();
  return Number(row?.count ?? 0);
}


export async function getPlanSummary(memberId: string): Promise<PlanSummary> {
  const state = await getPlanState(memberId);
  const requestsThisMonth = await countRequestsThisMonth(memberId);
  const row = await env.DB.prepare('SELECT plan_source AS source FROM members WHERE id = ?')
    .bind(memberId).first<{ source: string }>();
  const cap = limits(state);
  return {
    ...state, activePlan: currentPlan(state), paid: isPaid(state), source: row?.source ?? '',
    contracted: contractedPlan(state), bonus: bonusPlan(state),
    requestsThisMonth, requestLimit: cap.requestsPerMonth, requestsLeft: remainingRequests(state, requestsThisMonth),
  };
}

/**
 * 無料月クレジット1件ぶん、招待特典のスタンダードを1ヶ月延ばす。
 * 契約しているプランとは別の列に書くので、あとで契約しても特典は消えない。
 * 特典が切れたら、契約しているプラン（無ければ無料）に戻る。
 */
async function grantProMonth(memberId: string) {
  const state = await getPlanState(memberId);
  await env.DB.prepare('UPDATE members SET bonus_plan = ?, bonus_period_end = ? WHERE id = ?')
    .bind('standard', extendedPlanEnd(state.bonusPeriodEnd ?? ''), memberId).run();
}
// --- プランここまで ---------------------------------------------------------

// --- Stripe と会員の対応づけ -------------------------------------------------
// 決済そのものは app/api/billing/ が扱う。ここは保存と読み出しだけ。

export type StripeLink = { customerId: string; subscriptionId: string; email: string; displayName: string; interval: BillingCycle };

export async function getStripeLink(memberId: string): Promise<StripeLink> {
  await ensureDatabase();
  const row = await env.DB.prepare(`SELECT stripe_customer_id AS customerId, stripe_subscription_id AS subscriptionId,
      email, display_name AS displayName, plan_interval AS interval FROM members WHERE id = ?`)
    .bind(memberId).first<StripeLink>();
  return {
    customerId: row?.customerId ?? '', subscriptionId: row?.subscriptionId ?? '',
    email: row?.email ?? '', displayName: row?.displayName ?? '',
    interval: toBillingCycle(row?.interval),
  };
}

export async function saveStripeCustomer(memberId: string, customerId: string) {
  await env.DB.prepare('UPDATE members SET stripe_customer_id = ? WHERE id = ?').bind(customerId, memberId).run();
}

/** Stripeの顧客IDから会員を引く。webhookは会員IDを持たないことがあるため。 */
export async function findMemberByStripeCustomer(customerId: string) {
  await ensureDatabase();
  const row = await env.DB.prepare('SELECT id FROM members WHERE stripe_customer_id = ?')
    .bind(customerId).first<{ id: string }>();
  return row?.id ?? '';
}

/**
 * Stripeの購読状態をこちらのプランに反映する。webhookからだけ呼ぶ。
 * 期限は Stripe が持っているので、こちらの plan_period_end は
 * 「いつまで使えるか」を写しておくだけ。解約されたら free に戻す。
 */
export async function applyStripeSubscription(input: {
  memberId: string; plan: Plan; cycle: BillingCycle; subscriptionId: string; periodEnd: string; active: boolean;
}) {
  await ensureDatabase();
  const plan = input.active ? input.plan : 'free';
  await env.DB.prepare(`UPDATE members SET plan = ?, plan_period_end = ?, plan_source = ?, stripe_subscription_id = ?, plan_interval = ?
    WHERE id = ?`)
    .bind(plan, input.active ? input.periodEnd : '', input.active ? 'stripe' : '', input.active ? input.subscriptionId : '',
      input.active ? input.cycle : 'month', input.memberId)
    .run();
}

/** 請求に当てていない無料月クレジットを、古い順に取り出す。 */
export async function unappliedReferralCredits(memberId: string) {
  await ensureDatabase();
  const rows = await env.DB.prepare(`SELECT id FROM referral_credits
    WHERE inviter_id = ? AND status = 'earned' AND applied_month = '' ORDER BY earned_at`)
    .bind(memberId).all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

/** 無料月クレジットを使ったことにする。二重に使わないため。 */
export async function markReferralCreditsApplied(ids: string[], month: string) {
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`UPDATE referral_credits SET applied_month = ? WHERE id IN (${placeholders})`)
    .bind(month, ...ids).run();
}
// --- Stripe ここまで ---------------------------------------------------------


// --- 会員紹介（招待）ここから -------------------------------------------------
// ルールは docs/referral-program-ja.md が正。
// 「紹介した人が入会して30日続いたら、紹介した人の会費が1ヶ月無料。通算6ヶ月まで」

export const REFERRAL_QUALIFY_DAYS = 30;
/** 1人が受け取れる無料月の合計。年ごとではなく、通算の上限。 */
export const REFERRAL_CAP_TOTAL = 6;

export type ReferralSummary = {
  code: string;
  invitedCount: number;      // 招待リンクから登録した人の数
  waitingCount: number;      // 利用を止めている人（承認待ちは廃止したので通常は0）
  activeCount: number;       // 承認されて利用中
  qualifyingCount: number;   // 利用中だが30日に届いていない
  earnedMonths: number;      // 無料になった月の数（年の上限内）
  waitingCredits: number;    // 資格は満たしたが、年の枠が空くのを待っているぶん
  appliedMonths: number;     // 運営が請求で使い終わったぶん
  remaining: number;         // あと何ヶ月ぶん受け取れるか（通算）
  capTotal: number;
  qualifyDays: number;
};

const inviteAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomInviteCode() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => inviteAlphabet[byte % inviteAlphabet.length]).join('');
}

/** 会員の招待コード。無ければ作る。 */
export async function getOrCreateInviteCode(memberId: string) {
  await ensureDatabase();
  const existing = await env.DB.prepare('SELECT invite_code AS inviteCode FROM members WHERE id = ?')
    .bind(memberId).first<{ inviteCode: string }>();
  if (existing?.inviteCode) return existing.inviteCode;

  // 衝突しても致命的ではないが、念のため空いているコードを探す。
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomInviteCode();
    const taken = await env.DB.prepare('SELECT id FROM members WHERE invite_code = ?').bind(code).first<{ id: string }>();
    if (taken) continue;
    await env.DB.prepare('UPDATE members SET invite_code = ? WHERE id = ? AND invite_code = \'\'').bind(code, memberId).run();
    const saved = await env.DB.prepare('SELECT invite_code AS inviteCode FROM members WHERE id = ?')
      .bind(memberId).first<{ inviteCode: string }>();
    if (saved?.inviteCode) return saved.inviteCode;
  }
  throw new Error('招待リンクを作れませんでした。');
}

/** 招待コードの持ち主。利用中の会員でなければ招待は無効。 */
export async function findInviterByCode(code: string) {
  await ensureDatabase();
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  const inviter = await env.DB.prepare(`SELECT id, display_name AS displayName, venue, company, membership_status AS status
    FROM members WHERE invite_code = ?`).bind(trimmed).first<{ id: string; displayName: string; venue: string; company: string; status: MembershipStatus }>();
  if (!inviter || inviter.status !== 'active') return null;
  return inviter;
}

/**
 * 招待リンクから来た人を登録する。ここでは利用権限を与えない。
 * 運営が `active` にするまでは `invited` のまま。招待でゲートを緩めない。
 */
/**
 * 先行テストの枠。**先着50名まで、Googleでログインした人をそのまま会員にする。**
 *
 * 立ち上げのあいだ、運営が1人ずつD1へ入れて回るのは現実的ではない。
 * かといって誰でも入れるようにはできないので、人数で上限を切る。
 * 枠が埋まったら、この経路は自動的に閉じる（招待リンク経由だけが残る）。
 *
 * 数えるのは `membership_source = 'early_access'` の行だけ。運営が手で入れた
 * 会員や、招待から入った会員は枠を消費しない。
 */
export const EARLY_ACCESS_LIMIT = 50;

export async function earlyAccessCount() {
  await ensureDatabase();
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM members WHERE membership_source = 'early_access'")
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

/**
 * 先行枠でそのまま会員にする。枠が埋まっていれば null を返す。
 * すでに会員なら、ここは呼ばれない（先に startMemberSessionByEmail が通る）。
 */
export async function registerEarlyAccessMember(rawEmail: string, displayName: string) {
  await ensureDatabase();
  const email = normalizeAuthEmail(rawEmail);
  if (!email) return null;
  if (await earlyAccessCount() >= EARLY_ACCESS_LIMIT) return null;

  const now = new Date().toISOString();
  // 競り合って51人目が入らないよう、枠の数を条件に入れてから書く。
  const result = await env.DB.prepare(`INSERT INTO members (id, email, display_name, membership_status, membership_source, activated_at, created_at)
    SELECT ?, ?, ?, 'active', 'early_access', ?, ?
    WHERE (SELECT COUNT(*) FROM members WHERE membership_source = 'early_access') < ?
      AND NOT EXISTS (SELECT 1 FROM members WHERE email = ?)`)
    .bind(`early-${crypto.randomUUID()}`, email, displayName.trim() || email.split('@')[0], now, now, EARLY_ACCESS_LIMIT, email)
    .run();
  return result.meta.changes > 0 ? { email } : null;
}

export async function registerInvitedMember(rawEmail: string, displayName: string, code: string) {
  await ensureDatabase();
  const email = rawEmail.trim().toLowerCase();
  const inviter = await findInviterByCode(code);
  if (!email || !inviter) return null;

  const existing = await env.DB.prepare('SELECT id, invited_by AS invitedBy FROM members WHERE email = ?')
    .bind(email).first<{ id: string; invitedBy: string }>();
  if (existing) {
    // すでに会員なら紹介は付けない。既存会員の付け替えを防ぐ。
    return { alreadyMember: true, inviterName: inviter.displayName };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO members (id, email, display_name, membership_status, invited_by, activated_at, created_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?)`)
    .bind(`invited-${crypto.randomUUID()}`, email, displayName.trim() || email.split('@')[0], inviter.id, now, now).run();
  return { alreadyMember: false, inviterName: inviter.displayName };
}

/**
 * 紹介の資格を判定して、無料月を確定させる。何度呼んでも同じ結果になる。
 * - `activated_at` が空の利用中会員には、気づいた時点の日付を入れる（運営が手で入れてもよい）
 * - 利用中かつ `REFERRAL_QUALIFY_DAYS` 日を超えた招待者ぶんだけ確定する
 * - 年の上限を超えたぶんは `capped` として記録し、無料月にはしない
 */
async function reconcileReferralCredits(inviterId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  await env.DB.prepare(`UPDATE members SET activated_at = ? WHERE membership_status = 'active' AND activated_at = ''`)
    .bind(nowIso).run();

  // 1. 資格を満たした招待は、まず「順番待ち」として記録する。ここで枠の判定はしない。
  const qualifiedBefore = new Date(now.getTime() - REFERRAL_QUALIFY_DAYS * 86400000).toISOString();
  const pending = await env.DB.prepare(`SELECT m.id
    FROM members m
    LEFT JOIN referral_credits c ON c.invitee_id = m.id
    WHERE m.invited_by = ? AND m.membership_status = 'active' AND m.activated_at != '' AND m.activated_at <= ?
      AND c.id IS NULL
    ORDER BY m.activated_at`).bind(inviterId, qualifiedBefore).all<{ id: string }>();
  if (pending.results.length) {
    await env.DB.batch(pending.results.map(({ id }) =>
      env.DB.prepare(`INSERT OR IGNORE INTO referral_credits (id, inviter_id, invitee_id, status, earned_at, created_at)
        VALUES (?, ?, ?, 'waiting', '', ?)`).bind(crypto.randomUUID(), inviterId, id, nowIso)));
  }

  // 2. 通算の上限に余りがあれば、古い順番待ちから確定させる。使い切ったらそこまで。
  const earnedRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM referral_credits
    WHERE inviter_id = ? AND status = 'earned'`).bind(inviterId).first<{ count: number }>();
  const free = REFERRAL_CAP_TOTAL - Number(earnedRow?.count ?? 0);
  if (free <= 0) return;

  const waiting = await env.DB.prepare(`SELECT id FROM referral_credits
    WHERE inviter_id = ? AND status = 'waiting' ORDER BY created_at LIMIT ?`)
    .bind(inviterId, free).all<{ id: string }>();
  if (!waiting.results.length) return;

  await env.DB.batch(waiting.results.map(({ id }) =>
    env.DB.prepare("UPDATE referral_credits SET status = 'earned', earned_at = ? WHERE id = ?").bind(nowIso, id)));

  // 3. 無料会員には、その場で有料機能を1ヶ月ぶん開ける。試してもらうのがいちばんの入口になる。
  //    有料会員のぶんは請求で引くので、ここでは何もしない（applied_month が空のまま運営が使う）。
  if (!hasPaidContract(await getPlanState(inviterId))) {
    for (let index = 0; index < waiting.results.length; index += 1) await grantProMonth(inviterId);
    await env.DB.prepare(`UPDATE referral_credits SET applied_month = ?
      WHERE inviter_id = ? AND status = 'earned' AND applied_month = ''`)
      .bind(nowIso.slice(0, 7), inviterId).run();
  }
}

/**
 * 招待の資格判定と、特典プランの付与をその場で走らせる。
 * 何度呼んでも結果は同じ。運営の手作業は要らない。
 *
 * 招待画面を開かない会員も取りこぼさないように、「いま何が使えるか」を
 * 聞かれるところ（/api/entitlements）からも呼んでいる。
 */
export async function syncReferralBenefits(memberId: string) {
  await ensureDatabase();
  await reconcileReferralCredits(memberId);
}

export async function getReferralSummary(memberId: string): Promise<ReferralSummary> {
  await ensureDatabase();
  const code = await getOrCreateInviteCode(memberId);
  await reconcileReferralCredits(memberId);

  const qualifiedBefore = new Date(Date.now() - REFERRAL_QUALIFY_DAYS * 86400000).toISOString();
  const counts = await env.DB.prepare(`SELECT
      COUNT(*) AS invitedCount,
      SUM(CASE WHEN membership_status NOT IN ('active', 'past_due') THEN 1 ELSE 0 END) AS waitingCount,
      SUM(CASE WHEN membership_status = 'active' THEN 1 ELSE 0 END) AS activeCount,
      SUM(CASE WHEN membership_status = 'active' AND (activated_at = '' OR activated_at > ?) THEN 1 ELSE 0 END) AS qualifyingCount
    FROM members WHERE invited_by = ?`).bind(qualifiedBefore, memberId).first<Record<string, number>>();

  const credits = await env.DB.prepare(`SELECT
      SUM(CASE WHEN status = 'earned' THEN 1 ELSE 0 END) AS earnedMonths,
      SUM(CASE WHEN status IN ('waiting', 'capped') THEN 1 ELSE 0 END) AS waitingCredits,
      SUM(CASE WHEN status = 'earned' AND applied_month != '' THEN 1 ELSE 0 END) AS appliedMonths
    FROM referral_credits WHERE inviter_id = ?`).bind(memberId).first<Record<string, number>>();

  const earnedTotal = Number(credits?.earnedMonths ?? 0);
  return {
    code,
    invitedCount: Number(counts?.invitedCount ?? 0),
    waitingCount: Number(counts?.waitingCount ?? 0),
    activeCount: Number(counts?.activeCount ?? 0),
    qualifyingCount: Number(counts?.qualifyingCount ?? 0),
    earnedMonths: Number(credits?.earnedMonths ?? 0),
    waitingCredits: Number(credits?.waitingCredits ?? 0),
    appliedMonths: Number(credits?.appliedMonths ?? 0),
    remaining: Math.max(0, REFERRAL_CAP_TOTAL - earnedTotal),
    capTotal: REFERRAL_CAP_TOTAL,
    qualifyDays: REFERRAL_QUALIFY_DAYS,
  };
}
// --- 会員紹介（招待）ここまで -------------------------------------------------
