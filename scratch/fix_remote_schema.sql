-- Fix missing columns in universal_tasks
ALTER TABLE universal_tasks ADD COLUMN task_type TEXT;
ALTER TABLE universal_tasks ADD COLUMN estimated_hours REAL;

-- Create missing user_notifications table
CREATE TABLE IF NOT EXISTS `user_notifications` (
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

-- Create missing task_attachments table
CREATE TABLE IF NOT EXISTS `task_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`r2_key` text NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`uploaded_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `universal_tasks`(`task_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
