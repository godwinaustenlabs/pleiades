CREATE TABLE `calendar_feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_app_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_name` text NOT NULL,
	`feature` text NOT NULL,
	`can_view` integer DEFAULT false,
	`can_edit` integer DEFAULT false,
	`can_delete` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `crm_ticket_notes` (
	`note_id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `crm_tickets`(`ticket_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
/*
 SQLite does not support "Dropping foreign key" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE user_app_access ADD `can_create_tasks` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE users_logins ADD `is_superadmin` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE active_agreements ADD `client_id` text REFERENCES clients(client_id);--> statement-breakpoint
ALTER TABLE universal_tasks ADD `task_type` text;--> statement-breakpoint
ALTER TABLE universal_tasks ADD `estimated_hours` real;--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_token_unique` ON `calendar_feeds` (`token`);--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/