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
  authorRevenueBand: string;
  introCount: number;
};

export type MemberStats = {
  displayName: string;
  venue: string;
  company: string;
  annualRevenueBand: string;
  introCount: number;
  dealCount: number;
  points: number;
  rank: string;
  level: number;
  nextRankAt: number;
};

const statements = [
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    venue TEXT NOT NULL DEFAULT 'ひるのめぐろ会場',
    company TEXT NOT NULL DEFAULT '',
    annual_revenue_band TEXT NOT NULL DEFAULT '',
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
  'CREATE INDEX IF NOT EXISTS idx_requests_status_created_at ON requests(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category)',
  'CREATE INDEX IF NOT EXISTS idx_introductions_introducer_id ON introductions(introducer_id)',
  'CREATE INDEX IF NOT EXISTS idx_introductions_request_id ON introductions(request_id)',
];

let initialized = false;

export async function ensureDatabase() {
  if (initialized) return;
  await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
  const memberColumns = await env.DB.prepare('PRAGMA table_info(members)').all<{ name: string }>();
  if (!memberColumns.results.some((column) => column.name === 'annual_revenue_band')) {
    await env.DB.prepare("ALTER TABLE members ADD COLUMN annual_revenue_band TEXT NOT NULL DEFAULT ''").run();
  }
  await seedDemoData();
  await env.DB.batch([
    env.DB.prepare("UPDATE members SET annual_revenue_band = 'revenue_30_70' WHERE id = 'demo-tanaka' AND annual_revenue_band = ''"),
    env.DB.prepare("UPDATE members SET annual_revenue_band = 'revenue_70_100' WHERE id = 'demo-sato' AND annual_revenue_band = ''"),
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
    m.annual_revenue_band AS authorRevenueBand,
    COUNT(i.id) AS introCount
    FROM requests r
    JOIN members m ON m.id = r.author_id
    LEFT JOIN introductions i ON i.request_id = r.id
    WHERE r.status = 'open'
    GROUP BY r.id
    ORDER BY r.created_at DESC`).all<BoardRequest>();

  const member = await env.DB.prepare(`SELECT display_name AS displayName, venue, company,
    annual_revenue_band AS annualRevenueBand,
    intro_count AS introCount, deal_count AS dealCount, points
    FROM members WHERE id = ?`).bind(user.userId).first<Omit<MemberStats, 'rank' | 'level' | 'nextRankAt'>>();

  const stats = calculateRank(member ?? { displayName: user.displayName, venue: 'ひるのめぐろ会場', company: '', annualRevenueBand: '', introCount: 0, dealCount: 0, points: 0 });
  return { requests: requestsResult.results, stats };
}

export async function updateMemberRevenueBand(user: ChatGPTUser, annualRevenueBand: string) {
  await upsertMember(user);
  await env.DB.prepare('UPDATE members SET annual_revenue_band = ? WHERE id = ?').bind(annualRevenueBand, user.userId).run();
}

export async function createRequest(user: ChatGPTUser, input: { category: string; title: string; description: string; budgetLabel: string; area: string; deadline: string; }) {
  await upsertMember(user);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await env.DB.prepare('INSERT INTO requests (id, author_id, category, title, description, budget_label, area, deadline, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.userId, input.category, input.title, input.description, input.budgetLabel, input.area, input.deadline, 'open', createdAt).run();
  return id;
}

export async function createIntroduction(user: ChatGPTUser, input: { requestId: string; personName: string; personCompany: string; relationship: string; fitReason: string; }) {
  await upsertMember(user);
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

function calculateRank(member: Omit<MemberStats, 'rank' | 'level' | 'nextRankAt'>): MemberStats {
  const thresholds = [0, 50, 150, 350, 700, 1200];
  const names = ['SEED', 'SUPPORTER', 'CONNECTOR', 'GIVER', 'AMBASSADOR', 'LEGEND'];
  let level = 1;
  thresholds.forEach((threshold, index) => { if (member.points >= threshold) level = index + 1; });
  return { ...member, rank: names[level - 1], level, nextRankAt: thresholds[level] ?? member.points };
}
