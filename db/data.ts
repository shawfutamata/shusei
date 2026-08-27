import { env } from 'cloudflare:workers';
import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { matchesIndustry } from '@/app/industry-options';

export type BoardRequest = {
  id: string;
  category: 'project' | 'collaboration' | 'consultation';
  title: string;
  description: string;
  budgetLabel: string;
  area: string;
  industryTags: string[];
  deadline: string;
  status: string;
  createdAt: string;
  authorName: string;
  authorCompany: string;
  authorVenue: string;
  authorPositionTitle: string;
  authorBadge: string;
  authorBusinessArea: string;
  authorRevenueBand: string;
  authorAvatarUrl: string;
  introCount: number;
};

export type MemberStats = {
  displayName: string;
  venue: string;
  company: string;
  positionTitle: string;
  badge: string;
  businessArea: string;
  primaryIndustry: string;
  notifyIndustries: string[];
  annualRevenueBand: string;
  avatarUrl: string;
  introCount: number;
  receivedIntroCount: number;
  dealCount: number;
  points: number;
  rank: string;
  level: number;
  nextRankAt: number;
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

export type BusinessCard = {
  id: string;
  name: string;
  company: string;
  positionTitle: string;
  department: string;
  phone: string;
  mobile: string;
  email: string;
  postalCode: string;
  address: string;
  website: string;
  memo: string;
  groupName: string;
  exchangeDate: string;
  isFavorite: boolean;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessCardInput = Omit<BusinessCard, 'id' | 'imageUrl' | 'createdAt' | 'updatedAt' | 'isFavorite'> & { isFavorite?: boolean };

const statements = [
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    venue TEXT NOT NULL DEFAULT 'ひるのめぐろ会場',
    company TEXT NOT NULL DEFAULT '',
    position_title TEXT NOT NULL DEFAULT '',
    badge TEXT NOT NULL DEFAULT '',
    business_area TEXT NOT NULL DEFAULT '',
    primary_industry TEXT NOT NULL DEFAULT '',
    notify_industries TEXT NOT NULL DEFAULT '[]',
    annual_revenue_band TEXT NOT NULL DEFAULT '',
    avatar_key TEXT NOT NULL DEFAULT '',
    avatar_version INTEGER NOT NULL DEFAULT 0,
    intro_count INTEGER NOT NULL DEFAULT 0,
    deal_count INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
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
  `CREATE TABLE IF NOT EXISTS business_cards (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES members(id),
    name TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    position_title TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    group_name TEXT NOT NULL DEFAULT '',
    exchange_date TEXT NOT NULL,
    image_key TEXT NOT NULL,
    image_content_type TEXT NOT NULL,
    image_version INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_requests_status_created_at ON requests(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category)',
  'CREATE INDEX IF NOT EXISTS idx_introductions_introducer_id ON introductions(introducer_id)',
  'CREATE INDEX IF NOT EXISTS idx_introductions_request_id ON introductions(request_id)',
  'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member_id ON push_subscriptions(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_mobile_sessions_member_id ON mobile_sessions(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_mobile_sessions_expires_at ON mobile_sessions(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_member_id ON mobile_push_tokens(member_id)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_events_owner_date ON attendance_events(owner_id, meeting_date)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_people_event_id ON attendance_people(event_id)',
  'CREATE INDEX IF NOT EXISTS idx_attendance_people_owner_important ON attendance_people(owner_id, is_important)',
  'CREATE INDEX IF NOT EXISTS idx_business_cards_owner_date ON business_cards(owner_id, exchange_date)',
  'CREATE INDEX IF NOT EXISTS idx_business_cards_owner_favorite ON business_cards(owner_id, is_favorite)',
];

let initialized = false;

export async function ensureDatabase() {
  if (initialized) return;
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  const memberColumns = await env.DB.prepare('PRAGMA table_info(members)').all<{ name: string }>();
  const existingColumns = new Set(memberColumns.results.map((column) => column.name));
  const missingColumns = [
    ['position_title', "ALTER TABLE members ADD COLUMN position_title TEXT NOT NULL DEFAULT ''"],
    ['badge', "ALTER TABLE members ADD COLUMN badge TEXT NOT NULL DEFAULT ''"],
    ['business_area', "ALTER TABLE members ADD COLUMN business_area TEXT NOT NULL DEFAULT ''"],
    ['primary_industry', "ALTER TABLE members ADD COLUMN primary_industry TEXT NOT NULL DEFAULT ''"],
    ['notify_industries', "ALTER TABLE members ADD COLUMN notify_industries TEXT NOT NULL DEFAULT '[]'"],
    ['annual_revenue_band', "ALTER TABLE members ADD COLUMN annual_revenue_band TEXT NOT NULL DEFAULT ''"],
    ['avatar_key', "ALTER TABLE members ADD COLUMN avatar_key TEXT NOT NULL DEFAULT ''"],
    ['avatar_version', 'ALTER TABLE members ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [columnName, sql] of missingColumns) {
    if (!existingColumns.has(columnName)) await env.DB.prepare(sql).run();
  }
  const requestColumns = await env.DB.prepare('PRAGMA table_info(requests)').all<{ name: string }>();
  if (!requestColumns.results.some((column) => column.name === 'industry_tags')) {
    await env.DB.prepare("ALTER TABLE requests ADD COLUMN industry_tags TEXT NOT NULL DEFAULT '[]'").run();
  }
  await seedDemoData();
  await env.DB.batch([
    env.DB.prepare("UPDATE members SET annual_revenue_band = 'revenue_30_70' WHERE id = 'demo-tanaka' AND annual_revenue_band = ''"),
    env.DB.prepare("UPDATE members SET annual_revenue_band = 'revenue_70_100' WHERE id = 'demo-sato' AND annual_revenue_band = ''"),
    env.DB.prepare("UPDATE members SET position_title = '代表取締役', badge = '赤', business_area = '東京都' WHERE id = 'demo-tanaka' AND business_area = ''"),
    env.DB.prepare("UPDATE members SET position_title = 'オーナー', badge = '緑', business_area = '東京都' WHERE id = 'demo-sato' AND business_area = ''"),
    env.DB.prepare("UPDATE members SET badge = '赤' WHERE badge IN ('赤バッヂ', '赤バッジ')"),
    env.DB.prepare("UPDATE members SET badge = '緑' WHERE badge IN ('緑バッヂ', '緑バッジ')"),
    env.DB.prepare("UPDATE members SET badge = '' WHERE badge NOT IN ('', '緑', '赤', 'ゴールド', 'ダイヤモンド')"),
    env.DB.prepare("UPDATE members SET primary_industry = '人材・教育', notify_industries = '[\"人材・教育\",\"映像・写真\",\"Web・広告\"]' WHERE id = 'demo-tanaka' AND primary_industry = ''"),
    env.DB.prepare("UPDATE members SET primary_industry = '美容・健康', notify_industries = '[\"美容・健康\",\"デザイン・印刷\",\"建設・不動産\"]' WHERE id = 'demo-sato' AND primary_industry = ''"),
    env.DB.prepare("UPDATE requests SET industry_tags = '[\"映像・写真\",\"Web・広告\"]' WHERE id = 'request-video-partner' AND industry_tags = '[]'"),
    env.DB.prepare("UPDATE requests SET industry_tags = '[\"美容・健康\",\"建設・不動産\"]' WHERE id = 'request-salon-designer' AND industry_tags = '[]'"),
  ]);
  initialized = true;
}

export async function requestMobileAuthCode(rawEmail: string) {
  await ensureDatabase();
  const email = normalizeAuthEmail(rawEmail);
  if (!email) throw new Error('正しいメールアドレスを入力してください。');

  const existing = await env.DB.prepare('SELECT requested_at AS requestedAt FROM mobile_auth_codes WHERE email = ?')
    .bind(email).first<{ requestedAt: string }>();
  if (existing && Date.now() - new Date(existing.requestedAt).getTime() < 60_000) {
    throw new Error('認証コードは1分後に再送できます。');
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  const codeHash = await hashMobileSecret(`${email}:${code}`);
  await env.DB.prepare(`INSERT INTO mobile_auth_codes (email, code_hash, expires_at, requested_at, attempts)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      requested_at = excluded.requested_at, attempts = 0`)
    .bind(email, codeHash, expiresAt, now.toISOString()).run();

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

  let member = await env.DB.prepare('SELECT id, display_name AS displayName FROM members WHERE email = ?')
    .bind(email).first<{ id: string; displayName: string }>();
  if (!member) {
    member = { id: `mobile-${crypto.randomUUID()}`, displayName: email.split('@')[0] };
    await env.DB.prepare('INSERT INTO members (id, email, display_name, venue, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(member.id, email, member.displayName, '', new Date().toISOString()).run();
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
  return { token, expiresAt, user: { userId: member.id, email, displayName: member.displayName, fullName: member.displayName } satisfies ChatGPTUser };
}

export async function getMobileSessionUser(token: string): Promise<ChatGPTUser | null> {
  await ensureDatabase();
  if (token.length < 32 || token.length > 256) return null;
  const tokenHash = await hashMobileSecret(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`SELECT m.id AS userId, m.email, m.display_name AS displayName,
    s.expires_at AS expiresAt FROM mobile_sessions s JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(tokenHash, now)
    .first<{ userId: string; email: string; displayName: string; expiresAt: string }>();
  if (!row) return null;
  await env.DB.prepare('UPDATE mobile_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  return { userId: row.userId, email: row.email, displayName: row.displayName, fullName: row.displayName };
}

export async function revokeMobileSession(token: string) {
  await ensureDatabase();
  if (token.length < 32 || token.length > 256) return;
  await env.DB.prepare('DELETE FROM mobile_sessions WHERE token_hash = ?').bind(await hashMobileSecret(token)).run();
}

export async function saveMobilePushToken(user: ChatGPTUser, token: string, platform: string) {
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

export async function deleteMobilePushToken(user: ChatGPTUser, token: string) {
  await ensureDatabase();
  await env.DB.prepare('DELETE FROM mobile_push_tokens WHERE token = ? AND member_id = ?')
    .bind(token, user.userId).run();
}

export async function deleteMobileAccount(user: ChatGPTUser) {
  await ensureDatabase();
  const member = await env.DB.prepare('SELECT avatar_key AS avatarKey FROM members WHERE id = ?')
    .bind(user.userId).first<{ avatarKey: string }>();
  if (!member) return;
  const cardImages = await env.DB.prepare('SELECT image_key AS imageKey FROM business_cards WHERE owner_id = ?')
    .bind(user.userId).all<{ imageKey: string }>();
  const eventIds = await env.DB.prepare('SELECT id FROM attendance_events WHERE owner_id = ?')
    .bind(user.userId).all<{ id: string }>();
  const requestIds = await env.DB.prepare('SELECT id FROM requests WHERE author_id = ?')
    .bind(user.userId).all<{ id: string }>();
  const statementsToDelete = [
    ...requestIds.results.map(({ id }) => env.DB.prepare('DELETE FROM introductions WHERE request_id = ?').bind(id)),
    ...eventIds.results.map(({ id }) => env.DB.prepare('DELETE FROM attendance_people WHERE event_id = ?').bind(id)),
    env.DB.prepare('DELETE FROM introductions WHERE introducer_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM push_subscriptions WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM mobile_push_tokens WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM mobile_sessions WHERE member_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM business_cards WHERE owner_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM attendance_people WHERE owner_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM attendance_events WHERE owner_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM requests WHERE author_id = ?').bind(user.userId),
    env.DB.prepare('DELETE FROM mobile_auth_codes WHERE email = ?').bind(user.email.toLowerCase()),
    env.DB.prepare('DELETE FROM members WHERE id = ?').bind(user.userId),
  ];
  await env.DB.batch(statementsToDelete);
  const objectKeys = [member.avatarKey, ...cardImages.results.map(({ imageKey }) => imageKey)].filter(Boolean);
  await Promise.allSettled(objectKeys.map((key) => env.AVATARS.delete(key)));
}

function normalizeAuthEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

async function hashMobileSecret(value: string) {
  if (!env.AUTH_CODE_PEPPER) throw new Error('認証用の秘密鍵が未設定です。');
  const bytes = new TextEncoder().encode(`${value}:${env.AUTH_CODE_PEPPER}`);
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

async function seedDemoData() {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM requests').first<{ count: number }>();
  if (Number(row?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO members (id, email, display_name, venue, company, intro_count, deal_count, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('demo-tanaka', 'tanaka@example.jp', '田中 美咲', 'ひるのめぐろ会場', '株式会社ミナト｜採用支援', 11, 4, 520, now),
    env.DB.prepare('INSERT OR IGNORE INTO members (id, email, display_name, venue, company, intro_count, deal_count, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('demo-sato', 'sato@example.jp', '佐藤 健一', '渋谷会場', 'SATO HAIR｜美容室経営', 6, 2, 260, now),
  ]);

  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO requests (id, author_id, category, title, description, budget_label, area, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('request-video-partner', 'demo-tanaka', 'collaboration', '店舗の採用課題を一緒に解決できる、動画制作会社を探しています', '飲食店向けの採用支援をしています。採用SNSの企画から撮影・編集まで、長く組める制作パートナーと出会いたいです。', '月額 20〜40万円', '東京都・オンライン', '2026-09-30', 'open', '2026-08-27T09:00:00.000Z'),
    env.DB.prepare('INSERT OR IGNORE INTO requests (id, author_id, category, title, description, budget_label, area, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('request-salon-designer', 'demo-sato', 'project', '10月オープン予定の美容室に強い、内装デザイナーを探しています', '恵比寿の18坪の物件です。動線設計と照明にこだわりたいので、美容室の実績がある方をご紹介ください。', '300〜450万円', '東京都', '2026-09-10', 'open', '2026-08-26T10:30:00.000Z'),
  ]);
}

export async function upsertMember(user: ChatGPTUser) {
  await ensureDatabase();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO members (id, email, display_name, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name`).bind(user.userId, user.email, user.displayName, now).run();
}

export async function getBoardData(user: ChatGPTUser) {
  await upsertMember(user);
  const requestsResult = await env.DB.prepare(`SELECT r.id, r.category, r.title, r.description,
    r.budget_label AS budgetLabel, r.area, r.industry_tags AS industryTagsJson,
    r.deadline, r.status, r.created_at AS createdAt,
    m.display_name AS authorName, m.company AS authorCompany, m.venue AS authorVenue,
    m.position_title AS authorPositionTitle, m.badge AS authorBadge,
    m.business_area AS authorBusinessArea,
    m.annual_revenue_band AS authorRevenueBand,
    m.id AS authorId, m.avatar_key AS authorAvatarKey, m.avatar_version AS authorAvatarVersion,
    COUNT(i.id) AS introCount
    FROM requests r
    JOIN members m ON m.id = r.author_id
    LEFT JOIN introductions i ON i.request_id = r.id
    WHERE r.status = 'open'
    GROUP BY r.id
    ORDER BY r.created_at DESC`).all<Omit<BoardRequest, 'industryTags'> & { industryTagsJson: string; authorId: string; authorAvatarKey: string; authorAvatarVersion: number }>();

  const member = await env.DB.prepare(`SELECT display_name AS displayName, venue, company,
    position_title AS positionTitle, badge, business_area AS businessArea,
    primary_industry AS primaryIndustry, notify_industries AS notifyIndustriesJson,
    annual_revenue_band AS annualRevenueBand,
    avatar_key AS avatarKey, avatar_version AS avatarVersion,
    intro_count AS introCount, deal_count AS dealCount, points,
    (SELECT COUNT(*) FROM introductions i JOIN requests r ON r.id = i.request_id
      WHERE r.author_id = members.id) AS receivedIntroCount
    FROM members WHERE id = ?`).bind(user.userId).first<Omit<MemberStats, 'rank' | 'level' | 'nextRankAt' | 'avatarUrl' | 'notifyIndustries'> & { notifyIndustriesJson: string; avatarKey: string; avatarVersion: number }>();

  const baseMember = member ?? { displayName: user.displayName, venue: 'ひるのめぐろ会場', company: '', positionTitle: '', badge: '', businessArea: '', primaryIndustry: '', notifyIndustriesJson: '[]', annualRevenueBand: '', avatarKey: '', avatarVersion: 0, introCount: 0, receivedIntroCount: 0, dealCount: 0, points: 0 };
  const { notifyIndustriesJson, ...memberFields } = baseMember;
  const stats = calculateRank({ ...memberFields, notifyIndustries: parseStringArray(notifyIndustriesJson), avatarUrl: avatarUrl(user.userId, baseMember.avatarKey, baseMember.avatarVersion) });
  const requests = requestsResult.results.map(({ authorId, authorAvatarKey, authorAvatarVersion, industryTagsJson, ...request }) => ({
    ...request,
    industryTags: parseStringArray(industryTagsJson),
    authorAvatarUrl: avatarUrl(authorId, authorAvatarKey, authorAvatarVersion),
  }));
  return { requests, stats };
}

export async function updateMemberProfile(user: ChatGPTUser, input: { company: string; venue: string; positionTitle: string; badge: string; businessArea: string; primaryIndustry: string; notifyIndustries: string[]; annualRevenueBand: string; avatar?: { bytes: ArrayBuffer; contentType: string } }) {
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
  await env.DB.prepare(`UPDATE members SET company = ?, venue = ?, position_title = ?, badge = ?,
    business_area = ?, primary_industry = ?, notify_industries = ?, annual_revenue_band = ?,
    avatar_key = ?, avatar_version = ? WHERE id = ?`)
    .bind(input.company, input.venue, input.positionTitle, input.badge, input.businessArea,
      input.primaryIndustry, JSON.stringify(input.notifyIndustries), input.annualRevenueBand, avatarKey, avatarVersion, user.userId).run();
  return avatarUrl(user.userId, avatarKey, avatarVersion);
}

export async function createRequest(user: ChatGPTUser, input: { category: string; title: string; description: string; budgetLabel: string; area: string; industryTags: string[]; deadline: string; }) {
  await upsertMember(user);
  await requireFacePhoto(user.userId);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO requests (id, author_id, category, title, description, budget_label, area, industry_tags, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.userId, input.category, input.title, input.description, input.budgetLabel, input.area, JSON.stringify(input.industryTags), input.deadline, 'open', createdAt).run();
  await sendMatchingPushNotifications(user.userId, { id, title: input.title, industryTags: input.industryTags }).catch(() => undefined);
  await sendMatchingMobileNotifications(user.userId, { id, title: input.title, industryTags: input.industryTags }).catch(() => undefined);
  return id;
}

export async function savePushSubscription(user: ChatGPTUser, subscription: PushSubscription) {
  await upsertMember(user);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh,
      auth = excluded.auth, updated_at = excluded.updated_at`)
    .bind(subscription.endpoint, user.userId, subscription.keys.p256dh, subscription.keys.auth, now, now).run();
}

export async function deletePushSubscription(user: ChatGPTUser, endpoint: string) {
  await upsertMember(user);
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND member_id = ?').bind(endpoint, user.userId).run();
}

export async function createIntroduction(user: ChatGPTUser, input: { requestId: string; personName: string; personCompany: string; relationship: string; fitReason: string; }) {
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

export async function getReceivedIntroductions(user: ChatGPTUser) {
  await upsertMember(user);
  const result = await env.DB.prepare(`SELECT i.id, i.request_id AS requestId, r.title AS requestTitle,
    r.category AS requestCategory, i.person_name AS personName, i.person_company AS personCompany,
    i.relationship, i.fit_reason AS fitReason, i.status, i.created_at AS createdAt,
    m.display_name AS introducerName, m.company AS introducerCompany, m.venue AS introducerVenue,
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

export async function getMemberAvatar(memberId: string) {
  await ensureDatabase();
  const member = await env.DB.prepare('SELECT avatar_key AS avatarKey FROM members WHERE id = ?')
    .bind(memberId).first<{ avatarKey: string }>();
  if (!member?.avatarKey) return null;
  return env.AVATARS.get(member.avatarKey);
}

export async function getAttendanceData(user: ChatGPTUser) {
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

export async function createAttendanceEvent(user: ChatGPTUser, input: {
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

export async function updateAttendancePerson(user: ChatGPTUser, input: {
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

export async function getBusinessCards(user: ChatGPTUser) {
  await upsertMember(user);
  const result = await env.DB.prepare(`SELECT id, name, company, position_title AS positionTitle,
    department, phone, mobile, email, postal_code AS postalCode, address, website, memo,
    group_name AS groupName, exchange_date AS exchangeDate, is_favorite AS isFavorite,
    image_version AS imageVersion, created_at AS createdAt, updated_at AS updatedAt
    FROM business_cards WHERE owner_id = ? ORDER BY exchange_date DESC, created_at DESC`)
    .bind(user.userId).all<Omit<BusinessCard, 'imageUrl' | 'isFavorite'> & { isFavorite: number; imageVersion: number }>();
  return result.results.map(({ imageVersion, ...card }) => ({
    ...card,
    isFavorite: Boolean(card.isFavorite),
    imageUrl: businessCardImageUrl(card.id, imageVersion),
  }));
}

export async function createBusinessCards(user: ChatGPTUser, inputs: Array<{ card: BusinessCardInput; image: { bytes: ArrayBuffer; contentType: string } }>) {
  await upsertMember(user);
  if (!inputs.length || inputs.length > 20) throw new Error('名刺は1回につき1〜20枚まで保存できます。');
  const createdAt = new Date().toISOString();
  const rows = [] as Array<{ id: string; imageKey: string; imageVersion: number; card: BusinessCardInput; contentType: string }>;
  for (const item of inputs) {
    const id = crypto.randomUUID();
    const imageKey = `business-cards/${user.userId}/${id}`;
    const imageVersion = Date.now();
    await env.AVATARS.put(imageKey, item.image.bytes, {
      httpMetadata: { contentType: item.image.contentType },
      customMetadata: { ownerId: user.userId, cardId: id },
    });
    rows.push({ id, imageKey, imageVersion, card: item.card, contentType: item.image.contentType });
  }
  try {
    await env.DB.batch(rows.map(({ id, imageKey, imageVersion, card, contentType }) => env.DB.prepare(`INSERT INTO business_cards
      (id, owner_id, name, company, position_title, department, phone, mobile, email, postal_code,
       address, website, memo, group_name, exchange_date, image_key, image_content_type, image_version,
       is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, user.userId, card.name, card.company, card.positionTitle, card.department, card.phone,
        card.mobile, card.email, card.postalCode, card.address, card.website, card.memo, card.groupName,
        card.exchangeDate, imageKey, contentType, imageVersion, card.isFavorite ? 1 : 0, createdAt, createdAt)));
  } catch (error) {
    await Promise.all(rows.map(({ imageKey }) => env.AVATARS.delete(imageKey)));
    throw error;
  }
  return rows.map(({ id, imageVersion }) => ({ id, imageUrl: businessCardImageUrl(id, imageVersion) }));
}

export async function updateBusinessCard(user: ChatGPTUser, input: BusinessCardInput & { id: string }) {
  await upsertMember(user);
  const updatedAt = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE business_cards SET name = ?, company = ?, position_title = ?,
    department = ?, phone = ?, mobile = ?, email = ?, postal_code = ?, address = ?, website = ?, memo = ?,
    group_name = ?, exchange_date = ?, is_favorite = ?, updated_at = ? WHERE id = ? AND owner_id = ?`)
    .bind(input.name, input.company, input.positionTitle, input.department, input.phone, input.mobile,
      input.email, input.postalCode, input.address, input.website, input.memo, input.groupName,
      input.exchangeDate, input.isFavorite ? 1 : 0, updatedAt, input.id, user.userId).run();
  if (!result.meta.changes) throw new Error('対象の名刺が見つかりません。');
}

export async function deleteBusinessCard(user: ChatGPTUser, id: string) {
  await upsertMember(user);
  const card = await env.DB.prepare('SELECT image_key AS imageKey FROM business_cards WHERE id = ? AND owner_id = ?')
    .bind(id, user.userId).first<{ imageKey: string }>();
  if (!card) throw new Error('対象の名刺が見つかりません。');
  await env.DB.prepare('DELETE FROM business_cards WHERE id = ? AND owner_id = ?').bind(id, user.userId).run();
  await env.AVATARS.delete(card.imageKey);
}

export async function getBusinessCardImage(user: ChatGPTUser, id: string) {
  await upsertMember(user);
  const card = await env.DB.prepare(`SELECT image_key AS imageKey FROM business_cards WHERE id = ? AND owner_id = ?`)
    .bind(id, user.userId).first<{ imageKey: string }>();
  return card?.imageKey ? env.AVATARS.get(card.imageKey) : null;
}

async function requireFacePhoto(memberId: string) {
  const member = await env.DB.prepare('SELECT avatar_key AS avatarKey FROM members WHERE id = ?')
    .bind(memberId).first<{ avatarKey: string }>();
  if (!member?.avatarKey) throw new Error('投稿・紹介の前に、プロフィールへ顔写真を登録してください。');
}

function avatarUrl(memberId: string, avatarKey: string, avatarVersion: number) {
  return avatarKey ? `/api/avatar/${encodeURIComponent(memberId)}?v=${avatarVersion}` : '';
}

function businessCardImageUrl(id: string, version: number) {
  return `/api/business-cards/${encodeURIComponent(id)}/image?v=${version}`;
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
    const response = await fetch(subscription.endpoint, payload);
    if (response.status === 404 || response.status === 410) expiredEndpoints.push(subscription.endpoint);
  }));
  if (expiredEndpoints.length) {
    await env.DB.batch(expiredEndpoints.map((endpoint) => env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint)));
  }
}

async function sendMatchingMobileNotifications(authorId: string, request: { id: string; title: string; industryTags: string[] }) {
  if (!request.industryTags.length) return;
  const subscriptions = await env.DB.prepare(`SELECT p.token, m.notify_industries AS notifyIndustriesJson
    FROM mobile_push_tokens p JOIN members m ON m.id = p.member_id
    WHERE p.member_id != ?`).bind(authorId).all<{ token: string; notifyIndustriesJson: string }>();
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
  const thresholds = [0, 3, 6, 10, 20];
  const names = ['PEARL', 'EMERALD', 'SAPPHIRE', 'RUBY', 'DIAMOND'];
  let level = 1;
  thresholds.forEach((threshold, index) => { if (member.introCount >= threshold) level = index + 1; });
  return { ...member, rank: names[level - 1], level, nextRankAt: thresholds[level] ?? member.introCount };
}
