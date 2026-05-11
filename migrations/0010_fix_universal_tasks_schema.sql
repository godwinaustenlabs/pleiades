-- Migration: 0010_fix_universal_tasks_schema
-- Description: Recreate universal_tasks with correct schema, foreign keys, and column types

PRAGMA foreign_keys = OFF;

-- VERIFIED: Both tables are empty in the remote D1 database
DROP TABLE IF EXISTS universal_tasks;
DROP TABLE IF EXISTS universal_tasks_old;

CREATE TABLE `universal_tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`priority` text,
	`department` text NOT NULL,
	`task_type` text,
	`assignee_id` text,
	`creator_id` text,
	`appointment_id` text,
	`committee_id` text,
	`board_position` integer DEFAULT 0,
	`related_entity_id` text,
	`related_entity_type` text,
	`estimated_hours` real,
	`due_date` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`appointment_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);

PRAGMA foreign_keys = ON;
