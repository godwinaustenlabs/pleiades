import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, tokenFor } from './helpers';

/**
 * The two ledger reports, against a journal built by hand.
 *
 * Every figure asserted here was worked out on paper from the fixture below,
 * never read back from the code. The whole claim of this module is that a
 * report transcribes the books faithfully, and a test that checked the code
 * agrees with itself would not test that claim at all.
 *
 * The fixture is deliberately awkward in the four ways production is: a legacy
 * entry with no `lines`, an entry whose debits and credits disagree, an entry
 * with no date, and free text no standard PDF font can encode.
 */

const now = Date.now();

beforeAll(async () => {
	await resetDatabase();

	const ledger = (id: string, name: string) =>
		env.DB.prepare('INSERT OR IGNORE INTO ledgers (ledger_id, ledger_name, created_at) VALUES (?,?,?)')
			.bind(id, name, now).run();

	const account = (id: string, name: string, type: string, ledgerId: string | null) =>
		env.DB.prepare(
			'INSERT OR IGNORE INTO accounts (account_id, account_name, account_type, ledger_id, created_at) VALUES (?,?,?,?,?)',
		).bind(id, name, type, ledgerId, now).run();

	const journal = (id: string, date: string | null, desc: string, ledgerId: string | null, lines: any[]) =>
		env.DB.prepare(
			`INSERT INTO general_journals (journal_id, entry_date, description, amount, lines, ledger_id, created_at)
			 VALUES (?,?,?,?,?,?,?)`,
		).bind(
			id, date, desc,
			lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0),
			JSON.stringify(lines), ledgerId, now,
		).run();

	await ledger('ldg_main', 'Main Ledger');
	await ledger('ldg_other', 'Other Ledger');
	await ledger('ldg_bare', 'Bare Ledger');

	await account('acc_bank', 'Bank', 'asset', 'ldg_main');
	await account('acc_sales', 'Sales', 'revenue', 'ldg_main');
	await account('acc_rent', 'Rent', 'expense', 'ldg_main');
	await account('acc_loan', 'Bank loan', 'liability', 'ldg_other');
	// Never posted to, and carries nothing. Must be counted and omitted rather
	// than padding an all-accounts report with an empty page.
	await account('acc_idle', 'Dormant account', 'asset', 'ldg_main');

	await journal('jr_1', '2026-01-10', 'January sale', 'ldg_main', [
		{ accountId: 'acc_bank', type: 'debit', amount: 100000 },
		{ accountId: 'acc_sales', type: 'credit', amount: 100000 },
	]);
	await journal('jr_2', '2026-02-15', 'February rent', 'ldg_main', [
		{ accountId: 'acc_rent', type: 'debit', amount: 30000 },
		{ accountId: 'acc_bank', type: 'credit', amount: 30000 },
	]);
	await journal('jr_3', '2026-03-20', 'March sale', 'ldg_other', [
		{ accountId: 'acc_bank', type: 'debit', amount: 50000 },
		{ accountId: 'acc_sales', type: 'credit', amount: 50000 },
	]);
	// Debits and credits disagree. Real journals contain these, and a report
	// that quietly balanced them would hide the only interesting thing about it.
	await journal('jr_5', '2026-02-25', 'Short posting', 'ldg_main', [
		{ accountId: 'acc_rent', type: 'debit', amount: 5000 },
		{ accountId: 'acc_bank', type: 'credit', amount: 4000 },
	]);
	// No entry date. A bounded range cannot place it; a complete history must
	// not lose it.
	await journal('jr_6', null, 'Undated adjustment', 'ldg_main', [
		{ accountId: 'acc_rent', type: 'debit', amount: 1000 },
		{ accountId: 'acc_bank', type: 'credit', amount: 1000 },
	]);
	// Characters the standard PDF fonts cannot encode. pdf-lib throws on these,
	// so without sanitising, one such narration fails the whole report — and
	// fails it only for the date ranges that happen to contain it.
	await journal('jr_7', '2026-02-05', 'Café — “quarterly” fee ₨ 🎉', 'ldg_main', [
		{ accountId: 'acc_rent', type: 'debit', amount: 700 },
		{ accountId: 'acc_bank', type: 'credit', amount: 700 },
	]);
	// The legacy two-column form: no `lines`, just a debit and a credit account.
	// Still in production, and a reader that only understood `lines` would drop it.
	await env.DB.prepare(
		`INSERT INTO general_journals
		 (journal_id, entry_date, description, amount, debit_account_id, credit_account_id, ledger_id, created_at)
		 VALUES (?,?,?,?,?,?,?,?)`,
	).bind('jr_4', '2026-02-20', 'Legacy loan draw', 20000, 'acc_bank', 'acc_loan', 'ldg_main', now).run();

	// Two users with exactly one of the two grants each, so the gates can be
	// shown to be independent rather than both standing in for "finance".
	const grant = (user: string, feature: string) =>
		env.DB.prepare(
			`INSERT OR REPLACE INTO user_app_permissions
			 (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
			 VALUES (?,?,'finance',?,1,1,0,0,0)`,
		).bind(`uap_${user}_finance_${feature}`, user, feature).run();
	await grant('u_tech', 'journals');
	await grant('u_mkt', 'ledgers');
});

type User = Parameters<typeof tokenFor>[0];

const call = async (path: string, body?: unknown, user: User = 'ceo') =>
	SELF.fetch(`https://test.local/api/finance${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(user)}` },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});

const post = async (path: string, body: unknown, user: User = 'ceo') => {
	const res = await call(path, body, user);
	return { status: res.status, body: await res.json<any>() };
};

/** The first five bytes of a real PDF. */
async function pdfHeader(key: string) {
	const obj = await env.CRM_BUCKET.get(key);
	if (!obj) return null;
	return new TextDecoder().decode((await obj.arrayBuffer()).slice(0, 5));
}

describe('general journal report', () => {
	it('totals the range, and only the range', async () => {
		// February: rent 30,000; legacy loan draw 20,000; short posting 5,000/4,000;
		// the café fee 700. January's 100,000 and March's 50,000 are outside it.
		const { status, body } = await post('/reports/journal', {
			startDate: '2026-02-01', endDate: '2026-02-28',
		});
		expect(status).toBe(200);
		expect(body.data.figures).toMatchObject({
			entries: 4,
			totalDebit: 55700,
			totalCredit: 54700,
			difference: 1000,
			unbalanced: 1,
			undated: 0,
			empty: false,
		});
	});

	it('reads the legacy two-column entry', async () => {
		// jr_4 has no `lines`. Excluding February's other three entries leaves
		// only it, so its 20,000 either shows up here or is being dropped.
		const { body } = await post('/reports/journal', {
			startDate: '2026-02-18', endDate: '2026-02-22',
		});
		expect(body.data.figures).toMatchObject({ entries: 1, totalDebit: 20000, totalCredit: 20000 });
	});

	it('covers everything when no dates are given, undated entries included', async () => {
		// All seven entries. 100,000 + 30,000 + 50,000 + 20,000 + 5,000 + 1,000 + 700.
		const { status, body } = await post('/reports/journal', {});
		expect(status).toBe(200);
		expect(body.data.figures).toMatchObject({
			entries: 7,
			totalDebit: 206700,
			totalCredit: 205700,
			undated: 1,
			unbalanced: 1,
		});
		expect(body.data.coverage).toContain('Complete history');
	});

	it('treats an empty date string as no bound', async () => {
		// The UI clears a date input to ask for all time; '' must not read as an
		// invalid date, and must not read as the epoch either.
		const { body } = await post('/reports/journal', { startDate: '', endDate: '  ' });
		expect(body.data.figures.entries).toBe(7);
	});

	it('accepts a half-open range', async () => {
		// From March onwards: only the March sale.
		const { body } = await post('/reports/journal', { startDate: '2026-03-01' });
		expect(body.data.figures).toMatchObject({ entries: 1, totalDebit: 50000 });
		expect(body.data.coverage).toContain('onwards');
	});

	it('filters to one ledger by the entry’s own book', async () => {
		const { body } = await post('/reports/journal', { ledgerId: 'ldg_other' });
		expect(body.data.figures).toMatchObject({ entries: 1, totalDebit: 50000, totalCredit: 50000 });
		expect(body.data.coverage).toContain('Other Ledger');
	});

	it('reports an empty period as absence rather than as zeroes', async () => {
		const { status, body } = await post('/reports/journal', {
			startDate: '2020-01-01', endDate: '2020-12-31',
		});
		expect(status).toBe(200);
		expect(body.data.figures).toMatchObject({ entries: 0, empty: true });
		// Still a real document: "there is nothing here" is an answer worth filing.
		expect(await pdfHeader(body.data.r2Key)).toBe('%PDF-');
	});

	it('files a real PDF', async () => {
		const { body } = await post('/reports/journal', { startDate: '2026-01-01', endDate: '2026-12-31' });
		expect(await pdfHeader(body.data.r2Key)).toBe('%PDF-');
		expect(body.data.bytes).toBeGreaterThan(1000);
	});

	it('survives narration the PDF fonts cannot encode', async () => {
		// jr_7 alone. Without sanitising, pdf-lib throws out of drawText and this
		// is a 500 rather than a document.
		const { status, body } = await post('/reports/journal', {
			startDate: '2026-02-05', endDate: '2026-02-05',
		});
		expect(status).toBe(200);
		expect(body.data.figures.entries).toBe(1);
		expect(await pdfHeader(body.data.r2Key)).toBe('%PDF-');
	});

	it('versions rather than overwrites', async () => {
		const range = { startDate: '2026-02-01', endDate: '2026-02-28' };
		const first = await post('/reports/journal', range);
		const second = await post('/reports/journal', range);
		expect(second.body.data.version).toBe(first.body.data.version + 1);
		expect(second.body.data.r2Key).not.toBe(first.body.data.r2Key);
		// Somebody may already have circulated the first one.
		expect(await pdfHeader(first.body.data.r2Key)).toBe('%PDF-');
	});

	it('orders entries by date with undated ones last', async () => {
		// The renderer draws the list in the order it is handed, so the ordering
		// is a property of the report rather than of the page. Asserted against
		// the stored basis because the PDF cannot be read back.
		const { journalReport } = await import('../src/statements/reports');
		const r = await journalReport(env as any, { startDate: null, endDate: null });
		const dates = r.entries.map((e) => e.entryDate);

		expect(dates).toEqual([
			'2026-01-10', '2026-02-05', '2026-02-15', '2026-02-20', '2026-02-25', '2026-03-20', null,
		]);
	});

	it('refuses a range that runs backwards', async () => {
		const { status } = await post('/reports/journal', {
			startDate: '2026-06-30', endDate: '2026-01-01',
		});
		expect(status).toBe(400);
	});

	it('refuses a malformed date rather than reporting on a silently wrong range', async () => {
		const { status } = await post('/reports/journal', { startDate: 'last March' });
		expect(status).toBe(400);
	});

	it('refuses a ledger that does not exist', async () => {
		const { status } = await post('/reports/journal', { ledgerId: 'ldg_nope' });
		expect(status).toBe(400);
	});
});

describe('ledger report', () => {
	it('carries an opening balance in from before the range', async () => {
		// Bank at 1 Feb is January's 100,000. Within February: 700 + 30,000 + 4,000
		// out and 20,000 in, closing at 85,300.
		const { status, body } = await post('/reports/ledger', {
			scope: 'account', accountId: 'acc_bank',
			startDate: '2026-02-01', endDate: '2026-02-28',
		});
		expect(status).toBe(200);
		expect(body.data.figures).toMatchObject({
			accounts: 1, totalDebit: 20000, totalCredit: 34700, closingBalance: 85300,
		});
	});

	it('runs from inception when no start date is given', async () => {
		// Every bank movement ever: 100,000 + 20,000 + 50,000 in, 700 + 30,000
		// + 4,000 + 1,000 out. The undated entry counts here and nowhere else.
		const { body } = await post('/reports/ledger', { scope: 'account', accountId: 'acc_bank' });
		expect(body.data.figures).toMatchObject({
			totalDebit: 170000, totalCredit: 35700, closingBalance: 134300,
		});
	});

	it('reports a credit balance as a credit balance', async () => {
		// The loan was credited 20,000 and never touched again.
		const { body } = await post('/reports/ledger', { scope: 'account', accountId: 'acc_loan' });
		expect(body.data.figures).toMatchObject({ totalCredit: 20000, closingBalance: -20000 });
	});

	it('scopes to the accounts belonging to one book', async () => {
		// ldg_other owns exactly one account, the loan. Note this selects by the
		// ACCOUNT's book, not by the book stamped on each entry — jr_3 is tagged
		// ldg_other but posts to two ldg_main accounts, and must not appear.
		const { body } = await post('/reports/ledger', { scope: 'ledger', ledgerId: 'ldg_other' });
		expect(body.data.figures).toMatchObject({ accounts: 1, totalDebit: 0, totalCredit: 20000 });
		expect(body.data.coverage).toContain('Other Ledger');
	});

	it('covers every account at once', async () => {
		// Across all accounts and all time the totals must equal the journal's own:
		// 206,700 against 205,700. The 1,000 difference is the short posting, and
		// a report of everything is exactly where that belongs on the page.
		const { status, body } = await post('/reports/ledger', { scope: 'all' });
		expect(status).toBe(200);
		expect(body.data.figures).toMatchObject({
			totalDebit: 206700, totalCredit: 205700, difference: 1000,
			// Bank, Sales, Rent and the loan moved; the dormant account did not.
			accounts: 4, skippedEmpty: 1,
		});
		expect(await pdfHeader(body.data.r2Key)).toBe('%PDF-');
	});

	it('does not carry a closing balance for a multi-account report', async () => {
		// One number labelled "the closing balance" across four accounts would be
		// meaningless; it is reported as null rather than as a sum of unlike things.
		const { body } = await post('/reports/ledger', { scope: 'all' });
		expect(body.data.figures.closingBalance).toBeNull();
	});

	it('refuses a scope it cannot resolve', async () => {
		expect((await post('/reports/ledger', { scope: 'account' })).status).toBe(400);
		expect((await post('/reports/ledger', { scope: 'account', accountId: 'acc_nope' })).status).toBe(400);
		expect((await post('/reports/ledger', { scope: 'ledger' })).status).toBe(400);
		expect((await post('/reports/ledger', { scope: 'ledger', ledgerId: 'ldg_nope' })).status).toBe(400);
		expect((await post('/reports/ledger', {})).status).toBe(400);
		expect((await post('/reports/ledger', { scope: 'everything' })).status).toBe(400);
	});

	it('explains a book with no accounts rather than filing an empty report', async () => {
		const { status, body } = await post('/reports/ledger', { scope: 'ledger', ledgerId: 'ldg_bare' });
		expect(status).toBe(400);
		expect(body.error).toContain('no accounts');
	});
});

describe('listing', () => {
	it('lists what was generated, newest first, with its figures', async () => {
		await post('/reports/journal', { startDate: '2026-01-01', endDate: '2026-01-31' });
		const res = await call('/reports');
		expect(res.status).toBe(200);
		const { data } = await res.json<any>();
		expect(data.reports.length).toBeGreaterThan(0);
		const newest = data.reports[0];
		expect(['general_journal_report', 'ledger_report']).toContain(newest.docType);
		// Parsed server-side so the page can show what a report said without
		// re-reading the ledger.
		expect(newest.generationBasis.figures).toBeTruthy();
	});

	it('omits a report whose file has been deleted', async () => {
		const { body } = await post('/reports/journal', { startDate: '2026-05-01', endDate: '2026-05-31' });
		const key = body.data.r2Key;
		await env.CRM_BUCKET.delete(key);

		const { data } = await (await call('/reports')).json<any>();
		expect(data.reports.some((r: any) => r.r2Key === key)).toBe(false);
		// Named, not silently dropped: "never generated" and "generated and since
		// removed" must not look identical to whoever is reading.
		expect(data.missing).toBeGreaterThan(0);
		// The record itself survives — an audit trail that erases itself when a
		// bucket is tidied is not an audit trail.
		const row = await env.DB.prepare('SELECT id FROM generated_documents WHERE id = ?')
			.bind(body.data.docId).first();
		expect(row).toBeTruthy();
	});
});

describe('permissions', () => {
	it('gates the journal report on journal access, not on documents', async () => {
		// u_tech holds finance/journals and nothing else in finance.
		expect((await post('/reports/journal', {}, 'tech')).status).toBe(200);
		expect((await post('/reports/ledger', { scope: 'all' }, 'tech')).status).toBe(403);
	});

	it('gates the ledger report on ledger access', async () => {
		// u_mkt holds finance/ledgers and nothing else in finance.
		expect((await post('/reports/ledger', { scope: 'all' }, 'mkt')).status).toBe(200);
		expect((await post('/reports/journal', {}, 'mkt')).status).toBe(403);
	});

	it('shows each of them only the reports they may read', async () => {
		const forTech = await (await call('/reports', undefined, 'tech')).json<any>();
		expect(forTech.data.reports.every((r: any) => r.docType === 'general_journal_report')).toBe(true);
		const forMkt = await (await call('/reports', undefined, 'mkt')).json<any>();
		expect(forMkt.data.reports.every((r: any) => r.docType === 'ledger_report')).toBe(true);
	});

	it('refuses someone with neither grant', async () => {
		expect((await post('/reports/journal', {}, 'crm')).status).toBe(403);
		expect((await post('/reports/ledger', { scope: 'all' }, 'crm')).status).toBe(403);
		expect((await call('/reports', undefined, 'crm')).status).toBe(403);
	});

	it('gates the download by the same grant that generates it', async () => {
		// The PDF is the whole journal. Reading it has to need what producing it
		// needed — otherwise a documents grant quietly hands over the books.
		const { body } = await post('/reports/journal', { startDate: '2026-01-01', endDate: '2026-01-31' });
		const url = `https://test.local${body.data.url}`;
		const get = async (u: User) =>
			(await SELF.fetch(url, { headers: { Authorization: `Bearer ${await tokenFor(u)}` } })).status;

		expect(await get('tech')).toBe(200); // holds finance/journals
		expect(await get('mkt')).toBe(403);  // holds finance/ledgers only
		expect(await get('crm')).toBe(403);
	});
});
