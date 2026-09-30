-- Two "who did this" columns become nullable.
--
--   crm_ticket_notes.author_id
--   performance_reviews.reviewer_id
--
-- Every other column recording who did something — `universal_tasks.creator_id`,
-- `crm_documents.uploaded_by_id`, `email_messages.created_by`, `leave_requests.
-- approved_by`, a dozen more — is nullable. That is what lets a person be removed
-- while the thing they wrote survives with the name cleared off it. These two were
-- NOT NULL, and the difference had a consequence that only shows up on a deletion:
-- removing a leaver's record meant either destroying rows that are somebody ELSE's
-- history, or refusing the deletion outright.
--
-- Both rows belong to the other person. A performance review is the REVIEWEE's
-- record — `employee_id` is them, `reviewer_id` is merely who wrote it — and a
-- ticket note is part of a conversation somebody is still reading. Neither should
-- disappear because its author left the company; both should keep their content and
-- lose the name.
--
-- Found by the employee-deletion cascade, which fails with
-- `NOT NULL constraint failed: performance_reviews.reviewer_id` the first time it
-- tries to remove somebody who has ever reviewed a colleague.
--
-- Both tables are empty in production and neither is referenced by anything, so the
-- rebuilds copy nothing. The pragma is still required: both reference other tables,
-- D1 enforces foreign keys, and dropping a table inside a transaction trips the
-- deferred-constraint counter unless the check moves to COMMIT. See the note in 0025.

PRAGMA defer_foreign_keys = true;

CREATE TABLE `crm_ticket_notes_new` (
	`note_id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `crm_tickets`(`ticket_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users_logins`(`id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO `crm_ticket_notes_new` (`note_id`, `ticket_id`, `author_id`, `content`, `created_at`)
SELECT `note_id`, `ticket_id`, `author_id`, `content`, `created_at` FROM `crm_ticket_notes`;
DROP TABLE `crm_ticket_notes`;
ALTER TABLE `crm_ticket_notes_new` RENAME TO `crm_ticket_notes`;

CREATE TABLE `performance_reviews_new` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`review_period` text NOT NULL,
	`reviewer_id` text,
	`score` real,
	`feedback` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
INSERT INTO `performance_reviews_new` (`id`, `employee_id`, `review_period`, `reviewer_id`, `score`, `feedback`, `created_at`)
SELECT `id`, `employee_id`, `review_period`, `reviewer_id`, `score`, `feedback`, `created_at` FROM `performance_reviews`;
DROP TABLE `performance_reviews`;
ALTER TABLE `performance_reviews_new` RENAME TO `performance_reviews`;

PRAGMA defer_foreign_keys = false;
