-- 1) Turn off FK checks temporarily
PRAGMA foreign_keys = OFF;

-- 2) Rename old table
DROP TABLE universal_tasks_old;
ALTER TABLE universal_tasks RENAME TO universal_tasks_old;



CREATE TABLE `universal_tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`priority` text,
	`department` text NOT NULL,
	`assignee_id` text,
	`creator_id` text,
	`related_entity_id` text,
	`related_entity_type` text,
	`due_date` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`task_type` text NOT NULL,
	`board_position` text NOT NULL,
	`committee_id` text,
	`appointment_id` text,
	`estimated_hours` real NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`appointment_id`) ON UPDATE no action ON DELETE no action
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);

-- 6) Re-enable FK checks
PRAGMA foreign_keys=ON;