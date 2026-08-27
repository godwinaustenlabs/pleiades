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
	FOREIGN KEY (`assignee_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE users_logins ADD `username` text;--> statement-breakpoint
ALTER TABLE users_logins ADD `name` text;--> statement-breakpoint
ALTER TABLE appointments ADD `account_id` text REFERENCES users_logins(id);--> statement-breakpoint
CREATE UNIQUE INDEX `users_logins_username_unique` ON `users_logins` (`username`);--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/