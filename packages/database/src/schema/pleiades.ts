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
 * Compliance configuration, owned by the operator.
 *
 * Replaces the earlier calc_config, which stored each rule as an opaque JSON
 * blob — fine for a migration to seed, impossible for a person to edit in a
 * form. These figures are not ours to decide: rates, the EOBI wage base, the
 * tax-year boundary and the company's own registration details change with each
 * Finance Act and provincial notification, and the operator is who knows them.
 *
 * Every row is one typed, labelled, grouped variable rendered as a field in the
 * agent settings UI. The configured values are injected into the agent's system
 * prompt at request time (see src/agents/pleiades/config.ts), so nothing
 * compliance-related is hardcoded in code or prompt.
 *
 * `value` is NULL until the operator sets it. A NULL on a required row is what
 * makes the agent refuse to produce a dependent figure instead of guessing.
 *
 * (config_key, effective_from) is unique: a rate change is a new row with a
 * later effective_from, never an edit, so a document generated in the past
 * remains explainable by the rate that applied when it was made.
 */
export const complianceConfig = sqliteTable('compliance_config', {
  id: text('id').primaryKey(),
  configKey: text('config_key').notNull(),
  /** UI grouping: company | tax_year | income_tax | eobi | secp | … */
  groupName: text('group_name').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  /** percent | currency | number | date | text | boolean | json */
  valueType: text('value_type').notNull(),
  unit: text('unit'),
  /** NULL means the operator has not configured it yet. */
  value: text('value'),
  required: integer('required').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  effectiveFrom: text('effective_from').notNull(),
  effectiveTo: text('effective_to'),
  updatedBy: text('updated_by'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Human-in-the-loop approvals for consequential agent actions.
 *
 * Opening an account, linking a ledger, running payroll, posting a journal:
 * these must not happen because a model decided they should. The gate is this
 * table rather than a line in the prompt, because a prompt instruction is text
 * and can be argued with by other text — including text the agent read out of
 * an invoice description.
 *
 * `payloadHash` is re-checked at execution, so an approval for one payload can
 * never be replayed against a different one, and the row is consumed on first
 * use so a token cannot be reused.
 */
export const agentApprovals = sqliteTable('agent_approvals', {
  id: text('id').primaryKey(),
  toolName: text('tool_name').notNull(),
  payload: text('payload').notNull(),
  payloadHash: text('payload_hash').notNull(),
  summary: text('summary').notNull(),
  /** pending | approved | rejected | consumed | expired */
  status: text('status').notNull().default('pending'),
  requestedBy: text('requested_by').notNull(),
  decidedBy: text('decided_by'),
  decidedAt: integer('decided_at', { mode: 'timestamp' }),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Documents indexed into the knowledge base.
 *
 * Vectorize holds the passages; this holds what a person needs to see. Without
 * it the index is opaque — there is no way to tell an empty knowledge base from
 * one that silently failed to ingest a scanned PDF, and those look identical
 * from the agent's side.
 */
export const knowledgeDocuments = sqliteTable('knowledge_documents', {
  id: text('id').primaryKey(),
  r2Key: text('r2_key').notNull().unique(),
  title: text('title').notNull(),
  /** compliance (the manual) | history (past conversations and deliverables) */
  namespace: text('namespace').notNull().default('compliance'),
  chunkCount: integer('chunk_count').notNull().default(0),
  characters: integer('characters').notNull().default(0),
  /** pending | indexed | failed */
  status: text('status').notNull().default('pending'),
  error: text('error'),
  ingestedBy: text('ingested_by'),
  ingestedAt: integer('ingested_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * The agent's working journal — what it did and why.
 *
 * Written to D1 first and embedded into Vectorize second, because the two
 * answer different questions. "Have I handled something like this before?" is
 * semantic and comes from the index; "what did you file in August, and why was
 * it nil?" is exact, and an auditor asking it will not accept a similarity
 * score. If embedding fails the row still stands: a journal that silently drops
 * entries is worse than none, because it looks complete.
 *
 * `rationale` is the point. A nil return with no explanation is
 * indistinguishable, months later, from one nobody got round to.
 */
export const agentJournal = sqliteTable('agent_journal', {
  id: text('id').primaryKey(),
  /** account_created | payroll_generated | statement_generated | … */
  actionType: text('action_type').notNull(),
  subject: text('subject').notNull(),
  summary: text('summary').notNull(),
  rationale: text('rationale'),
  /** Related record ids as JSON, so an entry traces back to what it describes. */
  entities: text('entities'),
  periodLabel: text('period_label'),
  /** completed | refused | blocked */
  outcome: text('outcome').notNull().default('completed'),
  actorUserId: text('actor_user_id').notNull(),
  conversationId: text('conversation_id'),
  /** agent (it chose to record) | approval_gate (recorded for it) */
  source: text('source').notNull().default('agent'),
  vectorId: text('vector_id'),
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

