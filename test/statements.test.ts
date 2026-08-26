import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, tokenFor } from './helpers';

/**
 * The statement generator, against a ledger built by hand.
 *
 * The figures are checked against arithmetic done on paper rather than against
 * whatever the code produces, because the whole point of this module is that a
 * statement is reproducible without a model. A test that asserted the code
 * agrees with itself would prove nothing.
 */
beforeAll(async () => {
	await resetDatabase();

	const now = Date.now();
	const account = (id: string, name: string, type: string) =>
		env.DB.prepare(
			'INSERT OR IGNORE INTO accounts (account_id, account_name, account_type, created_at) VALUES (?,?,?,?)',
		).bind(id, name, type, now).run();

	// Deliberately mixed case and mixed spelling: the UI writes lowercase, the
	// agent's tool describes them capitalised, and the column is nullable.
	await account('acc_sales', 'Sales', 'Revenue');
	await account('acc_consult', 'Consulting income', 'income');
	await account('acc_rent', 'Rent', 'expense');
	await account('acc_salaries', 'Salaries', 'Expense');
	await account('acc_bank', 'Bank', 'asset');
	await account('acc_loan', 'Bank loan', 'liability');
	await account('acc_mystery', 'Suspense', null as any);

	const journal = (id: string, date: string, lines: any[]) =>
		env.DB.prepare(
			`INSERT INTO general_journals (journal_id, entry_date, description, amount, lines, created_at)
			 VALUES (?,?,?,?,?,?)`,
		).bind(
			id, date, 'fixture',
			lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0),
			JSON.stringify(lines), now,
		).run();

	// In the period: revenue 500,000; expenses 180,000; profit 320,000.
	await journal('jrn_t1', '2026-03-05', [
		{ accountId: 'acc_bank', type: 'debit', amount: 300000 },
		{ accountId: 'acc_sales', type: 'credit', amount: 300000 },
	]);
	await journal('jrn_t2', '2026-03-20', [
		{ accountId: 'acc_bank', type: 'debit', amount: 200000 },
		{ accountId: 'acc_consult', type: 'credit', amount: 200000 },
	]);
	await journal('jrn_t3', '2026-03-25', [
		{ accountId: 'acc_rent', type: 'debit', amount: 80000 },
		{ accountId: 'acc_bank', type: 'credit', amount: 80000 },
	]);
	await journal('jrn_t4', '2026-03-31', [
		{ accountId: 'acc_salaries', type: 'debit', amount: 100000 },
		{ accountId: 'acc_bank', type: 'credit', amount: 100000 },
	]);

	// Outside the period. A cumulative report would wrongly swallow this.
	await journal('jrn_prior', '2026-02-10', [
		{ accountId: 'acc_bank', type: 'debit', amount: 999999 },
		{ accountId: 'acc_sales', type: 'credit', amount: 999999 },
	]);
	await journal('jrn_after', '2026-04-02', [
		{ accountId: 'acc_rent', type: 'debit', amount: 555555 },
		{ accountId: 'acc_bank', type: 'credit', amount: 555555 },
	]);

	// A legacy entry: no `lines`, just the two account columns. Still in the
	// ledger, and a reader that only understood `lines` would drop it.
	await env.DB.prepare(
		`INSERT INTO general_journals
		 (journal_id, entry_date, description, amount, debit_account_id, credit_account_id, created_at)
		 VALUES (?,?,?,?,?,?,?)`,
	).bind('jrn_legacy', '2026-03-15', 'legacy', 40000, 'acc_bank', 'acc_loan', now).run();

	// An unclassified account, so it can be shown to be excluded rather than
	// silently folded into a total.
	await journal('jrn_mystery', '2026-03-18', [
		{ accountId: 'acc_mystery', type: 'debit', amount: 7000 },
		{ accountId: 'acc_bank', type: 'credit', amount: 7000 },
	]);
});

const call = async (method: string, path: string, body?: unknown) =>
	SELF.fetch(`https://test.local/api/finance${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor('ceo')}` },
		...(body ? { body: JSON.stringify(body) } : {}),
	});

describe('profit and loss', () => {
	it('reports the period, and only the period', async () => {
		const res = await call('POST', '/statements', {
			type: 'profit_and_loss',
			startDate: '2026-03-01',
			endDate: '2026-03-31',
		});
		expect(res.status).toBe(200);
		const { data } = await res.json<any>();

		// 300,000 + 200,000. The 999,999 in February and the 555,555 in April
		// must not appear: this is a period delta, not a running total.
		expect(data.figures.totalRevenue).toBe(500000);
		expect(data.figures.totalExpenses).toBe(180000);
		expect(data.figures.netProfit).toBe(320000);
	});

	it('files a real PDF in the bucket', async () => {
		const { data } = await (
			await call('POST', '/statements', {
				type: 'profit_and_loss', startDate: '2026-03-01', endDate: '2026-03-31',
			})
		).json<any>();

		const obj = await env.CRM_BUCKET.get(data.r2Key);
		expect(obj).not.toBeNull();
		const head = new TextDecoder().decode((await obj!.arrayBuffer()).slice(0, 5));
		expect(head).toBe('%PDF-');
	});

	it('versions rather than overwrites', async () => {
		const body = { type: 'profit_and_loss', startDate: '2026-01-01', endDate: '2026-01-31' };
		const first = await (await call('POST', '/statements', body)).json<any>();
		const second = await (await call('POST', '/statements', body)).json<any>();

		// Somebody may already have circulated the first one.
		expect(second.data.version).toBe(first.data.version + 1);
		expect(second.data.r2Key).not.toBe(first.data.r2Key);
		expect(await env.CRM_BUCKET.get(first.data.r2Key)).not.toBeNull();
	});

	it('refuses a period nobody chose', async () => {
		const res = await call('POST', '/statements', { type: 'profit_and_loss', endDate: '2026-03-31' });
		expect(res.status).toBe(400);
	});

	it('refuses a period that runs backwards', async () => {
		const res = await call('POST', '/statements', {
			type: 'profit_and_loss', startDate: '2026-06-30', endDate: '2026-01-01',
		});
		expect(res.status).toBe(400);
	});

	it('says a period is empty rather than reporting zeroes as measured', async () => {
		const { data } = await (
			await call('POST', '/statements', {
				type: 'profit_and_loss', startDate: '2019-01-01', endDate: '2019-01-31',
			})
		).json<any>();
		expect(data.figures.empty).toBe(true);
		expect(data.figures.netProfit).toBe(0);
	});
});

describe('statement of assets and liabilities', () => {
	it('carries cumulative balances, including legacy two-column entries', async () => {
		const { data } = await (
			await call('POST', '/statements', { type: 'assets_and_liabilities', endDate: '2026-03-31' })
		).json<any>();

		// Bank: 999,999 + 300,000 + 200,000 + 40,000 (legacy) − 80,000 − 100,000
		//       − 7,000 = 1,352,999. The legacy entry has no `lines` column and
		//       would be invisible to a reader that only understood compound ones.
		expect(data.figures.totalAssets).toBe(1352999);
		expect(data.figures.totalLiabilities).toBe(40000);
		expect(data.figures.netWorth).toBe(1312999);
	});

	it('shows the register beside the ledger rather than adding it', async () => {
		const now = Date.now();
		await env.DB.prepare(
			`INSERT INTO assets
			 (id, asset_name, asset_type, status, asset_class, purchase_cost, purchase_date,
			  salvage_value, useful_life_months, accumulated_depreciation, created_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		).bind('ast_stmt', 'Delivery van', 'vehicle', 'Available', 'vehicle',
			1200000, '2025-01-01', 0, 60, 240000, now).run();

		const { data } = await (
			await call('POST', '/statements', { type: 'assets_and_liabilities', endDate: '2026-03-31' })
		).json<any>();

		// Written down: 1,200,000 − 240,000 posted = 960,000. Reported separately;
		// adding it to the ledger's assets would double-count the same property.
		expect(data.figures.registerWrittenDown).toBe(960000);
		expect(data.figures.totalAssets).toBe(1352999);
		expect(data.figures.reconciliationDifference).toBe(1352999 - 960000);
	});
});

describe('who may generate one', () => {
	it('refuses a user without finance/docs edit', async () => {
		const res = await SELF.fetch('https://test.local/api/finance/statements', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${await tokenFor('none')}`,
			},
			body: JSON.stringify({ type: 'assets_and_liabilities', endDate: '2026-03-31' }),
		});
		expect([401, 403]).toContain(res.status);
	});
});

describe('downloading a generated statement', () => {
	let doc: any;

	beforeAll(async () => {
		doc = (
			await (
				await call('POST', '/statements', { type: 'assets_and_liabilities', endDate: '2026-03-31' })
			).json<any>()
		).data;
	});

	const fetchDoc = async (init: RequestInit, suffix = '') =>
		SELF.fetch(`https://test.local${doc.url}${suffix}`, init);

	it('serves the PDF to an Authorization header', async () => {
		// What the Download button does. A plain <a href> cannot set a header,
		// which is why this used to go through the query parameter instead.
		const res = await fetchDoc({
			headers: { Authorization: `Bearer ${await tokenFor('ceo')}` },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/pdf');
		const head = new TextDecoder().decode((await res.arrayBuffer()).slice(0, 5));
		expect(head).toBe('%PDF-');
	});

	it('names the file even when it is served inline', async () => {
		const res = await fetchDoc({ headers: { Authorization: `Bearer ${await tokenFor('ceo')}` } });
		// Without a filename, "Save as" on an inline PDF offers the last segment
		// of a percent-encoded URL.
		expect(res.headers.get('content-disposition')).toMatch(/^inline; filename=".+\.pdf"$/);
	});

	it('still accepts a token in the query string', async () => {
		const res = await fetchDoc({}, `?token=${await tokenFor('ceo')}`);
		expect(res.status).toBe(200);
	});

	it('does not let a stale cookie shadow a usable token', async () => {
		// The cookie was read before the query parameter and, once present,
		// nothing else was tried — so a valid credential sat unread in the URL
		// while the request failed.
		const res = await fetchDoc(
			{ headers: { Cookie: 'auth_token=not-a-real-token' } },
			`?token=${await tokenFor('ceo')}`,
		);
		expect(res.status).toBe(200);
	});

	it('refuses a caller without finance/docs', async () => {
		const res = await fetchDoc({ headers: { Authorization: `Bearer ${await tokenFor('none')}` } });
		expect(res.status).toBe(403);
	});

	it('refuses with no credential at all', async () => {
		expect((await fetchDoc({})).status).toBe(401);
	});
});
