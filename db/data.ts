import { env } from 'cloudflare:workers';
import type { ChatGPTUser } from '@/app/chatgpt-auth';

export type BoardRequest = {
  id: string;
  category: 'project' | 'collaboration' | 'consultation';
  title: string;
  description: string;
  budgetLabel: string;
  area: string;
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
  annualRevenueBand: string;
  avatarUrl: string;
  introCount: number;
  dealCount: number;
  points: number;
  rank: string;
  level: number;
  nextRankAt: number;
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
    ['annual_revenue_band', "ALTER TABLE members ADD COLUMN annual_revenue_band TEXT NOT NULL DEFAULT ''"],
    ['avatar_key', "ALTER TABLE members ADD COLUMN avatar_key TEXT NOT NULL DEFAULT ''"],
    ['avatar_version', 'ALTER TABLE members ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [columnName, sql] of missingColumns) {
    if (!existingColumns.has(columnName)) await env.DB.prepare(sql).run();
  }
  await seedDemoData();
  await env.DB.batch([
    env.DB.prepare("UPDATE members SET annual_revenue_band = 'revenue_30_70' WHERE id = 'demo-tanaka' AND annual_revenue_band = ''"),
    env.DB.prepare("UPDATE members SET annual_revenue_band = 'revenue_70_100' WHERE id = 'demo-sato' AND annual_revenue_band = ''"),
    env.DB.prepare("UPDATE members SET position_title = '代表取締役', badge = '赤バッヂ', business_area = '東京都' WHERE id = 'demo-tanaka' AND business_area = ''"),
    env.DB.prepare("UPDATE members SET position_title = 'オーナー', badge = '緑バッヂ', business_area = '東京都' WHERE id = 'demo-sato' AND business_area = ''"),
  ]);
  initialized = true;
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
    r.budget_label AS budgetLabel, r.area, r.deadline, r.status, r.created_at AS createdAt,
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
    ORDER BY r.created_at DESC`).all<BoardRequest & { authorId: string; authorAvatarKey: string; authorAvatarVersion: number }>();

  const member = await env.DB.prepare(`SELECT display_name AS displayName, venue, company,
    position_title AS positionTitle, badge, business_area AS businessArea,
    annual_revenue_band AS annualRevenueBand,
    avatar_key AS avatarKey, avatar_version AS avatarVersion,
    intro_count AS introCount, deal_count AS dealCount, points
    FROM members WHERE id = ?`).bind(user.userId).first<Omit<MemberStats, 'rank' | 'level' | 'nextRankAt' | 'avatarUrl'> & { avatarKey: string; avatarVersion: number }>();

  const baseMember = member ?? { displayName: user.displayName, venue: 'ひるのめぐろ会場', company: '', positionTitle: '', badge: '', businessArea: '', annualRevenueBand: '', avatarKey: '', avatarVersion: 0, introCount: 0, dealCount: 0, points: 0 };
  const stats = calculateRank({ ...baseMember, avatarUrl: avatarUrl(user.userId, baseMember.avatarKey, baseMember.avatarVersion) });
  const requests = requestsResult.results.map(({ authorId, authorAvatarKey, authorAvatarVersion, ...request }) => ({
    ...request,
    authorAvatarUrl: avatarUrl(authorId, authorAvatarKey, authorAvatarVersion),
  }));
  return { requests, stats };
}

export async function updateMemberProfile(user: ChatGPTUser, input: { company: string; venue: string; positionTitle: string; badge: string; businessArea: string; annualRevenueBand: string; avatar?: { bytes: ArrayBuffer; contentType: string } }) {
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
    business_area = ?, annual_revenue_band = ?, avatar_key = ?, avatar_version = ? WHERE id = ?`)
    .bind(input.company, input.venue, input.positionTitle, input.badge, input.businessArea, input.annualRevenueBand, avatarKey, avatarVersion, user.userId).run();
  return avatarUrl(user.userId, avatarKey, avatarVersion);
}

export async function createRequest(user: ChatGPTUser, input: { category: string; title: string; description: string; budgetLabel: string; area: string; deadline: string; }) {
  await upsertMember(user);
  await requireFacePhoto(user.userId);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO requests (id, author_id, category, title, description, budget_label, area, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.userId, input.category, input.title, input.description, input.budgetLabel, input.area, input.deadline, 'open', createdAt).run();
  return id;
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

function calculateRank(member: Omit<MemberStats, 'rank' | 'level' | 'nextRankAt'>): MemberStats {
  const thresholds = [0, 50, 150, 350, 700, 1200];
  const names = ['SEED', 'SUPPORTER', 'CONNECTOR', 'GIVER', 'AMBASSADOR', 'LEGEND'];
  let level = 1;
  thresholds.forEach((threshold, index) => { if (member.points >= threshold) level = index + 1; });
  return { ...member, rank: names[level - 1], level, nextRankAt: thresholds[level] ?? member.points };
}
