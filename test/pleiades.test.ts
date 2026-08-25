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
		const { loadConfig } = await import('../src/agents/pleiades-accountant/config');
		const { calcSalaryWithholding } = await import('../src/agents/pleiades-accountant/compliance');
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
		const { loadConfig } = await import('../src/agents/pleiades-accountant/config');
		const { calcSalaryWithholding } = await import('../src/agents/pleiades-accountant/compliance');
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
		const { loadConfig } = await import('../src/agents/pleiades-accountant/config');
		const { calcSalaryWithholding } = await import('../src/agents/pleiades-accountant/compliance');
		const r = calcSalaryWithholding(await loadConfig(env as any), 5_000_000);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toMatch(/stops at/);
	});

	it('refuses EOBI until the notified wage base is set', async () => {
		const { loadConfig } = await import('../src/agents/pleiades-accountant/config');
		const { calcEobi } = await import('../src/agents/pleiades-accountant/compliance');
		const r = calcEobi(await loadConfig(env as any), 12);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.missingKeys).toContain('eobi_notified_min_wage');
	});

	it('assesses EOBI on the notified wage, not actual salary', async () => {
		await setVar('eobi_notified_min_wage', '37000');
		const { loadConfig } = await import('../src/agents/pleiades-accountant/config');
		const { calcEobi } = await import('../src/agents/pleiades-accountant/compliance');
		const r = calcEobi(await loadConfig(env as any), 12);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.employer).toBe(1850); // 5% of 37,000
			expect(r.employee).toBe(370);  // 1% of 37,000
		}
	});

	it('does not apply EOBI below the employee threshold', async () => {
		const { loadConfig } = await import('../src/agents/pleiades-accountant/config');
		const { calcEobi } = await import('../src/agents/pleiades-accountant/compliance');
		const r = calcEobi(await loadConfig(env as any), 3);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.applies).toBe(false);
			expect(r.employee).toBe(0);
		}
	});

	it('always refuses PESSI/SESSI while unconfigured', async () => {
		const { loadConfig } = await import('../src/agents/pleiades-accountant/config');
		const { calcPessiSessi } = await import('../src/agents/pleiades-accountant/compliance');
		const r = calcPessiSessi(await loadConfig(env as any), 100000);
		expect(r.ok).toBe(false);
	});
});

describe('compliance context injected into the prompt', () => {
	it('names unset required settings instead of omitting them', async () => {
		const { loadConfig, renderComplianceContext } = await import('../src/agents/pleiades-accountant/config');
		const prompt = renderComplianceContext(await loadConfig(env as any));
		// A silently absent rate invites the model to supply one from memory.
		expect(prompt).toContain('NOT CONFIGURED');
		expect(prompt).toContain('required setting');
		expect(prompt).toMatch(/only source of rates/i);
	});

	it('carries the operator-configured values', async () => {
		const { loadConfig, renderComplianceContext } = await import('../src/agents/pleiades-accountant/config');
		const prompt = renderComplianceContext(await loadConfig(env as any));
		expect(prompt).toContain('0.25%');
		expect(prompt).toContain('29%');
	});
});

describe('agent access and approvals', () => {
	const call = async (method: string, user: any, path: string, body: unknown) => {
		const { tokenFor } = await import('./helpers');
		const { SELF } = await import('cloudflare:test');
		return SELF.fetch(`https://test.local${path}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(user)}` },
			body: JSON.stringify(body),
		});
	};

	it('keeps the agent behind a finance grant', async () => {
		const { authedGet } = await import('./helpers');
		// u_crm holds crm, not finance: the accountant is a capability of
		// Accounting, so it is unreachable without finance access at all.
		expect((await authedGet('crm', '/api/finance/agent/config')).status).toBe(403);
		expect((await authedGet('crm', '/api/finance/agent/approvals')).status).toBe(403);
	});

	it('separates driving the agent from editing its rates', async () => {
		// u_tasks holds only <app>/tasks. Finance access alone is not enough:
		// `agent` and `agent_config` are distinct features precisely so asking a
		// question and rewriting the law behind every figure are different acts.
		const { authedGet } = await import('./helpers');
		expect((await authedGet('tasksOnly', '/api/finance/agent/config')).status).toBe(403);
	});

	it('lets a superadmin read the configuration', async () => {
		const { authedGet } = await import('./helpers');
		const res = await authedGet('ceo', '/api/finance/agent/config');
		expect(res.status).toBe(200);
		const { data } = await res.json() as any;
		expect(data.total).toBe(48);
		expect(data.groups.length).toBeGreaterThan(0);
	});

	it('rejects a value that is not of its declared type', async () => {
		const res = await call('PUT', 'ceo', '/api/finance/agent/config', {
			values: { company_tax_standard_pct: 'twenty-nine' },
		});
		expect(res.status).toBe(400);
		// A malformed rate reaching the table is a figure the agent reads as fact.
		expect((await res.json() as any).error).toMatch(/must be a number/);
	});

	it('rejects a percentage outside 0-100', async () => {
		const res = await call('PUT', 'ceo', '/api/finance/agent/config', { values: { wwf_pct: '250' } });
		expect(res.status).toBe(400);
	});

	it('accepts a valid change and reports what is still unset', async () => {
		const res = await call('PUT', 'ceo', '/api/finance/agent/config', { values: { eobi_notified_min_wage: '37000' } });
		expect(res.status).toBe(200);
		const { data } = await res.json() as any;
		expect(data.updated).toBe(1);
		expect(typeof data.missingRequired).toBe('number');
	});

	it('will not decide an approval that does not exist', async () => {
		const res = await call('POST', 'ceo', '/api/finance/agent/approvals/apr_nope', { decision: 'approved' });
		expect(res.status).toBe(400);
	});

	it('requires a real decision value', async () => {
		const res = await call('POST', 'ceo', '/api/finance/agent/approvals/apr_x', { decision: 'maybe' });
		expect(res.status).toBe(400);
	});
});

describe('SPA routing', () => {
	// Every client route 404'd: the catch-all answered JSON for non-API paths
	// too, so a refresh anywhere other than / broke.
	it.each(['/hr', '/admin', '/accountant', '/finance'])('serves the app at %s', async (path) => {
		const { SELF } = await import('cloudflare:test');
		const res = await SELF.fetch(`https://test.local${path}`);
		expect(res.status).toBe(200);
	});

	it('still returns JSON 404 for an unmatched API path', async () => {
		const { SELF } = await import('cloudflare:test');
		const res = await SELF.fetch('https://test.local/api/nope');
		expect(res.status).toBe(404);
		expect((await res.json() as any).success).toBe(false);
	});
});

describe('knowledge base', () => {
	it('chunks markdown on headings rather than fixed width', async () => {
		const { chunkMarkdown } = await import('../src/agents/pleiades-accountant/knowledge');
		const doc = `# Manual

## Salary withholding
Deposited by the 15th of the following month and reported on the monthly statement.
${'Filler sentence to give this section some body. '.repeat(20)}

## EOBI
Assessed on the notified minimum wage, not actual salary.
${'More filler to make this a real section. '.repeat(20)}`;

		const chunks = chunkMarkdown(doc);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		// Each chunk knows the section it came from, so a citation can name it.
		expect(chunks.some((c) => c.section.includes('Salary withholding'))).toBe(true);
		expect(chunks.some((c) => c.section.includes('EOBI'))).toBe(true);
		// A section boundary must not be swallowed into a neighbouring chunk.
		const eobi = chunks.find((c) => c.section.includes('EOBI'))!;
		expect(eobi.text).not.toContain('Salary withholding');
	});

	it('drops fragments too small to be worth retrieving', async () => {
		const { chunkMarkdown } = await import('../src/agents/pleiades-accountant/knowledge');
		expect(chunkMarkdown('# A\n\n## B\n\n## C')).toHaveLength(0);
	});

	it('degrades to a stated refusal when no index is bound', async () => {
		// An absent binding must behave like an unset rate: say so, do not guess.
		const { searchKnowledge } = await import('../src/agents/pleiades-accountant/knowledge');
		const res = await searchKnowledge({ ...env, VECTORIZE: undefined } as any, 'anything');
		expect(res.passages).toHaveLength(0);
		expect(res.note).toMatch(/no knowledge base is configured/i);
		expect(res.note).toMatch(/compliance settings/i);
	});

	it('gates the knowledge base behind agent_config', async () => {
		const { authedGet } = await import('./helpers');
		expect((await authedGet('crm', '/api/finance/agent/knowledge')).status).toBe(403);
	});

	it('reports whether the index and bucket are actually bound', async () => {
		const { authedGet } = await import('./helpers');
		const res = await authedGet('ceo', '/api/finance/agent/knowledge');
		expect(res.status).toBe(200);
		const { data } = await res.json() as any;
		// The UI needs to distinguish an empty knowledge base from an unconfigured
		// one; they look identical to the agent otherwise.
		expect(typeof data.vectorizeConfigured).toBe('boolean');
		expect(typeof data.bucketConfigured).toBe('boolean');
	});

	it('refuses to ingest without a key', async () => {
		const { tokenFor } = await import('./helpers');
		const { SELF } = await import('cloudflare:test');
		const res = await SELF.fetch('https://test.local/api/finance/agent/knowledge/ingest', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor('ceo')}` },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});
});
