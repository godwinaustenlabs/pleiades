-- Production DDL, pulled from sqlite_master, so the test database cannot
-- drift from the real one. Regenerate it rather than hand-editing.
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
CREATE UNIQUE INDEX user_app_permissions_user_app_feature_unique
	ON user_app_permissions (user_id, app_name, feature);
CREATE INDEX user_app_permissions_user_idx
	ON user_app_permissions (user_id);
CREATE UNIQUE INDEX users_logins_email_unique ON users_logins (email);
CREATE UNIQUE INDEX users_logins_username_unique ON users_logins (username);
