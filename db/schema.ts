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
