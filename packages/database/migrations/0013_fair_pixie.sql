CREATE TABLE `outreach_logs` (
	`log_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`dms_sent` integer DEFAULT 0,
	`emails_sent` integer DEFAULT 0,
	`replies_received` integer DEFAULT 0,
	`forwards` integer DEFAULT 0,
	`meetings_booked` integer DEFAULT 0,
	`notes` text,
	`created_at` integer NOT NULL
);
