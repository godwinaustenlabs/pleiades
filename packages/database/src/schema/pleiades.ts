import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { usersLogins } from './auth';

/**
 * Pleiades Accountant — the agent's system of record.
 *
 * These tables live in `office-db` alongside the accounting data the agent
 * reasons over (invoices, payroll_records, employees, transactions). The spec
 * suggested a dedicated D1; a single database was chosen instead because D1
 * cannot join across databases, and almost every useful question the agent
 * answers spans both sides — "which invoices does this filing cover" would
 * otherwise be two round trips and a manual join in the Worker.
 *
 * Distinct from an Agent instance's `this.sql`, which is per-Durable-Object
 * working memory. This is the durable, cross-instance record that the operator
 * and their accountant can query directly.
 */

/**
 * The compliance calendar: one row per obligation *instance*.
 *
 * A recurring rule ("monthly withholding statement") is expanded into twelve
 * rows a year by a generator, so the agent never reasons about recurrence — it
 * asks what is due. That keeps a class of error (a model doing date arithmetic
 * about a filing deadline) out of the system entirely.
 */
export const complianceEvents = sqliteTable('compliance_events', {
  id: text('id').primaryKey(),
  obligationType: text('obligation_type').notNull(),
  /** 'FBR' | 'SECP' | 'EOBI' | 'PESSI' | 'SESSI' | 'PSEB' | 'SRB' | 'PRA' */
  authority: text('authority').notNull(),
  /** '2026-08' | 'TY2027' | 'Q1-FY2027' */
  periodLabel: text('period_label').notNull(),
  dueDate: text('due_date').notNull(),
  /** pending | draft_ready | reviewed | filed | overdue */
  status: text('status').notNull().default('pending'),
  draftDocumentId: text('draft_document_id'),
  reviewedBy: text('reviewed_by'),
  filedAt: text('filed_at'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * A generated deliverable. The file is in R2; this is its metadata.
 *
 * `generationBasis` carries the provenance the spec requires of every figure —
 * which source records and which calc_* calls produced each number — so a draft
 * can still be explained months later.
 *
 * (doc_type, period_label, version) is unique: re-generating for the same
 * period must mint a new version, never silently overwrite.
 */
export const generatedDocuments = sqliteTable('generated_documents', {
  id: text('id').primaryKey(),
  docType: text('doc_type').notNull(),
  periodLabel: text('period_label').notNull(),
  version: integer('version').notNull().default(1),
  fileUrl: text('file_url').notNull(),
  generatedBy: text('generated_by').notNull().default('pleiades-accountant'),
  /** JSON: source API calls / D1 queries / calc_* results behind the numbers. */
  generationBasis: text('generation_basis'),
  complianceEventId: text('compliance_event_id'),
  vectorId: text('vector_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Named `agent_conversations`, not `conversations`: this is a shared database
 * and a bare `conversations` would read as belonging to the CRM or messaging
 * side rather than to the accountant.
 */
export const agentConversations = sqliteTable('agent_conversations', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  operator: text('operator').notNull().references(() => usersLogins.id),
});

export const conversationTurns = sqliteTable('conversation_turns', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => agentConversations.id),
  /** 'user' | 'assistant' | 'tool' */
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolCalls: text('tool_calls'),
  vectorId: text('vector_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const notificationsLog = sqliteTable('notifications_log', {
  id: text('id').primaryKey(),
  /** 'email' | 'slack' */
  channel: text('channel').notNull(),
  subjectOrSummary: text('subject_or_summary').notNull(),
  relatedDocumentId: text('related_document_id'),
  relatedComplianceEventId: text('related_compliance_event_id'),
  sentAt: integer('sent_at', { mode: 'timestamp' }).notNull(),
  /** 'sent' | 'failed' */
  status: text('status').notNull(),
});

/**
 * Versioned rate tables — every tax rate, slab and threshold the calculators
 * use, with an effective_from/effective_to window.
 *
 * A Finance Act change is a new row, never an edit: a document generated last
 * year must remain explainable by the rate that applied when it was generated.
 *
 * `verification` is an addition to the spec's DDL. Several figures in the
 * spec's own quick-reference are explicitly unconfirmed (PESSI/SESSI rates, the
 * minimum-tax threshold, the intermediate salary slabs), and a calculator has
 * to be able to tell settled law from a figure that still needs checking. Rows
 * whose config carries `blocking: true` must make their calc_* tool refuse
 * rather than return a number.
 */
export const calcConfig = sqliteTable('calc_config', {
  id: text('id').primaryKey(),
  calcName: text('calc_name').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  configJson: text('config_json').notNull(),
  /** verified | needs_verification | unverified */
  verification: text('verification').notNull().default('unverified'),
  sourceNote: text('source_note'),
});
