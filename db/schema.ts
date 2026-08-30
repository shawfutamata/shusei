import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  venue: text('venue').notNull().default('ひるのめぐろ会場'),
  company: text('company').notNull().default(''),
  positionTitle: text('position_title').notNull().default(''),
  // バッヂは廃止。列だけ残っている（既存のDBと食い違わせないため）。読み書きしない。
  badge: text('badge').notNull().default(''),
  businessArea: text('business_area').notNull().default(''),
  primaryIndustry: text('primary_industry').notNull().default(''),
  notifyIndustries: text('notify_industries').notNull().default('[]'),
  annualRevenueBand: text('annual_revenue_band').notNull().default(''),
  membershipStatus: text('membership_status').notNull().default('invited'),
  membershipSource: text('membership_source').notNull().default('direct_contract'),
  membershipPeriodEnd: text('membership_period_end').notNull().default(''),
  organizationId: text('organization_id').notNull().default(''),
  avatarKey: text('avatar_key').notNull().default(''),
  avatarVersion: integer('avatar_version').notNull().default(0),
  introCount: integer('intro_count').notNull().default(0),
  dealCount: integer('deal_count').notNull().default(0),
  points: integer('points').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const requests = sqliteTable('requests', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull().references(() => members.id),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  budgetLabel: text('budget_label').notNull(),
  area: text('area').notNull(),
  industryTags: text('industry_tags').notNull().default('[]'),
  deadline: text('deadline').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_requests_status_created_at').on(table.status, table.createdAt),
  index('idx_requests_category').on(table.category),
]);

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  memberId: text('member_id').notNull().references(() => members.id),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_push_subscriptions_member_id').on(table.memberId),
]);

export const introductions = sqliteTable('introductions', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references(() => requests.id),
  introducerId: text('introducer_id').notNull().references(() => members.id),
  personName: text('person_name').notNull(),
  personCompany: text('person_company').notNull(),
  relationship: text('relationship').notNull(),
  fitReason: text('fit_reason').notNull(),
  consentConfirmed: integer('consent_confirmed', { mode: 'boolean' }).notNull(),
  status: text('status').notNull().default('proposed'),
  pointsAwarded: integer('points_awarded').notNull().default(10),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_introductions_introducer_id').on(table.introducerId),
  index('idx_introductions_request_id').on(table.requestId),
]);

export const attendanceEvents = sqliteTable('attendance_events', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => members.id),
  meetingDate: text('meeting_date').notNull(),
  meetingName: text('meeting_name').notNull(),
  venue: text('venue').notNull(),
  ocrText: text('ocr_text').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_attendance_events_owner_date').on(table.ownerId, table.meetingDate),
]);

export const attendancePeople = sqliteTable('attendance_people', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => attendanceEvents.id),
  ownerId: text('owner_id').notNull().references(() => members.id),
  personName: text('person_name').notNull(),
  company: text('company').notNull().default(''),
  note: text('note').notNull().default(''),
  isImportant: integer('is_important', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_attendance_people_event_id').on(table.eventId),
  index('idx_attendance_people_owner_important').on(table.ownerId, table.isImportant),
]);

export const adSlots = sqliteTable('ad_slots', {
  id: text('id').primaryKey(),
  memberId: text('member_id').notNull().references(() => members.id),
  month: text('month').notNull(),
  title: text('title').notNull().default(''),
  linkUrl: text('link_url').notNull().default(''),
  imageVersion: integer('image_version').notNull().default(0),
  status: text('status').notNull().default('reserved'),
  stripeSessionId: text('stripe_session_id').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_ad_slots_month_status').on(table.month, table.status),
  index('idx_ad_slots_member').on(table.memberId),
]);

export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  memberId: text('member_id').notNull().references(() => members.id),
  category: text('category').notNull(),
  body: text('body').notNull(),
  status: text('status').notNull().default('new'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_feedback_created_at').on(table.createdAt),
]);
