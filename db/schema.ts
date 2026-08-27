import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  venue: text('venue').notNull().default('ひるのめぐろ会場'),
  company: text('company').notNull().default(''),
  positionTitle: text('position_title').notNull().default(''),
  badge: text('badge').notNull().default(''),
  businessArea: text('business_area').notNull().default(''),
  annualRevenueBand: text('annual_revenue_band').notNull().default(''),
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
  deadline: text('deadline').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_requests_status_created_at').on(table.status, table.createdAt),
  index('idx_requests_category').on(table.category),
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

export const businessCards = sqliteTable('business_cards', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => members.id),
  name: text('name').notNull().default(''),
  company: text('company').notNull().default(''),
  positionTitle: text('position_title').notNull().default(''),
  department: text('department').notNull().default(''),
  phone: text('phone').notNull().default(''),
  mobile: text('mobile').notNull().default(''),
  email: text('email').notNull().default(''),
  postalCode: text('postal_code').notNull().default(''),
  address: text('address').notNull().default(''),
  website: text('website').notNull().default(''),
  memo: text('memo').notNull().default(''),
  groupName: text('group_name').notNull().default(''),
  exchangeDate: text('exchange_date').notNull(),
  imageKey: text('image_key').notNull(),
  imageContentType: text('image_content_type').notNull(),
  imageVersion: integer('image_version').notNull().default(0),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_business_cards_owner_date').on(table.ownerId, table.exchangeDate),
  index('idx_business_cards_owner_favorite').on(table.ownerId, table.isFavorite),
]);
