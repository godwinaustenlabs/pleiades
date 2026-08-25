-- Compliance configuration the operator owns.
--
-- Replaces calc_config (0027). That table stored each rule as an opaque JSON
-- blob, which was fine for a migration to seed and impossible for a person to
-- edit in a form. Compliance figures are not ours to decide: tax rates, the
-- EOBI wage base, the tax-year boundary and the company's own registration
-- details change with each Finance Act and provincial notification, and the
-- operator is the one who knows them.
--
-- So every variable is a typed, labelled, grouped row an admin edits in the
-- agent settings UI, and the configured values are injected into the agent's
-- system prompt at request time. Nothing compliance-related is hardcoded in
-- code or prompt, and nothing is invented by the model.
--
-- `value` is NULL when the operator has not set it yet. A NULL on a row with
-- required = 1 is what makes the agent refuse to produce a dependent figure,
-- rather than guessing — the same contract calc_config's `blocking` flag had,
-- expressed per variable instead of per rule.
--
-- Defaults below are only those the spec states plainly. Anything the spec
-- gave as a range, an endpoint or an explicit "not confirmed" ships as NULL:
-- the salary slab table, the vendor rate table, the EOBI wage base, every
-- PESSI/SESSI figure, the provincial sales-tax rate, and both thresholds the
-- spec marked approximate.

DROP TABLE IF EXISTS calc_config;

CREATE TABLE compliance_config (
	id TEXT PRIMARY KEY,
	config_key TEXT NOT NULL,
	group_name TEXT NOT NULL,
	label TEXT NOT NULL,
	description TEXT,
	-- percent | currency | number | date | text | boolean | json
	value_type TEXT NOT NULL,
	unit TEXT,
	value TEXT,
	required INTEGER NOT NULL DEFAULT 1,
	sort_order INTEGER NOT NULL DEFAULT 0,
	effective_from TEXT NOT NULL,
	effective_to TEXT,
	updated_by TEXT,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- A Finance Act change is a new row with a later effective_from, so a document
-- generated last year stays explainable by the rate that applied then.
CREATE UNIQUE INDEX compliance_config_key_from_unique
	ON compliance_config (config_key, effective_from);

CREATE INDEX compliance_config_group_idx
	ON compliance_config (group_name, sort_order);


INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_legal_name', 'company_legal_name', 'company', 'Legal name', 'As registered with SECP.', 'text', NULL, NULL, 1, 0, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_secp_reg_no', 'company_secp_reg_no', 'company', 'SECP registration number', NULL, 'text', NULL, NULL, 1, 1, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_ntn', 'company_ntn', 'company', 'NTN', 'FBR National Tax Number.', 'text', NULL, NULL, 1, 2, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_sales_tax_reg', 'company_sales_tax_reg', 'company', 'Sales tax registration', 'Leave blank if not registered.', 'text', NULL, NULL, 0, 3, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_province', 'company_province', 'company', 'Registered province', 'Decides PESSI vs SESSI, and which provincial revenue authority applies.', 'text', NULL, NULL, 1, 4, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_pseb_status', 'company_pseb_status', 'company', 'PSEB registration status', 'Drives the IT-export tax treatment.', 'text', NULL, NULL, 1, 5, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_accountant_name', 'accountant_name', 'company', 'Accountant of record', 'The person who reviews and files every draft.', 'text', NULL, NULL, 1, 6, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_accountant_email', 'accountant_email', 'company', 'Accountant email', NULL, 'text', NULL, NULL, 1, 7, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_operator_email', 'operator_email', 'company', 'Operator email', 'Where deliverable notifications are sent.', 'text', NULL, NULL, 1, 8, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_slack_channel', 'slack_channel', 'company', 'Slack channel', 'Channel or webhook target for notifications.', 'text', NULL, NULL, 0, 9, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_tax_year_start', 'tax_year_start', 'tax_year', 'Tax year starts', 'Month and day the tax year opens.', 'date', 'MM-DD', '07-01', 1, 10, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_tax_year_end', 'tax_year_end', 'tax_year', 'Tax year ends', 'Month and day the tax year closes.', 'date', 'MM-DD', '06-30', 1, 11, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_current_tax_year_label', 'current_tax_year_label', 'tax_year', 'Current tax year label', 'How filings for the current year are labelled, e.g. TY2027.', 'text', NULL, 'TY2027', 1, 12, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_tax_standard_pct', 'company_tax_standard_pct', 'income_tax', 'Standard company rate', 'Applies when no concessionary regime does.', 'percent', '%', '29', 1, 13, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_company_tax_small_pct', 'company_tax_small_pct', 'income_tax', 'Small company rate', NULL, 'percent', '%', '20', 0, 14, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_small_company_turnover_ceiling', 'small_company_turnover_ceiling', 'income_tax', 'Small company turnover ceiling', 'Above this the small-company rate does not apply.', 'currency', 'PKR', '250000000', 0, 15, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pseb_export_final_tax_pct', 'pseb_export_final_tax_pct', 'income_tax', 'IT export final tax (s154A)', 'Normally the governing rate for export revenue.', 'percent', '%', '0.25', 1, 16, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_section_65f_exemption', 'section_65f_exemption', 'income_tax', 'Section 65F exemption applies', 'Full exemption instead of the final tax, subject to the banking-channel condition.', 'boolean', NULL, 'false', 0, 17, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_section_65f_banking_pct', 'section_65f_banking_pct', 'income_tax', 'Section 65F banking-channel condition', 'Share of export proceeds that must arrive through banking channels.', 'percent', '%', '80', 0, 18, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_minimum_tax_pct', 'minimum_tax_pct', 'minimum_tax', 'Minimum tax rate', 'Of turnover, payable even on a loss (s113).', 'percent', '%', '1.25', 1, 19, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_minimum_tax_threshold', 'minimum_tax_threshold', 'minimum_tax', 'Minimum tax turnover threshold', 'Confirm against the current Finance Act.', 'currency', 'PKR', NULL, 1, 20, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_advance_tax_due_dates', 'advance_tax_due_dates', 'advance_tax', 'Quarterly due dates', 'Section 147 instalment dates, as MM-DD.', 'json', NULL, '["09-15","12-15","03-15","06-15"]', 1, 21, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_salary_withholding_slabs', 'salary_withholding_slabs', 'salary_withholding', 'Salary tax slabs', 'The full progressive slab table (s149). Every bracket must be entered; the agent will not interpolate.', 'json', NULL, NULL, 1, 22, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_salary_wht_deposit_day', 'salary_wht_deposit_day', 'salary_withholding', 'Deposit and statement day', 'Day of the following month the deposit and statement are due.', 'number', NULL, '15', 1, 23, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_vendor_withholding_rates', 'vendor_withholding_rates', 'vendor_withholding', 'Withholding rates by payment type', 'Filer and non-filer rate per service or goods type (s153).', 'json', NULL, NULL, 1, 24, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_vendor_de_minimis_services', 'vendor_de_minimis_services', 'vendor_withholding', 'De minimis — services', 'No withholding below this annual total to one payee.', 'currency', 'PKR', '30000', 0, 25, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_vendor_de_minimis_goods', 'vendor_de_minimis_goods', 'vendor_withholding', 'De minimis — goods', NULL, 'currency', 'PKR', '75000', 0, 26, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_min_employees', 'eobi_min_employees', 'eobi', 'Mandatory at employee count', NULL, 'number', NULL, '5', 1, 27, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_employer_pct', 'eobi_employer_pct', 'eobi', 'Employer contribution', 'Of the notified minimum wage, not actual salary.', 'percent', '%', '5', 1, 28, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_employee_pct', 'eobi_employee_pct', 'eobi', 'Employee contribution', NULL, 'percent', '%', '1', 1, 29, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_notified_min_wage', 'eobi_notified_min_wage', 'eobi', 'Notified minimum wage', 'The wage base contributions are calculated on. Revised periodically.', 'currency', 'PKR', NULL, 1, 30, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_eobi_deposit_day', 'eobi_deposit_day', 'eobi', 'Deposit day', 'Day of the following month.', 'number', NULL, '15', 1, 31, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pessi_sessi_authority', 'pessi_sessi_authority', 'pessi_sessi', 'Institution', 'PESSI (Punjab) or SESSI (Sindh), by registered office.', 'text', NULL, NULL, 1, 32, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pessi_sessi_rate_pct', 'pessi_sessi_rate_pct', 'pessi_sessi', 'Contribution rate', 'Verify against the current provincial notification.', 'percent', '%', NULL, 1, 33, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_pessi_sessi_wage_ceiling', 'pessi_sessi_wage_ceiling', 'pessi_sessi', 'Wage ceiling', 'The wage cap contributions are assessed on, if any.', 'currency', 'PKR', NULL, 0, 34, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wwf_pct', 'wwf_pct', 'wwf_wppf', 'WWF rate', 'Of total income.', 'percent', '%', '2', 1, 35, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wwf_income_threshold', 'wwf_income_threshold', 'wwf_wppf', 'WWF income threshold', 'WWF applies once income reaches this.', 'currency', 'PKR', '500000', 1, 36, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wppf_pct', 'wppf_pct', 'wwf_wppf', 'WPPF rate', 'Of audited profit before the WPPF deduction itself.', 'percent', '%', '5', 1, 37, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_sales_tax_authority', 'sales_tax_authority', 'sales_tax', 'Provincial authority', 'SRB, PRA, KPRA or none.', 'text', NULL, NULL, 1, 38, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_sales_tax_services_pct', 'sales_tax_services_pct', 'sales_tax', 'Services sales tax rate', NULL, 'percent', '%', NULL, 1, 39, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_sales_tax_export_exempt', 'sales_tax_export_exempt', 'sales_tax', 'IT export exemption applies', NULL, 'boolean', NULL, 'true', 0, 40, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_form_a_days', 'secp_form_a_days', 'secp', 'Form A deadline', 'Days after AGM or member resolution.', 'number', 'days', '30', 1, 41, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_form_29_days', 'secp_form_29_days', 'secp', 'Form 29 deadline', 'Days after any director or officer change.', 'number', 'days', '14', 1, 42, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_ubo_days', 'secp_ubo_days', 'secp', 'UBO update deadline', 'Days after financial year end.', 'number', 'days', '14', 1, 43, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_secp_audit_threshold', 'secp_audit_threshold', 'secp', 'Audit required above paid-up capital', 'Below this, unaudited accounts with a director affidavit. Confirm the current SECP figure.', 'currency', 'PKR', NULL, 1, 44, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_return_due_date', 'return_due_date', 'filing_deadlines', 'Company return due', 'Date the annual return is due, as MM-DD.', 'date', 'MM-DD', '12-31', 1, 45, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_wealth_statement_due', 'wealth_statement_due', 'filing_deadlines', 'Director wealth statement due', 'Section 116, separate from the company return.', 'date', 'MM-DD', '09-30', 1, 46, '2026-07-01', unixepoch(), unixepoch());

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value, required, sort_order, effective_from, created_at, updated_at)
VALUES ('cc_nil_return_required', 'nil_return_required', 'filing_deadlines', 'Nil return still required', 'Generate the filing even when there is nothing to report.', 'boolean', NULL, 'true', 1, 47, '2026-07-01', unixepoch(), unixepoch());
