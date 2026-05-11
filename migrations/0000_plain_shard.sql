CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`owner_name` text NOT NULL,
	`role_id` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`details` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role_id` text NOT NULL,
	`is_active` integer DEFAULT true,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`client_name` text NOT NULL,
	`primary_contact` text,
	`contact_email` text,
	`phone` text,
	`industry` text,
	`address` text,
	`onboarding_date` text,
	`contract_status` text,
	`sla_status` text,
	`client_photo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `committee_members` (
	`committee_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`role_in_committee` text,
	`joined_at` text,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `committees` (
	`committee_id` text PRIMARY KEY NOT NULL,
	`committee_name` text NOT NULL,
	`type` text,
	`ops_status` text,
	`purpose` text,
	`date_formed` text,
	`active_status` integer,
	`lab_id` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lab_id`) REFERENCES `labs`(`lab_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `core_docs` (
	`doc_id` text PRIMARY KEY NOT NULL,
	`doc_title` text NOT NULL,
	`doc_type` text,
	`description` text,
	`upload_date` text,
	`attachment` text,
	`confidential` integer,
	`tags` text,
	`committee_id` text,
	`client_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employee_lab` (
	`employee_id` text NOT NULL,
	`lab_id` text NOT NULL,
	`joined_at` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lab_id`) REFERENCES `labs`(`lab_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slack_id` text,
	`airtable_user_id` text,
	`department` text,
	`role` text,
	`employment_status` text,
	`hire_date` text,
	`base_salary` real,
	`efficiency_score` real,
	`profile_photo` text,
	`sector_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `labs` (
	`lab_id` text PRIMARY KEY NOT NULL,
	`lab_name` text NOT NULL,
	`category` text,
	`description` text,
	`status` text,
	`ops_lead_id` text,
	`lab_photo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ops_lead_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monthly_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`report_name` text NOT NULL,
	`report_month` text,
	`committee_id` text,
	`finance_clearance` integer,
	`hr_clearance` integer,
	`legal_clearance` integer,
	`ops_clearance` integer,
	`ops_final_approval` integer,
	`finance_notes` text,
	`hr_notes` text,
	`legal_notes` text,
	`ops_notes` text,
	`report_doc` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `appointments` (
	`appointment_id` text PRIMARY KEY NOT NULL,
	`role_or_title` text,
	`appointment_date` text,
	`term_type` text,
	`appointment_end_date` text,
	`is_active` integer,
	`employee_id` text,
	`committee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `legal_tracker` (
	`tracker_id` text PRIMARY KEY NOT NULL,
	`contract_type` text,
	`legal_status` text,
	`contract_date` text,
	`expiry_date` text,
	`contract_age_days` integer,
	`is_overdue` integer,
	`contract_photo` text,
	`employee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payroll_records` (
	`payroll_id` text PRIMARY KEY NOT NULL,
	`payroll_month` text,
	`gross_salary` real,
	`withholding_tax` real,
	`other_deductions` real,
	`bonuses` real,
	`net_pay` real,
	`raise_amount` real,
	`disbursement_status` text,
	`payment_date` text,
	`finance_reference` text,
	`employee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sectors` (
	`sector_id` text PRIMARY KEY NOT NULL,
	`sector_name` text NOT NULL,
	`sector_type` text,
	`budget_amount` real,
	`head_employee_id` text,
	`sector_photo` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`head_employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`account_id` text PRIMARY KEY NOT NULL,
	`account_name` text NOT NULL,
	`account_type` text,
	`bank_name` text,
	`account_number` text,
	`opening_balance` real,
	`current_balance` real,
	`currency` text,
	`status` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`channel_name` text NOT NULL,
	`channel_type` text,
	`active_status` integer,
	`last_used_date` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fund_requests` (
	`fund_request_id` text PRIMARY KEY NOT NULL,
	`request_name` text NOT NULL,
	`request_date` text,
	`amount_requested` real,
	`purpose` text,
	`approval_status` text,
	`approved_by` text,
	`approval_date` text,
	`disbursement_status` text,
	`disbursement_date` text,
	`committee_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`invoice_id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`issue_date` text,
	`due_date` text,
	`amount` real,
	`status` text,
	`type` text,
	`vendor_name` text,
	`description` text,
	`client_id` text,
	`committee_id` text,
	`fund_request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_request_id`) REFERENCES `fund_requests`(`fund_request_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pl_reports` (
	`report_id` text PRIMARY KEY NOT NULL,
	`report_no` text NOT NULL,
	`period` text,
	`period_start` text,
	`period_end` text,
	`total_income` real,
	`total_expenses` real,
	`total_salary` real,
	`other_capital_inputs` real,
	`drawings` real,
	`tax` real,
	`gross_profit` real,
	`net_profit` real,
	`pl_notes` text,
	`pdf_attachment` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`transaction_date` text,
	`amount` real,
	`transaction_type` text,
	`description` text,
	`approved` integer,
	`created_by` text,
	`committee_id` text,
	`client_id` text,
	`account_id` text,
	`channel_id` text,
	`invoice_id` text,
	`fund_request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`client_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`account_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`channel_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`invoice_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fund_request_id`) REFERENCES `fund_requests`(`fund_request_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `active_agreements` (
	`agreement_id` text PRIMARY KEY NOT NULL,
	`agreement_name` text NOT NULL,
	`contract_type` text,
	`effective_date` text,
	`expiry_date` text,
	`auto_renewal` integer,
	`payment_terms` text,
	`status` text,
	`signed_doc` text,
	`committee_id` text,
	`template_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `legal_templates`(`template_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agreement_parties` (
	`agreement_id` text NOT NULL,
	`party_id` text NOT NULL,
	`party_role` text,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `compliance_obligations` (
	`obligation_id` text PRIMARY KEY NOT NULL,
	`obligation_name` text NOT NULL,
	`applies_to` text,
	`due_date` text,
	`status` text,
	`assigned_officer` text,
	`jurisdiction` text,
	`supporting_doc` text,
	`agreement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `intellectual_property` (
	`ip_id` text PRIMARY KEY NOT NULL,
	`asset_name` text NOT NULL,
	`ip_type` text,
	`registered_owner` text,
	`registration_number` text,
	`jurisdiction` text,
	`filing_date` text,
	`expiry_date` text,
	`status` text,
	`supporting_docs` text,
	`party_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `legal_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`request_title` text NOT NULL,
	`category` text,
	`priority` text,
	`status` text,
	`assigned_member` text,
	`date_submitted` text,
	`resolution_notes` text,
	`committee_id` text,
	`party_id` text,
	`agreement_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`party_id`) REFERENCES `parties_stakeholders`(`party_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agreement_id`) REFERENCES `active_agreements`(`agreement_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `legal_sops` (
	`sop_id` text PRIMARY KEY NOT NULL,
	`sop_title` text NOT NULL,
	`applicable_dept` text,
	`policy_type` text,
	`effective_date` text,
	`last_reviewed` text,
	`owner` text,
	`approval_status` text,
	`doc_attachment` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `legal_templates` (
	`template_id` text PRIMARY KEY NOT NULL,
	`document_name` text NOT NULL,
	`version_number` text,
	`jurisdiction` text,
	`last_updated` text,
	`approved_by` text,
	`template_file` text,
	`is_latest` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `parties_stakeholders` (
	`party_id` text PRIMARY KEY NOT NULL,
	`entity_name` text NOT NULL,
	`type` text,
	`contact_information` text,
	`risk_status` text,
	`jurisdiction` text,
	`party_photo` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deployments` (
	`deployment_id` text PRIMARY KEY NOT NULL,
	`deployment_name` text NOT NULL,
	`deployment_status` text,
	`initiated_by` text,
	`start_time` integer,
	`end_time` integer,
	`ci_cd_result` text,
	`rollback_available` integer,
	`logs` text,
	`project_id` text,
	`env_id` text,
	`release_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`env_id`) REFERENCES `environments`(`env_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`release_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `environments` (
	`env_id` text PRIMARY KEY NOT NULL,
	`env_name` text NOT NULL,
	`env_type` text,
	`status` text,
	`uptime_pct` real,
	`error_rate_pct` real,
	`avg_latency_ms` real,
	`monthly_cost` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `epics` (
	`epic_id` text PRIMARY KEY NOT NULL,
	`epic_name` text NOT NULL,
	`description` text,
	`status` text,
	`priority` text,
	`start_date` text,
	`target_end_date` text,
	`owner` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`issue_id` text PRIMARY KEY NOT NULL,
	`issue_title` text NOT NULL,
	`description` text,
	`severity` text,
	`status` text,
	`sla_target_date` text,
	`reported_date` text,
	`resolved_date` text,
	`assigned_to` text,
	`project_id` text,
	`story_id` text,
	`env_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`story_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`env_id`) REFERENCES `environments`(`env_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`project_id` text PRIMARY KEY NOT NULL,
	`project_name` text NOT NULL,
	`description` text,
	`start_date` text,
	`end_date` text,
	`status` text,
	`priority` text,
	`budget` real,
	`client_name` text,
	`committee_id` text,
	`owner` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `committees`(`committee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`release_id` text PRIMARY KEY NOT NULL,
	`release_name` text NOT NULL,
	`version` text,
	`release_date` text,
	`status` text,
	`ci_cd_result` text,
	`release_notes` text,
	`release_owner` text,
	`project_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`story_id` text PRIMARY KEY NOT NULL,
	`story_title` text NOT NULL,
	`description` text,
	`status` text,
	`story_points` integer,
	`priority` text,
	`acceptance_criteria` text,
	`tags` text,
	`due_date` text,
	`epic_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`epic_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`task_name` text NOT NULL,
	`description` text,
	`status` text,
	`priority` text,
	`assignee` text,
	`airtable_user_id` text,
	`due_date` text,
	`task_type` text,
	`estimated_hours` real,
	`actual_hours` real,
	`completed` integer,
	`story_id` text,
	`release_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`story_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`release_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `acq_tasks` (
	`task_id` text PRIMARY KEY NOT NULL,
	`task_name` text NOT NULL,
	`description` text,
	`priority` text,
	`due_date` text,
	`assignee` text,
	`airtable_user_id` text,
	`status` text,
	`estimated_effort` real,
	`actual_effort` real,
	`sprint_id` text,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`sprint_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`campaign_name` text NOT NULL,
	`type` text,
	`objective` text,
	`budget` real,
	`start_date` text,
	`end_date` text,
	`leads_generated` integer,
	`roi` real,
	`status` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts_leads` (
	`contact_id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`company_name` text,
	`email` text,
	`phone` text,
	`lead_source` text,
	`pipeline_stage` text,
	`contact_owner` text,
	`lead_score` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_calendar` (
	`content_id` text PRIMARY KEY NOT NULL,
	`content_title` text NOT NULL,
	`channel` text,
	`owner` text,
	`publish_date` text,
	`status` text,
	`engagement` integer,
	`views` integer,
	`click_through_rate` real,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `funnels_pipelines` (
	`funnel_id` text PRIMARY KEY NOT NULL,
	`funnel_name` text NOT NULL,
	`conversion_rate_pct` real,
	`stages` text,
	`lead_entry_count` integer,
	`conversions` integer,
	`campaign_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`campaign_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leads_activity` (
	`activity_id` text PRIMARY KEY NOT NULL,
	`activity_type` text,
	`timestamp` integer,
	`notes` text,
	`automation_trigger` integer,
	`contact_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts_leads`(`contact_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sprints` (
	`sprint_id` text PRIMARY KEY NOT NULL,
	`sprint_name` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`sprint_goals` text,
	`status` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_name_unique` ON `permissions` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_logins_email_unique` ON `users_logins` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_slack_id_unique` ON `employees` (`slack_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_airtable_user_id_unique` ON `employees` (`airtable_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_invoice_number_unique` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `pl_reports_report_no_unique` ON `pl_reports` (`report_no`);