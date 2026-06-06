PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `task_assignments` (
	`assignment_id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`assigned_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `universal_tasks`(`task_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Migrate existing data
INSERT INTO `task_assignments` (`assignment_id`, `task_id`, `employee_id`, `assigned_at`)
SELECT 
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-a' || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))), -- dummy UUID for assignment_id
  `task_id`, 
  `assignee_id`, 
  strftime('%s', 'now') * 1000
FROM `universal_tasks` 
WHERE `assignee_id` IS NOT NULL;

--> statement-breakpoint

CREATE TABLE `universal_tasks_new` (
	`task_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`priority` text,
	`department` text NOT NULL,
	`task_type` text,
	`creator_id` text,
	`appointment_id` text,
	`committee_id` text,
	`board_position` integer DEFAULT 0,
	`related_entity_id` text,
	`related_entity_type` text,
	`estimated_hours` real,
	`start_date` text,
	`due_date` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`appointment_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `universal_tasks_new` (`task_id`, `title`, `description`, `status`, `priority`, `department`, `task_type`, `creator_id`, `appointment_id`, `committee_id`, `board_position`, `related_entity_id`, `related_entity_type`, `estimated_hours`, `start_date`, `due_date`, `completed_at`, `created_at`, `updated_at`) SELECT `task_id`, `title`, `description`, `status`, `priority`, `department`, `task_type`, `creator_id`, `appointment_id`, `committee_id`, `board_position`, `related_entity_id`, `related_entity_type`, `estimated_hours`, `start_date`, `due_date`, `completed_at`, `created_at`, `updated_at` FROM `universal_tasks`;
--> statement-breakpoint
DROP TABLE `universal_tasks`;
--> statement-breakpoint
ALTER TABLE `universal_tasks_new` RENAME TO `universal_tasks`;