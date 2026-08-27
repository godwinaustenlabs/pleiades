import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { committees, clients } from './core';
import { employees } from './core';
import { usersLogins } from './auth';

/* ── CRM TICKETS ── */
export const crmTickets = sqliteTable('crm_tickets', {
  id: text('ticket_id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(), // open | in_progress | resolved | closed
  priority: text('priority'),       // low | medium | high | urgent
  category: text('category'),       // bug | feature | support | billing | other

  // Who raised it — either an employee or a client
  raisedByType: text('raised_by_type'), // 'employee' | 'client'
  raisedById: text('raised_by_id'),

  // Assignment
  assignedTo: text('assigned_to').references(() => employees.id),
  committeeId: text('committee_id').notNull().references(() => committees.id),

  // Timestamps
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/* ── CRM DOCUMENTS (R2-backed) ── */
export const crmDocuments = sqliteTable('crm_documents', {
  id: text('doc_id').primaryKey(),
  title: text('title').notNull(),
  docType: text('doc_type'),         // contract | invoice | report | other
  r2Key: text('r2_key').notNull(),   // R2 object key
  r2Bucket: text('r2_bucket'),       // bucket name (defaults to primary)
  fileSize: integer('file_size'),    // bytes
  mimeType: text('mime_type'),
  uploadedById: text('uploaded_by_id').references(() => usersLogins.id),
  committeeId: text('committee_id').notNull().references(() => committees.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/* ── CRM PLANNER EVENTS ── */
export const crmPlannerEvents = sqliteTable('crm_planner_events', {
  id: text('event_id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  eventType: text('event_type'),     // meeting | milestone | deadline | reminder
  startDate: text('start_date'),
  endDate: text('end_date'),
  allDay: integer('all_day', { mode: 'boolean' }),
  committeeId: text('committee_id').notNull().references(() => committees.id),
  createdById: text('created_by_id').references(() => usersLogins.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/* ── CLIENT LOGINS (Portal Access) ── */
export const clientLogins = sqliteTable('client_logins', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  failedAttempts: integer('failed_attempts').default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/* ── USER NOTES (Personal) ── */
export const userNotes = sqliteTable('user_notes', {
  id: text('note_id').primaryKey(),
  userId: text('user_id').notNull().references(() => usersLogins.id),
  title: text('title').notNull(),
  content: text('content'),          // Rich text / markdown
  pinned: integer('pinned', { mode: 'boolean' }).default(false),
  color: text('color'),              // Optional color tag
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/* ── USER DASHBOARD STATE ── */
export const userDashboardState = sqliteTable('user_dashboard_state', {
  userId: text('user_id').primaryKey().references(() => usersLogins.id),
  preferences: text('preferences'),  // JSON: { theme, layout, widgets, etc. }
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/* ── CRM TICKET NOTES ── */
export const crmTicketNotes = sqliteTable('crm_ticket_notes', {
  id: text('note_id').primaryKey(),
  ticketId: text('ticket_id').notNull().references(() => crmTickets.id),
  authorId: text('author_id').notNull().references(() => usersLogins.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
