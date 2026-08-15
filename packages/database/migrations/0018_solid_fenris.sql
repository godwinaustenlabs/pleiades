CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_name` text NOT NULL,
	`asset_type` text NOT NULL,
	`assigned_to` text,
	`issue_date` text,
	`return_date` text,
	`condition` text,
	`status` text DEFAULT 'Available' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`assigned_to`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`check_in` text,
	`check_out` text,
	`status` text,
	`total_hours` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employee_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`document_type` text NOT NULL,
	`url` text NOT NULL,
	`upload_date` text NOT NULL,
	`expiry_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`total_accrued` real DEFAULT 0,
	`total_used` real DEFAULT 0,
	`year` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`approved_by` text,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`original_amount` real NOT NULL,
	`remaining_balance` real NOT NULL,
	`monthly_installment` real NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `performance_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`review_period` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`score` real,
	`feedback` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `salary_components` (
	`id` text PRIMARY KEY NOT NULL,
	`structure_id` text NOT NULL,
	`component_name` text NOT NULL,
	`component_type` text NOT NULL,
	`amount_type` text NOT NULL,
	`value` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`structure_id`) REFERENCES `salary_structures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `salary_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`previous_salary` real NOT NULL,
	`new_salary` real NOT NULL,
	`effective_date` text NOT NULL,
	`reason` text,
	`approved_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `salary_structures` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`base_salary` real NOT NULL,
	`effective_date` text NOT NULL,
	`active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
/*
 SQLite does not support "Drop not null from column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html
                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3

 Due to that we don't generate migration automatically and it has to be done manually
*/--> statement-breakpoint
ALTER TABLE employees ADD `cnic` text;--> statement-breakpoint
ALTER TABLE employees ADD `dob` text;--> statement-breakpoint
ALTER TABLE employees ADD `gender` text;--> statement-breakpoint
ALTER TABLE employees ADD `address` text;--> statement-breakpoint
ALTER TABLE employees ADD `contact_info` text;--> statement-breakpoint
ALTER TABLE employees ADD `emergency_contact` text;--> statement-breakpoint
ALTER TABLE employees ADD `designation` text;--> statement-breakpoint
ALTER TABLE employees ADD `reporting_manager_id` text;--> statement-breakpoint
ALTER TABLE employees ADD `employment_type` text;--> statement-breakpoint
ALTER TABLE employees ADD `confirmation_date` text;--> statement-breakpoint
ALTER TABLE employees ADD `contract_start_date` text;--> statement-breakpoint
ALTER TABLE employees ADD `contract_end_date` text;--> statement-breakpoint
ALTER TABLE employees ADD `bank_details` text;--> statement-breakpoint
ALTER TABLE employees ADD `tax_information` text;--> statement-breakpoint
ALTER TABLE employees ADD `assigned_office` text;--> statement-breakpoint
ALTER TABLE employees ADD `notes` text;--> statement-breakpoint
ALTER TABLE payroll_records ADD `allowances_breakdown` text;--> statement-breakpoint
ALTER TABLE payroll_records ADD `deductions_breakdown` text;