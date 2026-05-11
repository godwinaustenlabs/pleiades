CREATE TABLE `client_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text,
	`is_active` integer DEFAULT true,
	`last_login_at` integer,
	`failed_attempts` integer DEFAULT 0,
	`locked_until` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `user_dashboard_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferences` text,
	`last_accessed` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_notes` (
	`note_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`pinned` integer DEFAULT false,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP INDEX IF EXISTS `employees_airtable_user_id_unique`;--> statement-breakpoint
ALTER TABLE universal_tasks ADD `appointment_id` text REFERENCES appointments(appointment_id);--> statement-breakpoint
ALTER TABLE universal_tasks ADD `committee_id` text REFERENCES committees(committee_id);--> statement-breakpoint
ALTER TABLE universal_tasks ADD `board_position` integer DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX `client_logins_email_unique` ON `client_logins` (`email`);--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `airtable_user_id`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `airtable_user_id`;--> statement-breakpoint
ALTER TABLE `acq_tasks` DROP COLUMN `airtable_user_id`;