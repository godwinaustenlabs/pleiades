CREATE TABLE `deal_pipelines` (
	`pipeline_id` text PRIMARY KEY NOT NULL,
	`pipeline_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deal_stages` (
	`stage_id` text PRIMARY KEY NOT NULL,
	`pipeline_id` text NOT NULL,
	`stage_name` text NOT NULL,
	`order_index` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `deal_pipelines`(`pipeline_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`deal_id` text PRIMARY KEY NOT NULL,
	`deal_name` text NOT NULL,
	`amount` real DEFAULT 0,
	`pipeline_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`contact_id` text,
	`close_date` text,
	`owner` text,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `deal_pipelines`(`pipeline_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `deal_stages`(`stage_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts_leads`(`contact_id`) ON UPDATE no action ON DELETE no action
);
