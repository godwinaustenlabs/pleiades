-- Pleiades Accountant: the agent's system of record (spec Section C).
--
-- These live in office-db rather than a dedicated database. The spec suggested
-- a separate D1, but the accounting data the agent reasons over — invoices,
-- payroll_records, employees, transactions — is already here, and D1 cannot
-- join across databases. A second database would have meant every "which
-- invoices does this filing cover" question becoming two round trips and a
-- manual join in the Worker.
--
-- Distinct from an Agent instance's own `this.sql`, which is per-Durable-Object
-- working memory. These tables are the durable, cross-instance record that the
-- operator and their accountant can query directly.

-- Compliance calendar: one row per obligation *instance*, not per rule. A rule
-- like "monthly withholding statement" expands into twelve rows a year via a
-- generator, so the agent never has to reason about recurrence itself — it just
-- asks what is due.
CREATE TABLE IF NOT EXISTS compliance_events (
	id TEXT PRIMARY KEY,
	obligation_type TEXT NOT NULL,          -- 'salary_withholding_statement', 'annual_return', ...
	authority TEXT NOT NULL,                -- 'FBR' | 'SECP' | 'EOBI' | 'PESSI' | 'SESSI' | 'PSEB' | 'SRB' | 'PRA'
	period_label TEXT NOT NULL,             -- '2026-08' | 'TY2027' | 'Q1-FY2027'
	due_date TEXT NOT NULL,                 -- ISO date
	status TEXT NOT NULL DEFAULT 'pending', -- pending | draft_ready | reviewed | filed | overdue
	draft_document_id TEXT,                 -- -> generated_documents.id
	reviewed_by TEXT,
	filed_at TEXT,
	notes TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- The daily sweep asks "what is due in the next 14 days and not yet filed",
-- which is exactly this index.
CREATE INDEX IF NOT EXISTS compliance_events_due_status_idx
	ON compliance_events (due_date, status);

-- A generated deliverable. The file itself lives in R2; this is its metadata
-- and, in generation_basis, the provenance the spec requires of every figure.
CREATE TABLE IF NOT EXISTS generated_documents (
	id TEXT PRIMARY KEY,
	doc_type TEXT NOT NULL,
	period_label TEXT NOT NULL,
	version INTEGER NOT NULL DEFAULT 1,
	file_url TEXT NOT NULL,                 -- R2 object key, under a prefix assets.ts allows
	generated_by TEXT NOT NULL DEFAULT 'pleiades-accountant',
	generation_basis TEXT,                  -- JSON: source records + calc_* calls behind each number
	compliance_event_id TEXT,               -- -> compliance_events.id, nullable
	vector_id TEXT,                         -- id of the summary embedding in Vectorize
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS generated_documents_period_type_idx
	ON generated_documents (period_label, doc_type);

-- Re-generating a deliverable for the same period must produce a new version,
-- never a silent overwrite (spec, Deliverable Standards).
CREATE UNIQUE INDEX IF NOT EXISTS generated_documents_type_period_version_unique
	ON generated_documents (doc_type, period_label, version);

CREATE TABLE IF NOT EXISTS agent_conversations (
	id TEXT PRIMARY KEY,
	started_at INTEGER NOT NULL,
	operator TEXT NOT NULL                  -- users_logins.id of the person talking
);

CREATE TABLE IF NOT EXISTS conversation_turns (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES agent_conversations(id),
	role TEXT NOT NULL,                     -- 'user' | 'assistant' | 'tool'
	content TEXT NOT NULL,
	tool_calls TEXT,                        -- JSON array, if any
	vector_id TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS conversation_turns_conversation_idx
	ON conversation_turns (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS notifications_log (
	id TEXT PRIMARY KEY,
	channel TEXT NOT NULL,                  -- 'email' | 'slack'
	subject_or_summary TEXT NOT NULL,
	related_document_id TEXT,
	related_compliance_event_id TEXT,
	sent_at INTEGER NOT NULL,
	status TEXT NOT NULL                    -- 'sent' | 'failed'
);

-- Versioned rate tables. The whole point (spec Section G): when a Finance Act
-- changes a rate you insert a new row rather than editing code, so a document
-- generated last year can still be explained by the rate that applied then.
--
-- `verification` is not in the spec's DDL and is added deliberately: several
-- figures in the spec's own quick-reference are explicitly unconfirmed, and a
-- calculator must be able to tell "this is the law" from "this needs checking"
-- rather than treating every row as settled.
CREATE TABLE IF NOT EXISTS calc_config (
	id TEXT PRIMARY KEY,
	calc_name TEXT NOT NULL,                -- 'salary_withholding_slabs', 'eobi_contribution', ...
	effective_from TEXT NOT NULL,           -- ISO date the rule takes effect
	effective_to TEXT,                      -- NULL = still current
	config_json TEXT NOT NULL,              -- the rate table itself
	verification TEXT NOT NULL DEFAULT 'unverified', -- verified | needs_verification | unverified
	source_note TEXT
);

-- The lookup every calc_* tool makes: this rule, as it stood on this date.
CREATE INDEX IF NOT EXISTS calc_config_name_effective_idx
	ON calc_config (calc_name, effective_from);
