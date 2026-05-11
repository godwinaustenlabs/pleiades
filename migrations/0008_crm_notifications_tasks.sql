-- Migration: 0008_crm_notifications_tasks
-- Description: Add missing task columns, create notifications and attachments tables

-- 1. Update universal_tasks table


-- 2. Create user_notifications table
CREATE TABLE `user_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`link` text,
	`is_read` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);

-- 3. Create task_attachments table
CREATE TABLE `task_attachments` (
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
