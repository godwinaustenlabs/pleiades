CREATE TABLE `app_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_app` text NOT NULL,
	`target_app` text NOT NULL,
	`sender_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`priority` text DEFAULT 'medium',
	`is_resolved` integer DEFAULT false,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sender_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
