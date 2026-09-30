-- `task_attachments.task_id` pointed at a table that does not exist.
--
-- Its foreign key named `universal_tasks_old`, which is the temporary name a past
-- hand-run rebuild of `universal_tasks` used. SQLite rewrites the foreign keys of
-- DEPENDENT tables when a table is renamed (unless `legacy_alter_table` is on), so
-- `ALTER TABLE universal_tasks RENAME TO universal_tasks_old` silently repointed
-- this one at the temporary name, and dropping the temporary table afterwards left
-- it pointing at nothing.
--
-- The consequence is not subtle and is live: SQLite resolves a foreign key target
-- at write time, so EVERY insert into this table fails with
-- `no such table: main.universal_tasks_old`. Attaching a file to a task has never
-- worked in production, which is why the table has zero rows — the feature looks
-- implemented, and the error surfaces as a 500 from the upload.
--
-- Nothing in `packages/database/migrations/` did this, so there was no file to
-- read it out of. It was found by a test doing the one thing nothing else did:
-- inserting a row.
--
-- The table is empty, so the rebuild copies nothing. The pragma is still required —
-- it references `universal_tasks` and `users_logins`, and D1 enforces foreign keys,
-- so dropping it inside a transaction trips the deferred-constraint counter unless
-- the check moves to COMMIT. See the note in 0025.

PRAGMA defer_foreign_keys = true;

CREATE TABLE `task_attachments_new` (
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

INSERT INTO `task_attachments_new` (`id`, `task_id`, `title`, `r2_key`, `file_size`, `mime_type`, `uploaded_by_id`, `created_at`)
SELECT `id`, `task_id`, `title`, `r2_key`, `file_size`, `mime_type`, `uploaded_by_id`, `created_at` FROM `task_attachments`;

DROP TABLE `task_attachments`;
ALTER TABLE `task_attachments_new` RENAME TO `task_attachments`;

PRAGMA defer_foreign_keys = false;
