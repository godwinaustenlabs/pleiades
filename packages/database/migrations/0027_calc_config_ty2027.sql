-- Seed calc_config with the Tax Year 2027 figures the spec states, and record
-- honestly which of them the spec itself does not consider settled.
--
-- Several entries are deliberately BLOCKING: the spec gives a range, an
-- endpoint, or an explicit "not confirmed", but not a computable number. Those
-- rows carry blocking:true and a why_blocking note so the matching calc_* tool
-- refuses rather than returning a figure. That is the whole point of the
-- "numbers come from tools, not from the model" rule — an agent that invents an
-- intermediate tax bracket is worse than one that says it cannot compute yet.
--
-- To unblock one: insert a NEW row with a later effective_from and
-- verification='verified'. Never edit a row in place — a document generated in
-- the past must remain explainable by the rate that applied when it was made.
--
-- Single-row INSERTs only: D1 rejects multi-row VALUES with "too many terms in
-- compound SELECT" (see migration 0020).


INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_company_tax_rates', 'company_tax_rates', '2026-07-01', NULL,
	'{"standard_company_pct":29,"small_company_pct":20,"small_company_turnover_ceiling_pkr":250000000,"pseb_it_export_final_tax_pct":0.25,"pseb_section":"154A","exemption_alternative":{"section":"65F","condition":"80% of export proceeds through banking channel"},"note":"IT export income is normally the governing rate for this company"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_minimum_tax', 'minimum_tax', '2026-07-01', NULL,
	'{"section":"113","rate_pct_of_turnover":1.25,"applies_even_on_loss":true,"turnover_threshold_pkr":100000000,"threshold_confidence":"approximate \u2014 spec says \"~Rs 100M historically\"; confirm against the current Finance Act"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_advance_tax_schedule', 'advance_tax_schedule', '2026-07-01', NULL,
	'{"section":"147","quarterly_due_dates":["09-15","12-15","03-15","06-15"]}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_salary_withholding_slabs', 'salary_withholding_slabs', '2026-07-01', NULL,
	'{"section":"149","slabs":[],"known_endpoints":{"zero_rate_up_to_pkr":600000,"top_marginal_rate_pct":35,"top_bracket_starts_above_pkr":7000000},"blocking":true,"why_blocking":"The spec gives only the endpoints, not the intermediate brackets. Seeding invented brackets would be exactly the failure the spec forbids (\"numbers come from tools, not from you\"), so calc_salary_withholding must refuse until the full Finance Act slab table is entered here.","deposit_and_statement_due":"15th of the following month"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_vendor_withholding', 'vendor_withholding', '2026-07-01', NULL,
	'{"section":"153","filer_rate_range_pct":[4,15],"non_filer_rate_range_pct":[8,30],"rate_depends_on":"service/goods type \u2014 per-type table not given in the spec","de_minimis_pkr":{"services_per_year":30000,"goods_per_year":75000},"blocking":true,"why_blocking":"Only ranges are known. A range cannot produce a figure; the per-service-type table must be entered before calc_vendor_withholding can return a number.","filer_status_source":"check ATL / accounts software before applying the lower rate"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_eobi_contribution', 'eobi_contribution', '2026-07-01', NULL,
	'{"mandatory_at_employee_count":5,"employer_pct":5,"employee_pct":1,"base":"government-notified minimum wage, NOT actual salary","notified_minimum_wage_pkr":null,"blocking":true,"why_blocking":"The percentages are known but the notified minimum wage they apply to is not in the spec and is revised periodically. Enter the current notified wage to unblock.","deposit_due":"15th of the following month"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_pessi_sessi_contribution', 'pessi_sessi_contribution', '2026-07-01', NULL,
	'{"scope":"provincial \u2014 PESSI (Punjab) / SESSI (Sindh), selected by registered office","rate_pct":null,"threshold":null,"blocking":true,"why_blocking":"The spec states these were not confirmed against a primary source. Section B requires this calculator to return confidence:\"unverified\"; it must not present a figure as settled.","required_output_flag":"verify against current provincial notification"}',
	'unverified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_wwf', 'wwf', '2026-07-01', NULL,
	'{"rate_pct_of_total_income":2,"income_threshold_pkr":500000,"assessed_with":"annual return"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_wppf', 'wppf', '2026-07-01', NULL,
	'{"rate_pct":5,"base":"audited profit before the WPPF deduction itself"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_sales_tax', 'sales_tax', '2026-07-01', NULL,
	'{"federal_goods":"generally not applicable to a pure services company","provincial_services":{"authorities":["SRB","PRA","KPRA"],"rate_pct":null,"pseb_export_exemption":"applies to qualifying IT export income"},"blocking":true,"why_blocking":"Provincial services-tax rates are not given in the spec and vary by province."}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_secp_deadlines', 'secp_deadlines', '2026-07-01', NULL,
	'{"annual_return_form_a_days_after_agm":30,"form_29_days_after_officer_change":14,"ubo_update_days_after_fy_end":14,"audit_required_above_paid_up_capital_pkr":1000000,"audit_threshold_confidence":"approximate \u2014 spec says \"~Rs 1M, confirm current SECP figure\"","below_threshold":"unaudited accounts with director affidavit"}',
	'needs_verification', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');

INSERT OR IGNORE INTO calc_config
	(id, calc_name, effective_from, effective_to, config_json, verification, source_note)
VALUES ('cfg_ty2027_filing_deadlines', 'filing_deadlines', '2026-07-01', NULL,
	'{"company_income_tax_return":"31 December following a 30 June year-end","nil_return_required":true,"director_wealth_statement":{"section":"116","due":"30 September"},"salary_withholding_statement":"15th of the following month","eobi_deposit":"15th of the following month"}',
	'verified', 'pleiades-accountant-agent-spec.md Section A quick-reference (Tax Year 2027 / FY2026-27)');
