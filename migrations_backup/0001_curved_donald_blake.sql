CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`requested_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`approved_by_user_id` text,
	`approved_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `role_hierarchy` (
	`role_id` text PRIMARY KEY NOT NULL,
	`level` integer NOT NULL,
	`can_provision_role_ids` text DEFAULT '[]',
	`allowed_modules` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_ownership` (
	`user_id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`assigned_at` integer NOT NULL,
	`assigned_by_user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE users_logins ADD `last_login_at` integer;--> statement-breakpoint
ALTER TABLE users_logins ADD `failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE users_logins ADD `locked_until` integer;--> statement-breakpoint
ALTER TABLE users_logins ADD `created_by_user_id` text;--> statement-breakpoint
ALTER TABLE users_logins ADD `password_updated_at` integer;