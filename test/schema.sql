-- Production DDL, pulled from sqlite_master, so the test database cannot
-- drift from the real one. Regenerate it rather than hand-editing.
CREATE TABLE agent_approvals (
	id TEXT PRIMARY KEY,
	tool_name TEXT NOT NULL,
	-- The exact arguments approved. Compared on execution, so an approval for
	-- one payload can never be replayed against a different one.
	payload TEXT NOT NULL,
	payload_hash TEXT NOT NULL,
	summary TEXT NOT NULL,          -- what the operator is being asked to allow
	-- pending | approved | rejected | consumed | expired
	status TEXT NOT NULL DEFAULT 'pending',
	requested_by TEXT NOT NULL,     -- users_logins.id the agent was acting as
	decided_by TEXT,                -- users_logins.id who approved or rejected
	decided_at INTEGER,
	consumed_at INTEGER,
	-- Approvals are short-lived: an hour-old "yes" to opening an account should
	-- not authorise it tomorrow.
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE agent_conversations (
	id TEXT PRIMARY KEY,
	started_at INTEGER NOT NULL,
	operator TEXT NOT NULL                  -- users_logins.id of the person talking
);
CREATE TABLE agent_journal (
	id TEXT PRIMARY KEY,
	-- What kind of thing happened, so the timeline can be filtered without
	-- relying on the prose: account_created | payroll_generated |
	-- statement_generated | journal_posted | salary_structure_set | …
	action_type TEXT NOT NULL,
	subject TEXT NOT NULL,          -- the thing acted on, in human terms
	summary TEXT NOT NULL,          -- what was done
	rationale TEXT,                 -- why, including why a figure was nil
	-- Related record ids as JSON, so an entry can be traced back to the payroll
	-- run or journal entry it describes.
	entities TEXT,
	period_label TEXT,              -- '2026-08' | 'TY2027', when it applies to one
	outcome TEXT NOT NULL DEFAULT 'completed', -- completed | refused | blocked
	actor_user_id TEXT NOT NULL,    -- who the agent was acting as
	conversation_id TEXT,
	-- Written automatically by the approval gate, or by the agent itself.
	source TEXT NOT NULL DEFAULT 'agent', -- agent | approval_gate
	vector_id TEXT,                 -- id in Vectorize, once embedded
	occurred_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE api_keys (
	id TEXT PRIMARY KEY,
	key_hash TEXT NOT NULL UNIQUE,
	owner_name TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users_logins(id),
	is_active INTEGER DEFAULT 1,
	created_at INTEGER NOT NULL
);
CREATE TABLE `appointments` (
	`appointment_id` text PRIMARY KEY NOT NULL,
	`role_or_title` text,
	`appointment_date` text,
	`term_type` text,
	`appointment_end_date` text,
	`is_active` integer,
	`employee_id` text,
	`committee_id` text,
	`created_at` integer NOT NULL, account_id text REFERENCES users_logins(id),
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`details` text,
	`timestamp` integer NOT NULL
);
CREATE TABLE `committee_members` (
	`committee_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`role_in_committee` text,
	`joined_at` text,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `committees` (
	`committee_id` text PRIMARY KEY NOT NULL,
	`committee_name` text NOT NULL,
	`type` text,
	`ops_status` text,
	`purpose` text,
	`date_formed` text,
	`active_status` integer,
	`lab_id` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lab_id`) REFERENCES `labs`(`lab_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `company_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`document_type` text NOT NULL,
	`url` text NOT NULL,
	`department` text NOT NULL DEFAULT 'hr',
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE compliance_config (
	id TEXT PRIMARY KEY,
	config_key TEXT NOT NULL,
	group_name TEXT NOT NULL,
	label TEXT NOT NULL,
	description TEXT,
	-- percent | currency | number | date | text | boolean | json
	value_type TEXT NOT NULL,
	unit TEXT,
	value TEXT,
	required INTEGER NOT NULL DEFAULT 1,
	sort_order INTEGER NOT NULL DEFAULT 0,
	effective_from TEXT NOT NULL,
	effective_to TEXT,
	updated_by TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE TABLE compliance_events (
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
CREATE TABLE conversation_turns (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES agent_conversations(id),
	role TEXT NOT NULL,                     -- 'user' | 'assistant' | 'tool'
	content TEXT NOT NULL,
	tool_calls TEXT,                        -- JSON array, if any
	vector_id TEXT,
	created_at INTEGER NOT NULL
);
CREATE TABLE `employees` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slack_id` text,
	`airtable_user_id` text,
	`department` text,
	`role` text,
	`employment_status` text,
	`hire_date` text,
	`base_salary` real,
	`efficiency_score` real,
	`profile_photo` text,
	`sector_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
, `email` text, `phone` text, `cnic` text, `dob` text, `gender` text, `address` text, `contact_info` text, `emergency_contact` text, `designation` text, `reporting_manager_id` text, `employment_type` text, `confirmation_date` text, `contract_start_date` text, `contract_end_date` text, `bank_details` text, `tax_information` text, `assigned_office` text, `notes` text);
CREATE TABLE generated_documents (
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
CREATE TABLE knowledge_documents (
	id TEXT PRIMARY KEY,
	r2_key TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	namespace TEXT NOT NULL DEFAULT 'compliance',
	chunk_count INTEGER NOT NULL DEFAULT 0,
	characters INTEGER NOT NULL DEFAULT 0,
	-- pending | indexed | failed
	status TEXT NOT NULL DEFAULT 'pending',
	error TEXT,
	ingested_by TEXT,
	ingested_at INTEGER,
	created_at INTEGER NOT NULL
);
CREATE TABLE notifications_log (
	id TEXT PRIMARY KEY,
	channel TEXT NOT NULL,                  -- 'email' | 'slack'
	subject_or_summary TEXT NOT NULL,
	related_document_id TEXT,
	related_compliance_event_id TEXT,
	sent_at INTEGER NOT NULL,
	status TEXT NOT NULL                    -- 'sent' | 'failed'
);
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
CREATE TABLE `task_assignments` (`assignment_id` text PRIMARY KEY NOT NULL, `task_id` text NOT NULL, `employee_id` text NOT NULL, `assigned_at` integer NOT NULL, FOREIGN KEY (`task_id`) REFERENCES `universal_tasks`(`task_id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action);
CREATE TABLE "universal_tasks" (`task_id` text PRIMARY KEY NOT NULL, `title` text NOT NULL, `description` text, `status` text NOT NULL, `priority` text, `department` text NOT NULL, `task_type` text, `creator_id` text, `appointment_id` text, `committee_id` text, `board_position` integer DEFAULT 0, `related_entity_id` text, `related_entity_type` text, `estimated_hours` real, `start_date` text, `due_date` text, `completed_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`creator_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`appointment_id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action);
CREATE TABLE user_app_permissions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users_logins(id),
	app_name TEXT NOT NULL,
	feature TEXT NOT NULL,
	can_view INTEGER DEFAULT 0,
	can_edit INTEGER DEFAULT 0,
	can_delete INTEGER DEFAULT 0,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE TABLE `user_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`link` text,
	`is_read` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE user_ownership (user_id text PRIMARY KEY NOT NULL, owner_user_id text NOT NULL, assigned_at integer NOT NULL, assigned_by_user_id text, FOREIGN KEY (user_id) REFERENCES users_logins(id), FOREIGN KEY (owner_user_id) REFERENCES users_logins(id));
CREATE TABLE "users_logins" (
	id text PRIMARY KEY NOT NULL,
	employee_id text,
	email text NOT NULL,
	password_hash text NOT NULL,
	is_active integer DEFAULT true,
	created_at integer NOT NULL,
	last_login_at integer,
	failed_attempts integer DEFAULT 0 NOT NULL,
	locked_until integer,
	created_by_user_id text,
	password_updated_at integer,
	name text,
	username text,
	is_superadmin INTEGER DEFAULT 0,
	phone TEXT
);
CREATE INDEX agent_approvals_requester_idx
	ON agent_approvals (requested_by, created_at);
CREATE INDEX agent_approvals_status_idx
	ON agent_approvals (status, expires_at);
CREATE INDEX agent_journal_occurred_idx
	ON agent_journal (occurred_at DESC);
CREATE INDEX agent_journal_period_idx
	ON agent_journal (period_label);
CREATE INDEX agent_journal_type_idx
	ON agent_journal (action_type, occurred_at DESC);
CREATE INDEX compliance_config_group_idx
	ON compliance_config (group_name, sort_order);
CREATE UNIQUE INDEX compliance_config_key_from_unique
	ON compliance_config (config_key, effective_from);
CREATE INDEX compliance_events_due_status_idx
	ON compliance_events (due_date, status);
CREATE INDEX conversation_turns_conversation_idx
	ON conversation_turns (conversation_id, created_at);
CREATE INDEX generated_documents_period_type_idx
	ON generated_documents (period_label, doc_type);
CREATE UNIQUE INDEX generated_documents_type_period_version_unique
	ON generated_documents (doc_type, period_label, version);
CREATE INDEX knowledge_documents_status_idx
	ON knowledge_documents (status, created_at);
CREATE UNIQUE INDEX user_app_permissions_user_app_feature_unique
	ON user_app_permissions (user_id, app_name, feature);
CREATE INDEX user_app_permissions_user_idx
	ON user_app_permissions (user_id);
CREATE UNIQUE INDEX users_logins_email_unique ON users_logins (email);
CREATE UNIQUE INDEX users_logins_username_unique ON users_logins (username);
