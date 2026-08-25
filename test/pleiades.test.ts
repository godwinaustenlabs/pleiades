import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { resetDatabase } from './helpers';

/**
 * Pleiades Accountant — schema and rate config (spec Section C, build step 1).
 *
 * These pin the contract the calculators will be built against, before any
 * calculator exists. The important one is `blocking`: the spec supplies only a
 * range, an endpoint or an explicit "not confirmed" for several figures, and an
 * agent that invents the missing middle is worse than one that refuses.
 */
beforeAll(async () => {
	await resetDatabase();
});

const config = async (name: string) => {
	const row = await env.DB.prepare(
		`SELECT config_json, verification FROM calc_config
		 WHERE calc_name = ? AND (effective_to IS NULL OR effective_to > date('now'))
		 ORDER BY effective_from DESC LIMIT 1`,
	).bind(name).first<{ config_json: string; verification: string }>();
	return row ? { ...JSON.parse(row.config_json), verification: row.verification } : null;
};

describe('Pleiades schema', () => {
	it.each([
		'compliance_events',
		'generated_documents',
		'agent_conversations',
		'conversation_turns',
		'notifications_log',
		'calc_config',
	])('creates %s', async (table) => {
		const row = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
		).bind(table).first();
		expect(row).not.toBeNull();
	});

	it('will not let a deliverable be silently overwritten', async () => {
		// Re-generating for the same period must mint a new version. The unique
		// index is what enforces the spec's "no silent overwrites" rule.
		const insert = (version: number) =>
			env.DB.prepare(
				`INSERT INTO generated_documents (id, doc_type, period_label, version, file_url, generated_by, created_at)
				 VALUES (?, 'salary_withholding_statement', '2026-08', ?, 'crm-docs/x.xlsx', 'pleiades-accountant', 0)`,
			).bind(`gd_v${version}`, version).run();

		await insert(1);
		await expect(
			env.DB.prepare(
				`INSERT INTO generated_documents (id, doc_type, period_label, version, file_url, generated_by, created_at)
				 VALUES ('gd_dup', 'salary_withholding_statement', '2026-08', 1, 'crm-docs/y.xlsx', 'pleiades-accountant', 0)`,
			).run(),
		).rejects.toThrow();
		await expect(insert(2)).resolves.toBeDefined();
	});

	it('ties a turn to a conversation', async () => {
		await expect(
			env.DB.prepare(
				`INSERT INTO conversation_turns (id, conversation_id, role, content, created_at)
				 VALUES ('ct_x', 'no_such_conversation', 'user', 'hi', 0)`,
			).run(),
		).rejects.toThrow();
	});
});

describe('calc_config rate table', () => {
	it('seeds the Tax Year 2027 rules', async () => {
		const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM calc_config').first<{ n: number }>();
		expect(row?.n).toBe(12);
	});

	it('carries the IT-export rate that governs this company', async () => {
		const c = await config('company_tax_rates');
		expect(c.verification).toBe('verified');
		expect(c.pseb_it_export_final_tax_pct).toBe(0.25);
		expect(c.standard_company_pct).toBe(29);
	});

	// The heart of it: where the spec does not give a computable number, the
	// row must say so, so the calculator refuses instead of inventing one.
	it.each([
		['salary_withholding_slabs', 'only endpoints given, no intermediate brackets'],
		['vendor_withholding', 'only rate ranges given'],
		['eobi_contribution', 'percentages known, notified wage base not'],
		['pessi_sessi_contribution', 'spec states it is unconfirmed'],
		['sales_tax', 'provincial rates not given'],
	])('marks %s as blocking (%s)', async (name) => {
		const c = await config(name);
		expect(c).not.toBeNull();
		expect(c.blocking).toBe(true);
		expect(c.why_blocking).toBeTruthy();
		expect(c.verification).not.toBe('verified');
	});

	it('leaves no invented salary brackets behind', async () => {
		const c = await config('salary_withholding_slabs');
		expect(c.slabs).toEqual([]);
		expect(c.known_endpoints.zero_rate_up_to_pkr).toBe(600000);
	});

	it('flags PESSI/SESSI as unverified, per Section B', async () => {
		const c = await config('pessi_sessi_contribution');
		expect(c.verification).toBe('unverified');
		expect(c.rate_pct).toBeNull();
	});

	it('lets a rate be superseded rather than edited', async () => {
		// A Finance Act change is a new row with a later effective_from; the
		// old row stays so a past document remains explainable.
		await env.DB.prepare(
			`INSERT INTO calc_config (id, calc_name, effective_from, effective_to, config_json, verification, source_note)
			 VALUES ('cfg_ty2028_wwf', 'wwf', '2027-07-01', NULL, '{"rate_pct_of_total_income":3}', 'verified', 'FY2027-28')`,
		).run();

		const current = await config('wwf');
		expect(current.rate_pct_of_total_income).toBe(3);

		const history = await env.DB.prepare(
			"SELECT COUNT(*) AS n FROM calc_config WHERE calc_name = 'wwf'",
		).first<{ n: number }>();
		expect(history?.n).toBe(2);
	});
});
