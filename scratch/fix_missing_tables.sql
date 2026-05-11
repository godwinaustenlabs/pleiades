CREATE TABLE IF NOT EXISTS `client_logins` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `client_logins_email_unique` ON `client_logins` (`email`);

CREATE TABLE IF NOT EXISTS `crm_tickets` (
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

CREATE TABLE IF NOT EXISTS `crm_documents` (
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

CREATE TABLE IF NOT EXISTS `crm_planner_events` (
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

CREATE TABLE IF NOT EXISTS `user_dashboard_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferences` text,
	`last_accessed` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `user_notes` (
	`note_id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`pinned` integer DEFAULT 0,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `crm_ticket_notes` (
	`note_id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `crm_tickets`(`ticket_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
