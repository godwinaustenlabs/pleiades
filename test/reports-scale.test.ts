import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, tokenFor } from './helpers';
import { MAX_DETAIL_ROWS } from '../src/statements/reports';

/**
 * A complete-history report over a journal too large to print.
 *
 * "Generate the whole journal" is an ordinary request — it is what gets asked
 * for when the books are handed to an accountant — and it is the request most
 * likely to break a PDF renderer. So it gets its own fixture and its own file,
 * because the volume here would otherwise swamp the arithmetic the main suite
 * checks by hand.
 *
 * What must hold: the report is produced, it is a real PDF, and its totals
 * cover every entry even though its listing cannot. An abbreviated report is
 * acceptable. A wrong one is not, and neither is a 500.
 */

const ENTRIES = 3200;

beforeAll(async () => {
	await resetDatabase();
	const now = Date.now();

	await env.DB.prepare('INSERT OR IGNORE INTO ledgers (ledger_id, ledger_name, created_at) VALUES (?,?,?)')
		.bind('ldg_big', 'Main Ledger', now).run();
	for (const [id, name, type] of [
		['acc_cash', 'Cash at bank', 'asset'],
		['acc_fees', 'Fee income', 'revenue'],
	]) {
		await env.DB.prepare(
			'INSERT OR IGNORE INTO accounts (account_id, account_name, account_type, ledger_id, created_at) VALUES (?,?,?,?,?)',
		).bind(id, name, type, 'ldg_big', now).run();
	}

	// Each entry is two lines, so the listing costs three rows: past ~2,000
	// entries the budget bites and the report has to abbreviate rather than fail.
	const stmt = env.DB.prepare(
		`INSERT INTO general_journals (journal_id, entry_date, description, amount, lines, ledger_id, created_at)
		 VALUES (?,?,?,?,?,?,?)`,
	);
	const batch = [];
	for (let i = 0; i < ENTRIES; i++) {
		// Spread across six years, so the dates are real and the sort has work to do.
		const day = new Date(Date.UTC(2020, 0, 1) + i * 16 * 3600 * 1000).toISOString().slice(0, 10);
		const lines = JSON.stringify([
			{ accountId: 'acc_cash', type: 'debit', amount: 100 },
			{ accountId: 'acc_fees', type: 'credit', amount: 100 },
		]);
		batch.push(stmt.bind(`jrn_bulk_${String(i).padStart(5, '0')}`, day, `Fee ${i}`, 100, lines, 'ldg_big', now));
	}
	// Chunked: D1 caps the statements in one batch.
	for (let i = 0; i < batch.length; i += 200) await env.DB.batch(batch.slice(i, i + 200));
});

const post = async (path: string, body: unknown) => {
	const res = await SELF.fetch(`https://test.local/api/finance${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor('ceo')}` },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: await res.json<any>() };
};

async function isPdf(key: string) {
	const obj = await env.CRM_BUCKET.get(key);
	if (!obj) return false;
	return new TextDecoder().decode((await obj.arrayBuffer()).slice(0, 5)) === '%PDF-';
}

describe('a complete-history journal report', () => {
	it('is produced, and is a real PDF', async () => {
		const { status, body } = await post('/reports/journal', {});
		expect(status).toBe(200);
		expect(await isPdf(body.data.r2Key)).toBe(true);
	});

	it('totals every entry even though it cannot list them all', async () => {
		const { body } = await post('/reports/journal', {});
		const f = body.data.figures;

		// 3,200 entries at 100 each, on both sides.
		expect(f.entries).toBe(ENTRIES);
		expect(f.totalDebit).toBe(ENTRIES * 100);
		expect(f.totalCredit).toBe(ENTRIES * 100);
		expect(f.difference).toBe(0);

		// The listing stops short, and says by how much, rather than pretending.
		expect(f.listed).toBeLessThan(ENTRIES);
		expect(f.omitted).toBe(ENTRIES - f.listed);
		// Three rows an entry against the row budget.
		expect(f.listed).toBe(Math.floor(MAX_DETAIL_ROWS / 3));
	});

	it('does not abbreviate a range it can print in full', async () => {
		// One year of a sixteen-hour cadence is well inside the budget.
		const { body } = await post('/reports/journal', {
			startDate: '2020-01-01', endDate: '2020-12-31',
		});
		expect(body.data.figures.omitted).toBe(0);
		expect(body.data.figures.listed).toBe(body.data.figures.entries);
	});
});

describe('a complete-history ledger report', () => {
	it('balances across every account even though it abbreviates', async () => {
		// Two accounts of 3,200 entries each is 6,400 listing rows against a
		// budget of 6,000, so this one genuinely runs out of page — and the
		// totals must still be struck over all 6,400.
		const { status, body } = await post('/reports/ledger', { scope: 'all' });
		expect(status).toBe(200);
		expect(await isPdf(body.data.r2Key)).toBe(true);
		expect(body.data.figures).toMatchObject({
			accounts: 2,
			totalDebit: ENTRIES * 100,
			totalCredit: ENTRIES * 100,
			difference: 0,
			truncated: true,
		});
	});

	it('keeps a single account’s closing balance correct over its whole history', async () => {
		// 3,200 rows is inside the budget, so this prints in full — which is the
		// point of reporting one account at a time when a wider report abbreviates.
		const { body } = await post('/reports/ledger', { scope: 'account', accountId: 'acc_cash' });
		expect(body.data.figures).toMatchObject({
			totalDebit: ENTRIES * 100,
			totalCredit: 0,
			closingBalance: ENTRIES * 100,
			truncated: false,
		});
	});
});
