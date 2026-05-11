-- Migration to fix foreign key constraint on universal_tasks.assignee_id
-- SQLite requires table recreation to change foreign keys

PRAGMA foreign_keys=OFF;

-- 1. Create temporary table with the correct schema
CREATE TABLE `universal_tasks_new` (
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

-- 2. Copy data from the old table
-- Note: we use 'INSERT OR IGNORE' just in case, but it should be clean.
INSERT INTO `universal_tasks_new` (
    `task_id`, `title`, `description`, `status`, `priority`, `department`,
    `assignee_id`, `creator_id`, `appointment_id`, `committee_id`, `board_position`,
    `related_entity_id`, `related_entity_type`, `due_date`, `completed_at`, `created_at`, `updated_at`
)
SELECT 
    `task_id`, `title`, `description`, `status`, `priority`, `department`,
    `assignee_id`, `creator_id`, `appointment_id`, `committee_id`, `board_position`,
    `related_entity_id`, `related_entity_type`, `due_date`, `completed_at`, `created_at`, `updated_at`
FROM `universal_tasks`;

-- 3. Drop old table and rename new one
DROP TABLE `universal_tasks`;
ALTER TABLE `universal_tasks_new` RENAME TO `universal_tasks`;

PRAGMA foreign_keys=ON;
