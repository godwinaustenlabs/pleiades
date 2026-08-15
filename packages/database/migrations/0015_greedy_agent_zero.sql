CREATE TABLE `general_journals` (
	`journal_id` text PRIMARY KEY NOT NULL,
	`entry_date` text,
	`description` text,
	`debit_account_id` text,
	`credit_account_id` text,
	`amount` real NOT NULL,
	`ledger_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`debit_account_id`) REFERENCES `accounts`(`account_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`credit_account_id`) REFERENCES `accounts`(`account_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ledger_id`) REFERENCES `ledgers`(`ledger_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`ledger_id` text PRIMARY KEY NOT NULL,
	`ledger_name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE accounts ADD `ledger_id` text REFERENCES ledgers(ledger_id);--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/