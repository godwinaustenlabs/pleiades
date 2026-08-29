-- Production DDL, pulled verbatim from pleiades-db's sqlite_master.
-- The test database is the real schema, not a hand-picked subset: it held 23
-- of the 85 production tables, so anything touching finance, CRM or assets
-- could not be tested at all. Regenerate this file rather than editing it:
--   npx wrangler d1 execute pleiades-db --remote --json \
--     --command="SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL"

CREATE TABLE `accounts` (
	`account_id` text PRIMARY KEY NOT NULL,
	`account_name` text NOT NULL,
	`account_type` text,
	`bank_name` text,
	`account_number` text,
	`opening_balance` real,
	`current_balance` real,
	`currency` text,
	`status` text,
	`created_at` integer NOT NULL
, `ledger_id` text REFERENCES ledgers(ledger_id));
CREATE TABLE `acq_tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`task_name` text NOT NULL,
	`description` text,
	`priority` text,
	`due_date` text,
	`assignee` text,
	`airtable_user_id` text,
	`status` text,
	`estimated_effort` real,
	`actual_effort` real,
	`sprint_id` text,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`sprint_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `active_agreements` (
	`agreement_id` text PRIMARY KEY NOT NULL,
	`agreement_name` text NOT NULL,
	`contract_type` text,
	`effective_date` text,
	`expiry_date` text,
	`auto_renewal` integer,
	`payment_terms` text,
	`status` text,
	`signed_doc` text,
	`committee_id` text,
	`template_id` text,
	`created_at` integer NOT NULL, client_id TEXT,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `legal_templates`(`template_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE agent_approvals (
	id TEXT PRIMARY KEY,
	tool_name TEXT NOT NULL,
	
	
	payload TEXT NOT NULL,
	payload_hash TEXT NOT NULL,
	summary TEXT NOT NULL,          
	
	status TEXT NOT NULL DEFAULT 'pending',
	requested_by TEXT NOT NULL,     
	decided_by TEXT,                
	decided_at INTEGER,
	consumed_at INTEGER,
	
	
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
, execution_status TEXT, execution_result TEXT, executed_at INTEGER);
CREATE TABLE agent_conversations (
	id TEXT PRIMARY KEY,
	started_at INTEGER NOT NULL,
	operator TEXT NOT NULL                  
);
CREATE TABLE agent_journal (
	id TEXT PRIMARY KEY,
	
	
	
	action_type TEXT NOT NULL,
	subject TEXT NOT NULL,          
	summary TEXT NOT NULL,          
	rationale TEXT,                 
	
	
	entities TEXT,
	period_label TEXT,              
	outcome TEXT NOT NULL DEFAULT 'completed', 
	actor_user_id TEXT NOT NULL,    
	conversation_id TEXT,
	
	source TEXT NOT NULL DEFAULT 'agent', 
	vector_id TEXT,                 
	occurred_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE `agreement_parties` (
	`agreement_id` text NOT NULL,
	`party_id` text NOT NULL,
	`party_role` text,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE api_keys (
	id TEXT PRIMARY KEY,
	key_hash TEXT NOT NULL UNIQUE,
	owner_name TEXT NOT NULL,
	user_id TEXT NOT NULL REFERENCES users_logins(id),
	is_active INTEGER DEFAULT 1,
	created_at INTEGER NOT NULL
);
CREATE TABLE app_messages (id TEXT PRIMARY KEY, sender_app TEXT NOT NULL, target_app TEXT NOT NULL, sender_id TEXT REFERENCES users_logins(id), type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, priority TEXT DEFAULT 'medium', is_resolved INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
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
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_name` text NOT NULL,
	`asset_type` text NOT NULL,
	`assigned_to` text,
	`issue_date` text,
	`return_date` text,
	`condition` text,
	`status` text DEFAULT 'Available' NOT NULL,
	`created_at` integer NOT NULL, purchase_cost real, purchase_date text, salvage_value real DEFAULT 0, useful_life_months integer, asset_class text DEFAULT 'other', serial_number text, vendor text, depreciation_method text DEFAULT 'straight_line', accumulated_depreciation real DEFAULT 0, last_depreciation_period text, disposed_at text, disposal_proceeds real, notes text, asset_account_id text REFERENCES accounts(account_id), depreciation_expense_account_id text REFERENCES accounts(account_id), accumulated_depreciation_account_id text REFERENCES accounts(account_id), updated_at integer,
	FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`check_in` text,
	`check_out` text,
	`status` text,
	`total_hours` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
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
CREATE TABLE calendar_feeds ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users_logins(id), token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE TABLE `campaigns` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`campaign_name` text NOT NULL,
	`type` text,
	`objective` text,
	`budget` real,
	`start_date` text,
	`end_date` text,
	`leads_generated` integer,
	`roi` real,
	`status` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `client_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`is_active` integer DEFAULT 1,
	`last_login_at` integer,
	`failed_attempts` integer DEFAULT 0,
	`locked_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`client_name` text NOT NULL,
	`primary_contact` text,
	`contact_email` text,
	`phone` text,
	`industry` text,
	`address` text,
	`onboarding_date` text,
	`contract_status` text,
	`sla_status` text,
	`client_photo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
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
	`uploaded_by` text,
	`created_at` integer NOT NULL, department TEXT NOT NULL DEFAULT 'hr',
	FOREIGN KEY (`uploaded_by`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE compliance_config (
	id TEXT PRIMARY KEY,
	config_key TEXT NOT NULL,
	group_name TEXT NOT NULL,
	label TEXT NOT NULL,
	description TEXT,
	
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
	obligation_type TEXT NOT NULL,          
	authority TEXT NOT NULL,                
	period_label TEXT NOT NULL,             
	due_date TEXT NOT NULL,                 
	status TEXT NOT NULL DEFAULT 'pending', 
	draft_document_id TEXT,                 
	reviewed_by TEXT,
	filed_at TEXT,
	notes TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE TABLE `compliance_obligations` (
	`obligation_id` text PRIMARY KEY NOT NULL,
	`obligation_name` text NOT NULL,
	`applies_to` text,
	`due_date` text,
	`status` text,
	`assigned_officer` text,
	`jurisdiction` text,
	`supporting_doc` text,
	`agreement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `contacts_leads` (
	`contact_id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`company_name` text,
	`email` text,
	`phone` text,
	`lead_source` text,
	`pipeline_stage` text,
	`contact_owner` text,
	`lead_score` integer,
	`created_at` integer NOT NULL
);
CREATE TABLE `content_calendar` (
	`content_id` text PRIMARY KEY NOT NULL,
	`content_title` text NOT NULL,
	`channel` text,
	`owner` text,
	`publish_date` text,
	`status` text,
	`engagement` integer,
	`views` integer,
	`click_through_rate` real,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE conversation_turns (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES agent_conversations(id),
	role TEXT NOT NULL,                     
	content TEXT NOT NULL,
	tool_calls TEXT,                        
	vector_id TEXT,
	created_at INTEGER NOT NULL
);
CREATE TABLE `core_docs` (
	`doc_id` text PRIMARY KEY NOT NULL,
	`doc_title` text NOT NULL,
	`doc_type` text,
	`description` text,
	`upload_date` text,
	`attachment` text,
	`confidential` integer,
	`tags` text,
	`committee_id` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `crm_documents` (
	`doc_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`doc_type` text,
	`r2_key` text NOT NULL,
	`r2_bucket` text,
	`file_size` integer,
	`mime_type` text,
	`uploaded_by_id` text,
	`committee_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `crm_planner_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`event_type` text,
	`start_date` text,
	`end_date` text,
	`all_day` integer,
	`committee_id` text NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `crm_ticket_notes` (
	`note_id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `crm_tickets`(`ticket_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `crm_tickets` (
	`ticket_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`priority` text,
	`category` text,
	`raised_by_type` text,
	`raised_by_id` text,
	`assigned_to` text,
	`committee_id` text NOT NULL,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `deal_pipelines` (
	`pipeline_id` text PRIMARY KEY NOT NULL,
	`pipeline_name` text NOT NULL,
	`created_at` integer NOT NULL
);
CREATE TABLE `deal_stages` (
	`stage_id` text PRIMARY KEY NOT NULL,
	`pipeline_id` text NOT NULL,
	`stage_name` text NOT NULL,
	`order_index` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `deal_pipelines`(`pipeline_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `deals` (
	`deal_id` text PRIMARY KEY NOT NULL,
	`deal_name` text NOT NULL,
	`amount` real DEFAULT 0,
	`pipeline_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`contact_id` text,
	`close_date` text,
	`owner` text,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `deal_pipelines`(`pipeline_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `deal_stages`(`stage_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts_leads`(`contact_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `deployments` (
	`deployment_id` text PRIMARY KEY NOT NULL,
	`deployment_name` text NOT NULL,
	`deployment_status` text,
	`initiated_by` text,
	`start_time` integer,
	`end_time` integer,
	`ci_cd_result` text,
	`rollback_available` integer,
	`logs` text,
	`project_id` text,
	`env_id` text,
	`release_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`env_id`) REFERENCES `environments`(`env_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`release_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `employee_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`document_type` text NOT NULL,
	`url` text NOT NULL,
	`upload_date` text NOT NULL,
	`expiry_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `employee_lab` (
	`employee_id` text NOT NULL,
	`lab_id` text NOT NULL,
	`joined_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lab_id`) REFERENCES `labs`(`lab_id`) ON UPDATE no action ON DELETE no action
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
CREATE TABLE `environments` (
	`env_id` text PRIMARY KEY NOT NULL,
	`env_name` text NOT NULL,
	`env_type` text,
	`status` text,
	`uptime_pct` real,
	`error_rate_pct` real,
	`avg_latency_ms` real,
	`monthly_cost` real,
	`created_at` integer NOT NULL
);
CREATE TABLE `epics` (
	`epic_id` text PRIMARY KEY NOT NULL,
	`epic_name` text NOT NULL,
	`description` text,
	`status` text,
	`priority` text,
	`start_date` text,
	`target_end_date` text,
	`owner` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `fund_requests` (
	`fund_request_id` text PRIMARY KEY NOT NULL,
	`request_name` text NOT NULL,
	`request_date` text,
	`amount_requested` real,
	`purpose` text,
	`approval_status` text,
	`approved_by` text,
	`approval_date` text,
	`disbursement_status` text,
	`disbursement_date` text,
	`committee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `funnels_pipelines` (
	`funnel_id` text PRIMARY KEY NOT NULL,
	`funnel_name` text NOT NULL,
	`conversion_rate_pct` real,
	`stages` text,
	`lead_entry_count` integer,
	`conversions` integer,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `general_journals` (
	`journal_id` text PRIMARY KEY NOT NULL,
	`entry_date` text,
	`description` text,
	`debit_account_id` text,
	`credit_account_id` text,
	`amount` real NOT NULL,
	`ledger_id` text,
	`created_at` integer NOT NULL, `invoice_id` text REFERENCES invoices(invoice_id), lines TEXT,
	FOREIGN KEY (`debit_account_id`) REFERENCES `accounts`(`account_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_account_id`) REFERENCES `accounts`(`account_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`ledger_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE generated_documents (
	id TEXT PRIMARY KEY,
	doc_type TEXT NOT NULL,
	period_label TEXT NOT NULL,
	version INTEGER NOT NULL DEFAULT 1,
	file_url TEXT NOT NULL,                 
	generated_by TEXT NOT NULL DEFAULT 'pleiades-accountant',
	generation_basis TEXT,                  
	compliance_event_id TEXT,               
	vector_id TEXT,                         
	created_at INTEGER NOT NULL
);
CREATE TABLE `intellectual_property` (
	`ip_id` text PRIMARY KEY NOT NULL,
	`asset_name` text NOT NULL,
	`ip_type` text,
	`registered_owner` text,
	`registration_number` text,
	`jurisdiction` text,
	`filing_date` text,
	`expiry_date` text,
	`status` text,
	`supporting_docs` text,
	`party_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `invoices` (
	`invoice_id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`issue_date` text,
	`due_date` text,
	`amount` real,
	`status` text,
	`type` text,
	`vendor_name` text,
	`description` text,
	`client_id` text,
	`committee_id` text,
	`fund_request_id` text,
	`created_at` integer NOT NULL, invoice_doc TEXT,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_request_id`) REFERENCES `fund_requests`(`fund_request_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `issues` (
	`issue_id` text PRIMARY KEY NOT NULL,
	`issue_title` text NOT NULL,
	`description` text,
	`severity` text,
	`status` text,
	`sla_target_date` text,
	`reported_date` text,
	`resolved_date` text,
	`assigned_to` text,
	`project_id` text,
	`story_id` text,
	`env_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`story_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`env_id`) REFERENCES `environments`(`env_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE knowledge_documents (
	id TEXT PRIMARY KEY,
	r2_key TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	namespace TEXT NOT NULL DEFAULT 'compliance',
	chunk_count INTEGER NOT NULL DEFAULT 0,
	characters INTEGER NOT NULL DEFAULT 0,
	
	status TEXT NOT NULL DEFAULT 'pending',
	error TEXT,
	ingested_by TEXT,
	ingested_at INTEGER,
	created_at INTEGER NOT NULL
);
CREATE TABLE `labs` (
	`lab_id` text PRIMARY KEY NOT NULL,
	`lab_name` text NOT NULL,
	`category` text,
	`description` text,
	`status` text,
	`ops_lead_id` text,
	`lab_photo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ops_lead_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `leads_activity` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`activity_type` text,
	`timestamp` integer,
	`notes` text,
	`automation_trigger` integer,
	`contact_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts_leads`(`contact_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `leave_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`total_accrued` real DEFAULT 0,
	`total_used` real DEFAULT 0,
	`year` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`approved_by` text,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `ledgers` (
	`ledger_id` text PRIMARY KEY NOT NULL,
	`ledger_name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `legal_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`request_title` text NOT NULL,
	`category` text,
	`priority` text,
	`status` text,
	`assigned_member` text,
	`date_submitted` text,
	`resolution_notes` text,
	`committee_id` text,
	`party_id` text,
	`agreement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `legal_sops` (
	`sop_id` text PRIMARY KEY NOT NULL,
	`sop_title` text NOT NULL,
	`applicable_dept` text,
	`policy_type` text,
	`effective_date` text,
	`last_reviewed` text,
	`owner` text,
	`approval_status` text,
	`doc_attachment` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `legal_templates` (
	`template_id` text PRIMARY KEY NOT NULL,
	`document_name` text NOT NULL,
	`version_number` text,
	`jurisdiction` text,
	`last_updated` text,
	`approved_by` text,
	`template_file` text,
	`is_latest` integer,
	`created_at` integer NOT NULL
);
CREATE TABLE `legal_tracker` (
	`tracker_id` text PRIMARY KEY NOT NULL,
	`contract_type` text,
	`legal_status` text,
	`contract_date` text,
	`expiry_date` text,
	`contract_age_days` integer,
	`is_overdue` integer,
	`contract_photo` text,
	`employee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`original_amount` real NOT NULL,
	`remaining_balance` real NOT NULL,
	`monthly_installment` real NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `monthly_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`report_name` text NOT NULL,
	`report_month` text,
	`committee_id` text,
	`finance_clearance` integer,
	`hr_clearance` integer,
	`legal_clearance` integer,
	`ops_clearance` integer,
	`ops_final_approval` integer,
	`finance_notes` text,
	`hr_notes` text,
	`legal_notes` text,
	`ops_notes` text,
	`report_doc` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE notifications_log (
	id TEXT PRIMARY KEY,
	channel TEXT NOT NULL,                  
	subject_or_summary TEXT NOT NULL,
	related_document_id TEXT,
	related_compliance_event_id TEXT,
	sent_at INTEGER NOT NULL,
	status TEXT NOT NULL                    
);
CREATE TABLE `outreach_logs` (
	`log_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`dms_sent` integer DEFAULT 0,
	`emails_sent` integer DEFAULT 0,
	`replies_received` integer DEFAULT 0,
	`forwards` integer DEFAULT 0,
	`meetings_booked` integer DEFAULT 0,
	`notes` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `parties_stakeholders` (
	`party_id` text PRIMARY KEY NOT NULL,
	`entity_name` text NOT NULL,
	`type` text,
	`contact_information` text,
	`risk_status` text,
	`jurisdiction` text,
	`party_photo` text,
	`created_at` integer NOT NULL
);
CREATE TABLE password_reset_tokens (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, token_hash text NOT NULL, requested_at integer NOT NULL, expires_at integer NOT NULL, approved_by_user_id text, approved_at integer, status text DEFAULT 'pending' NOT NULL, FOREIGN KEY (user_id) REFERENCES users_logins(id));
CREATE TABLE `payroll_records` (
	`payroll_id` text PRIMARY KEY NOT NULL,
	`payroll_month` text,
	`gross_salary` real,
	`withholding_tax` real,
	`other_deductions` real,
	`bonuses` real,
	`net_pay` real,
	`raise_amount` real,
	`disbursement_status` text,
	`payment_date` text,
	`finance_reference` text,
	`employee_id` text,
	`created_at` integer NOT NULL, `allowances_breakdown` text, `deductions_breakdown` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `performance_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`review_period` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`score` real,
	`feedback` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
CREATE TABLE `pl_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`report_no` text NOT NULL,
	`period` text,
	`period_start` text,
	`period_end` text,
	`total_income` real,
	`total_expenses` real,
	`total_salary` real,
	`other_capital_inputs` real,
	`drawings` real,
	`tax` real,
	`gross_profit` real,
	`net_profit` real,
	`pl_notes` text,
	`pdf_attachment` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `projects` (
	`project_id` text PRIMARY KEY NOT NULL,
	`project_name` text NOT NULL,
	`description` text,
	`start_date` text,
	`end_date` text,
	`status` text,
	`priority` text,
	`budget` real,
	`client_name` text,
	`committee_id` text,
	`owner` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `releases` (
	`release_id` text PRIMARY KEY NOT NULL,
	`release_name` text NOT NULL,
	`version` text,
	`release_date` text,
	`status` text,
	`ci_cd_result` text,
	`release_notes` text,
	`release_owner` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `salary_components` (
	`id` text PRIMARY KEY NOT NULL,
	`structure_id` text NOT NULL,
	`component_name` text NOT NULL,
	`component_type` text NOT NULL,
	`amount_type` text NOT NULL,
	`value` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`structure_id`) REFERENCES `salary_structures`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `salary_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`previous_salary` real NOT NULL,
	`new_salary` real NOT NULL,
	`effective_date` text NOT NULL,
	`reason` text,
	`approved_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `salary_structures` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`base_salary` real NOT NULL,
	`effective_date` text NOT NULL,
	`active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `sectors` (
	`sector_id` text PRIMARY KEY NOT NULL,
	`sector_name` text NOT NULL,
	`sector_type` text,
	`budget_amount` real,
	`head_employee_id` text,
	`sector_photo` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`head_employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `sprints` (
	`sprint_id` text PRIMARY KEY NOT NULL,
	`sprint_name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`sprint_goals` text,
	`status` text,
	`created_at` integer NOT NULL
);
CREATE TABLE `stories` (
	`story_id` text PRIMARY KEY NOT NULL,
	`story_title` text NOT NULL,
	`description` text,
	`status` text,
	`story_points` integer,
	`priority` text,
	`acceptance_criteria` text,
	`tags` text,
	`due_date` text,
	`epic_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`epic_id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `task_assignments` (`assignment_id` text PRIMARY KEY NOT NULL, `task_id` text NOT NULL, `employee_id` text NOT NULL, `assigned_at` integer NOT NULL, FOREIGN KEY (`task_id`) REFERENCES `universal_tasks`(`task_id`) ON UPDATE no action ON DELETE no action, FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action);
CREATE TABLE `task_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`uploaded_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES "universal_tasks_old"(`task_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE "transactions" (
  `transaction_id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `transaction_date` text,
  `amount` real,
  `transaction_type` text,
  `description` text,
  `approved` integer,
  `created_by` text,
  `committee_id` text REFERENCES committees(committee_id),
  `client_id` text REFERENCES clients(client_id),
  `account_id` text REFERENCES accounts(account_id),
  `invoice_id` text REFERENCES invoices(invoice_id),
  `fund_request_id` text REFERENCES fund_requests(fund_request_id),
  `created_at` integer NOT NULL
);
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
CREATE TABLE `user_dashboard_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferences` text,
	`last_accessed` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE TABLE `user_notes` (
	`note_id` text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`pinned` integer DEFAULT 0,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
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
CREATE UNIQUE INDEX `client_logins_email_unique` ON `client_logins` (`email`);
CREATE INDEX company_documents_department_idx
	ON company_documents (department);
CREATE INDEX compliance_config_group_idx
	ON compliance_config (group_name, sort_order);
CREATE UNIQUE INDEX compliance_config_key_from_unique
	ON compliance_config (config_key, effective_from);
CREATE INDEX compliance_events_due_status_idx
	ON compliance_events (due_date, status);
CREATE INDEX conversation_turns_conversation_idx
	ON conversation_turns (conversation_id, created_at);
CREATE UNIQUE INDEX `employees_airtable_user_id_unique` ON `employees` (`airtable_user_id`);
CREATE UNIQUE INDEX `employees_slack_id_unique` ON `employees` (`slack_id`);
CREATE INDEX generated_documents_period_type_idx
	ON generated_documents (period_label, doc_type);
CREATE UNIQUE INDEX generated_documents_type_period_version_unique
	ON generated_documents (doc_type, period_label, version);
CREATE INDEX idx_assets_class ON assets(asset_class);
CREATE INDEX idx_assets_status ON assets(status);
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);
CREATE INDEX knowledge_documents_status_idx
	ON knowledge_documents (status, created_at);
CREATE UNIQUE INDEX `permissions_name_unique` ON `permissions` (`name`);
CREATE UNIQUE INDEX `pl_reports_report_no_unique` ON `pl_reports` (`report_no`);
CREATE UNIQUE INDEX user_app_permissions_user_app_feature_unique
	ON user_app_permissions (user_id, app_name, feature);
CREATE INDEX user_app_permissions_user_idx
	ON user_app_permissions (user_id);
CREATE UNIQUE INDEX users_logins_email_unique ON users_logins (email);
CREATE UNIQUE INDEX users_logins_username_unique ON users_logins (username);
