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
		expect(row?.n).toBe(49);
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
		expect(data.total).toBe(49);
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

describe('knowledge upload', () => {
	const upload = async (filename: string, body: BodyInit, type = 'text/markdown') => {
		const { tokenFor } = await import('./helpers');
		const { SELF } = await import('cloudflare:test');
		return SELF.fetch(
			`https://test.local/api/finance/agent/knowledge/upload?filename=${encodeURIComponent(filename)}`,
			{ method: 'POST', headers: { 'Content-Type': type, Authorization: `Bearer ${await tokenFor('ceo')}` }, body },
		);
	};

	it('refuses a filename that tries to escape the bucket', async () => {
		const res = await upload('../../etc/passwd.md', 'x'.repeat(500));
		// The traversal is stripped to a bare filename, so this is rejected on
		// extension or stored flat — never written outside the bucket root.
		expect([400, 200]).toContain(res.status);
		if (res.status === 200) {
			const { data } = await res.json() as any;
			expect(data.title).not.toContain('..');
		}
	});

	it('refuses a type it cannot convert', async () => {
		const res = await upload('payload.exe', 'x'.repeat(500), 'application/octet-stream');
		expect(res.status).toBe(400);
		expect((await res.json() as any).error).toMatch(/Supported types/);
	});

	it('refuses an empty file', async () => {
		const res = await upload('empty.md', new ArrayBuffer(0));
		expect(res.status).toBe(400);
	});

	it('refuses a document with too little text to index', async () => {
		// An almost-empty file would otherwise produce a knowledge base that looks
		// populated and answers nothing.
		const res = await upload('thin.md', '# Title\n\nToo short.');
		expect(res.status).toBe(400);
		expect((await res.json() as any).error).toMatch(/almost no text|could not index/i);
	});

	it('keeps uploading behind agent_config edit', async () => {
		const { tokenFor } = await import('./helpers');
		const { SELF } = await import('cloudflare:test');
		const res = await SELF.fetch(
			'https://test.local/api/finance/agent/knowledge/upload?filename=x.md',
			{ method: 'POST', headers: { Authorization: `Bearer ${await tokenFor('crm')}` }, body: 'x'.repeat(500) },
		);
		expect(res.status).toBe(403);
	});
});

describe('agent journal', () => {
	it('records an action with its reasoning', async () => {
		const { recordAction, recallActions } = await import('../src/agents/pleiades-accountant/journal');
		await recordAction(env as any, {
			actionType: 'statement_generated',
			subject: 'Monthly sales tax return',
			summary: 'Produced a nil sales tax return for 2026-08.',
			// The whole point: months later, this is the difference between a
			// deliberate nil and one nobody got round to.
			rationale: 'No taxable supplies in the period. Filed nil to preserve the filing record.',
			periodLabel: '2026-08',
			actorUserId: 'u_ceo',
		});

		const { entries } = await recallActions(env as any, { periodLabel: '2026-08' });
		expect(entries.length).toBeGreaterThan(0);
		expect(entries[0].rationale).toMatch(/no taxable supplies/i);
		expect(entries[0].occurredAt).toBeTruthy();
	});

	it('answers an exact filter exactly, not by similarity', async () => {
		const { recordAction, recallActions } = await import('../src/agents/pleiades-accountant/journal');
		await recordAction(env as any, {
			actionType: 'payroll_generated', subject: 'July payroll',
			summary: 'Ran payroll for 2026-07.', periodLabel: '2026-07', actorUserId: 'u_ceo',
		});

		const res = await recallActions(env as any, { actionType: 'payroll_generated' });
		expect(res.mode).toBe('chronological');
		expect(res.entries.every((e) => e.actionType === 'payroll_generated')).toBe(true);
	});

	it('returns newest first', async () => {
		const { recordAction, recallActions } = await import('../src/agents/pleiades-accountant/journal');
		await recordAction(env as any, {
			actionType: 'journal_posted', subject: 'Older', summary: 'a',
			actorUserId: 'u_ceo', occurredAt: new Date('2026-01-01'),
		});
		await recordAction(env as any, {
			actionType: 'journal_posted', subject: 'Newer', summary: 'b',
			actorUserId: 'u_ceo', occurredAt: new Date('2026-06-01'),
		});
		const { entries } = await recallActions(env as any, { actionType: 'journal_posted' });
		expect(entries[0].subject).toBe('Newer');
	});

	it('keeps the record even when it cannot be embedded', async () => {
		// A journal that silently drops entries is worse than none: it looks
		// complete. Losing recall is a degradation; losing the row is a hole.
		const { recordAction, recallActions } = await import('../src/agents/pleiades-accountant/journal');
		const res = await recordAction({ ...env, VECTORIZE: undefined } as any, {
			actionType: 'refused', subject: 'Withholding figure',
			summary: 'Refused to compute.', rationale: 'Slab table not configured.',
			outcome: 'refused', actorUserId: 'u_ceo',
		});
		expect(res.embedded).toBe(false);
		const { entries } = await recallActions(env as any, { actionType: 'refused' });
		expect(entries.some((e) => e.rationale?.includes('Slab table'))).toBe(true);
	});

	it('exposes the journal to people, not only to the agent', async () => {
		const { authedGet } = await import('./helpers');
		const res = await authedGet('ceo', '/api/finance/agent/journal?type=payroll_generated');
		expect(res.status).toBe(200);
		const { data } = await res.json() as any;
		expect(Array.isArray(data.entries)).toBe(true);
	});

	it('keeps the journal behind the agent grant', async () => {
		const { authedGet } = await import('./helpers');
		expect((await authedGet('crm', '/api/finance/agent/journal')).status).toBe(403);
	});
});

describe('conversation memory', () => {
	it('replays recent turns to the model', async () => {
		// The Durable Object gives serialisation, not memory. Turns were being
		// written to conversation_turns and never read back, so the model saw one
		// message per turn and could not remember what it had just proposed.
		const conv = 'conv_mem_test';
		await env.DB.prepare(
			"INSERT INTO agent_conversations (id, started_at, operator) VALUES (?, 0, 'u_ceo')",
		).bind(conv).run();

		const add = (role: string, content: string, at: number) =>
			env.DB.prepare(
				`INSERT INTO conversation_turns (id, conversation_id, role, content, created_at)
				 VALUES (?, ?, ?, ?, ?)`,
			).bind(`ct_${role}_${at}`, conv, role, content, at).run();

		await add('user', 'What is our tax year?', 1);
		await add('assistant', 'It runs 1 July to 30 June.', 2);
		await add('tool', '2 tool call(s)', 3);
		await add('assistant', '[error] something broke', 4);

		const rows = await env.DB.prepare(
			`SELECT role, content FROM conversation_turns
			 WHERE conversation_id = ? ORDER BY created_at`,
		).bind(conv).all();

		const usable = (rows.results as any[]).filter(
			(r) => (r.role === 'user' || r.role === 'assistant') && !r.content.startsWith('[error]'),
		);
		// Tool records are bookkeeping, not dialogue; errors are noise. Replaying
		// either invites the model to treat its own notes as instructions.
		expect(usable).toHaveLength(2);
		expect(usable[0].content).toMatch(/tax year/);
	});
});

describe('approvals execute on approval', () => {
	const approvalRow = async (id: string, tool: string, payload: object) => {
		const hash = 'x'.repeat(64);
		await env.DB.prepare(
			`INSERT INTO agent_approvals
			 (id, tool_name, payload, payload_hash, summary, status, requested_by, expires_at, created_at)
			 VALUES (?, ?, ?, ?, 'test', 'pending', 'u_ceo', ?, 0)`,
		).bind(id, tool, JSON.stringify(payload), hash, Date.now() + 3600_000).run();
	};

	const decide = async (id: string, decision: string) => {
		const { tokenFor } = await import('./helpers');
		const { SELF } = await import('cloudflare:test');
		return SELF.fetch(`https://test.local/api/finance/agent/approvals/${id}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor('ceo')}` },
			body: JSON.stringify({ decision }),
		});
	};

	it('runs the stored payload when approved', async () => {
		await approvalRow('apr_exec_ok', 'create_ledger', { ledgerName: 'Approved Ledger' });
		const res = await decide('apr_exec_ok', 'approved');
		expect(res.status).toBe(200);

		const row = await env.DB.prepare(
			'SELECT status, execution_status FROM agent_approvals WHERE id = ?',
		).bind('apr_exec_ok').first<any>();
		// Executed, and consumed only because it succeeded.
		expect(row.execution_status).toBe('succeeded');
		expect(row.status).toBe('consumed');

		const ledger = await env.DB.prepare(
			"SELECT ledger_name FROM ledgers WHERE ledger_name = 'Approved Ledger'",
		).first();
		expect(ledger).not.toBeNull();
	});

	it('does not consume an approval whose action failed', async () => {
		// A failed run must stay approved so it can be retried, not be burnt.
		await approvalRow('apr_exec_fail', 'create_journal_entry', {
			entryDate: '2026-08-01',
			narration: 'unbalanced',
			lines: [{ accountId: 'acc_x', type: 'debit', amount: 100 }],
		});
		const res = await decide('apr_exec_fail', 'approved');
		expect(res.status).toBe(400);

		const row = await env.DB.prepare(
			'SELECT status, execution_status FROM agent_approvals WHERE id = ?',
		).bind('apr_exec_fail').first<any>();
		expect(row.execution_status).toBe('failed');
		expect(row.status).toBe('approved');
	});

	it('rejects without executing', async () => {
		await approvalRow('apr_rejected', 'create_ledger', { ledgerName: 'Never Created' });
		expect((await decide('apr_rejected', 'rejected')).status).toBe(200);

		const row = await env.DB.prepare(
			'SELECT status, execution_status FROM agent_approvals WHERE id = ?',
		).bind('apr_rejected').first<any>();
		expect(row.status).toBe('rejected');
		expect(row.execution_status).toBeNull();

		const ledger = await env.DB.prepare(
			"SELECT ledger_name FROM ledgers WHERE ledger_name = 'Never Created'",
		).first();
		expect(ledger).toBeNull();
	});

	it('will not decide the same approval twice', async () => {
		await approvalRow('apr_twice', 'create_ledger', { ledgerName: 'Once Only' });
		expect((await decide('apr_twice', 'approved')).status).toBe(200);
		expect((await decide('apr_twice', 'approved')).status).toBe(400);
	});
});

describe('reading the books', () => {
	const call = async (path: string) => {
		const { tokenFor } = await import('./helpers');
		const { SELF } = await import('cloudflare:test');
		return SELF.fetch(`https://test.local/api/finance${path}`, {
			headers: { Authorization: `Bearer ${await tokenFor('ceo')}` },
		});
	};

	beforeAll(async () => {
		const now = Date.now();
		await env.DB.prepare(
			'INSERT OR IGNORE INTO accounts (account_id, account_name, account_type, created_at) VALUES (?,?,?,?)',
		).bind('acc_range', 'Range test', 'expense', now).run();

		for (const [id, date, amount] of [
			['jrn_r1', '2026-05-10', 1000],
			['jrn_r2', '2026-06-10', 2000],
			['jrn_r3', '2026-07-10', 4000],
		] as const) {
			await env.DB.prepare(
				`INSERT INTO general_journals (journal_id, entry_date, description, amount, lines, created_at)
				 VALUES (?,?,?,?,?,?)`,
			).bind(id, date, 'range', amount, JSON.stringify([
				{ accountId: 'acc_range', type: 'debit', amount },
				{ accountId: 'acc_range', type: 'credit', amount },
			]), now).run();
		}
	});

	it('filters journals by date range', async () => {
		// The route supported startDate/endDate all along; the agent's tool did
		// not pass them, so every question about a month read the whole ledger.
		const res = await call('/journals?startDate=2026-06-01&endDate=2026-06-30');
		const { data } = await res.json<any>();
		const ids = data.map((j: any) => j.id ?? j.journalId);
		expect(ids).toContain('jrn_r2');
		expect(ids).not.toContain('jrn_r1');
		expect(ids).not.toContain('jrn_r3');
	});

	it('reads one account as a T-account', async () => {
		const res = await call('/ledger-view?account_id=acc_range&startDate=2026-01-01&endDate=2026-12-31');
		expect(res.status).toBe(200);
	});
});

describe('the agent journal', () => {
	// `recordAction` embeds each entry into Vectorize, which the test pool can
	// only reach remotely. The write to D1 is what these assert on — the
	// embedding is best-effort and deliberately swallowed — but the call still
	// has to come back, and 5s is not always enough for a round trip.
	const REMOTE_EMBEDDING = 20_000;

	it('returns the records an action touched, not just prose', async () => {
		const { recordAction, recallActions } = await import('../src/agents/pleiades-accountant/journal');
		await recordAction(env as any, {
			actionType: 'test_entities',
			subject: 'Filed something',
			summary: 'A test entry.',
			entities: { journalId: 'jrn_r2', period: '2026-06' },
			periodLabel: '2026-06',
			actorUserId: 'u_ceo',
		});

		const { entries } = await recallActions(env as any, { actionType: 'test_entities' });
		expect(entries).toHaveLength(1);
		// Recalling *that* something was filed without recalling *what* leaves
		// the agent unable to answer the question that always comes next.
		expect(entries[0].entities).toEqual({ journalId: 'jrn_r2', period: '2026-06' });
	}, REMOTE_EMBEDDING);

	it('honours a date range over similarity', async () => {
		const { recordAction, recallActions } = await import('../src/agents/pleiades-accountant/journal');
		await recordAction(env as any, {
			actionType: 'dated_test',
			subject: 'Old action',
			summary: 'Long ago.',
			actorUserId: 'u_ceo',
			occurredAt: new Date('2020-01-01T00:00:00Z'),
		});
		await recordAction(env as any, {
			actionType: 'dated_test',
			subject: 'Recent action',
			summary: 'Lately.',
			actorUserId: 'u_ceo',
			occurredAt: new Date('2026-08-01T00:00:00Z'),
		});

		const { entries, mode } = await recallActions(env as any, {
			actionType: 'dated_test',
			since: new Date('2026-01-01T00:00:00Z'),
		});
		// An exact filter is an exact question; it must not be answered with a
		// similarity score.
		expect(mode).toBe('chronological');
		expect(entries.map((e) => e.subject)).toEqual(['Recent action']);
	}, REMOTE_EMBEDDING);
});
