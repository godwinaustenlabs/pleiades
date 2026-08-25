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

const setVar = (key: string, value: string | null) =>
	env.DB.prepare('UPDATE compliance_config SET value = ? WHERE config_key = ?').bind(value, key).run();

const getVar = async (key: string) =>
	(await env.DB.prepare('SELECT value FROM compliance_config WHERE config_key = ?')
		.bind(key).first<{ value: string | null }>())?.value ?? null;

describe('Pleiades schema', () => {
	it.each([
		'compliance_events',
		'generated_documents',
		'agent_conversations',
		'conversation_turns',
		'notifications_log',
		'compliance_config',
		'agent_approvals',
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

describe('compliance configuration', () => {
	it('ships every variable the operator has to own', async () => {
		const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM compliance_config').first<{ n: number }>();
		expect(row?.n).toBe(48);
	});

	it('leaves figures the source could not confirm unset', async () => {
		// These are the ones the reference material gave as a range, an endpoint
		// or an explicit "not confirmed". Shipping a plausible default for any of
		// them would be indistinguishable, to the operator, from a real rate.
		for (const key of [
			'salary_withholding_slabs',
			'eobi_notified_min_wage',
			'pessi_sessi_rate_pct',
			'sales_tax_services_pct',
			'minimum_tax_threshold',
		]) {
			expect(await getVar(key)).toBeNull();
		}
	});

	it('presets only what the source stated plainly', async () => {
		expect(await getVar('pseb_export_final_tax_pct')).toBe('0.25');
		expect(await getVar('company_tax_standard_pct')).toBe('29');
		expect(await getVar('tax_year_start')).toBe('07-01');
	});
});

describe('compliance calculators', () => {
	// The heart of it: these must refuse rather than approximate.

	it('refuses salary withholding when no slab table is configured', async () => {
		const { loadConfig } = await import('../src/agents/pleiades/config');
		const { calcSalaryWithholding } = await import('../src/agents/pleiades/compliance');
		const result = calcSalaryWithholding(await loadConfig(env as any), 2_400_000);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.missingKeys).toContain('salary_withholding_slabs');
	});

	it('computes from the operator table once configured', async () => {
		await setVar('salary_withholding_slabs', JSON.stringify([
			{ from: 0, to: 600000, rate_pct: 0 },
			{ from: 600000, to: 1200000, rate_pct: 5 },
			{ from: 1200000, to: null, rate_pct: 15, base_tax: 30000 },
		]));
		const { loadConfig } = await import('../src/agents/pleiades/config');
		const { calcSalaryWithholding } = await import('../src/agents/pleiades/compliance');
		const r = calcSalaryWithholding(await loadConfig(env as any), 1_000_000);
		expect(r.ok).toBe(true);
		// 5% of the 400,000 above the bracket floor.
		if (r.ok) expect(r.annualTax).toBe(20000);
	});

	it('will not extrapolate past the top configured bracket', async () => {
		await setVar('salary_withholding_slabs', JSON.stringify([
			{ from: 0, to: 600000, rate_pct: 0 },
			{ from: 600000, to: 1200000, rate_pct: 5 },
		]));
		const { loadConfig } = await import('../src/agents/pleiades/config');
		const { calcSalaryWithholding } = await import('../src/agents/pleiades/compliance');
		const r = calcSalaryWithholding(await loadConfig(env as any), 5_000_000);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toMatch(/stops at/);
	});

	it('refuses EOBI until the notified wage base is set', async () => {
		const { loadConfig } = await import('../src/agents/pleiades/config');
		const { calcEobi } = await import('../src/agents/pleiades/compliance');
		const r = calcEobi(await loadConfig(env as any), 12);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.missingKeys).toContain('eobi_notified_min_wage');
	});

	it('assesses EOBI on the notified wage, not actual salary', async () => {
		await setVar('eobi_notified_min_wage', '37000');
		const { loadConfig } = await import('../src/agents/pleiades/config');
		const { calcEobi } = await import('../src/agents/pleiades/compliance');
		const r = calcEobi(await loadConfig(env as any), 12);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.employer).toBe(1850); // 5% of 37,000
			expect(r.employee).toBe(370);  // 1% of 37,000
		}
	});

	it('does not apply EOBI below the employee threshold', async () => {
		const { loadConfig } = await import('../src/agents/pleiades/config');
		const { calcEobi } = await import('../src/agents/pleiades/compliance');
		const r = calcEobi(await loadConfig(env as any), 3);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.applies).toBe(false);
			expect(r.employee).toBe(0);
		}
	});

	it('always refuses PESSI/SESSI while unconfigured', async () => {
		const { loadConfig } = await import('../src/agents/pleiades/config');
		const { calcPessiSessi } = await import('../src/agents/pleiades/compliance');
		const r = calcPessiSessi(await loadConfig(env as any), 100000);
		expect(r.ok).toBe(false);
	});
});

describe('compliance context injected into the prompt', () => {
	it('names unset required settings instead of omitting them', async () => {
		const { loadConfig, renderComplianceContext } = await import('../src/agents/pleiades/config');
		const prompt = renderComplianceContext(await loadConfig(env as any));
		// A silently absent rate invites the model to supply one from memory.
		expect(prompt).toContain('NOT CONFIGURED');
		expect(prompt).toContain('required setting');
		expect(prompt).toMatch(/only source of rates/i);
	});

	it('carries the operator-configured values', async () => {
		const { loadConfig, renderComplianceContext } = await import('../src/agents/pleiades/config');
		const prompt = renderComplianceContext(await loadConfig(env as any));
		expect(prompt).toContain('0.25%');
		expect(prompt).toContain('29%');
	});
});
