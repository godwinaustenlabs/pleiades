CREATE TABLE `user_app_access` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_name` text NOT NULL,
	`access_level` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
