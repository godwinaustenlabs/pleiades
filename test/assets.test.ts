import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, tokenFor } from './helpers';
import {
	chargeForPeriod,
	depreciationAsOf,
	isDepreciable,
	monthlyCharge,
} from '../src/utils/depreciation';

/**
 * The asset register and its depreciation.
 *
 * The arithmetic is tested directly rather than through the API because the
 * same function values the statement of assets and liabilities: if the register
 * and the statement ever disagreed on an asset's written-down value, no amount
 * of route testing would tell you which one was wrong.
 */
beforeAll(async () => {
	await resetDatabase();
});

const laptop = {
	purchaseCost: 300000,
	purchaseDate: '2025-01-15',
	salvageValue: 30000,
	usefulLifeMonths: 36,
	accumulatedDepreciation: 0,
	disposedAt: null,
	assetClass: 'laptop',
};

describe('straight-line depreciation', () => {
	it('spreads cost less salvage over the useful life', () => {
		// (300,000 − 30,000) / 36 = 7,500 a month.
		expect(monthlyCharge(laptop)).toBe(7500);
	});

	it('charges from the month after purchase', () => {
		// Bought in January; by the end of March two months have been charged.
		expect(depreciationAsOf(laptop, '2025-03-31').monthsCharged).toBe(2);
		expect(depreciationAsOf(laptop, '2025-03-31').accumulated).toBe(15000);
	});

	it('stops at the useful life and lands exactly on cost less salvage', () => {
		// Five years on a three-year asset must not depreciate below salvage.
		const state = depreciationAsOf(laptop, '2030-01-31');
		expect(state.fullyDepreciated).toBe(true);
		expect(state.accumulated).toBe(270000);
		expect(state.writtenDownValue).toBe(30000);
	});

	it('stops depreciating at disposal', () => {
		// Sold in March 2025: April cannot be charged, however late you ask.
		const sold = { ...laptop, disposedAt: '2025-03-31' };
		expect(depreciationAsOf(sold, '2026-12-31').accumulated).toBe(15000);
		expect(depreciationAsOf(sold, '2026-12-31').disposed).toBe(true);
	});

	it('will not depreciate stationery', () => {
		// Consumed, not capitalised. It is expensed when bought, so carrying a
		// written-down value for it would overstate what the company owns.
		expect(isDepreciable({ ...laptop, assetClass: 'stationery' })).toBe(false);
		expect(monthlyCharge({ ...laptop, assetClass: 'stationery' })).toBe(0);
	});

	it('refuses rather than guesses when the figures are missing', () => {
		expect(isDepreciable({ ...laptop, usefulLifeMonths: null })).toBe(false);
		expect(isDepreciable({ ...laptop, purchaseCost: null })).toBe(false);
		expect(isDepreciable({ ...laptop, purchaseDate: null })).toBe(false);
	});
});

describe('the monthly charge', () => {
	it('catches up an asset that has never been posted', () => {
		// Entered late: three months owing, charged in one go rather than lost.
		const behind = { ...laptop, accumulatedDepreciation: 0, lastDepreciationPeriod: null };
		expect(chargeForPeriod(behind, '2025-04')).toBe(22500);
	});

	it('charges one month when it is up to date', () => {
		const current = {
			...laptop,
			accumulatedDepreciation: 22500,
			lastDepreciationPeriod: '2025-04',
		};
		expect(chargeForPeriod(current, '2025-05')).toBe(7500);
	});

	it('will not charge a period twice', () => {
		// The guard that makes a re-run safe. Without it, running the month again
		// would double the expense with nothing to show which entry was real.
		const posted = {
			...laptop,
			accumulatedDepreciation: 22500,
			lastDepreciationPeriod: '2025-04',
		};
		expect(chargeForPeriod(posted, '2025-04')).toBe(0);
		expect(chargeForPeriod(posted, '2025-03')).toBe(0);
	});

	it('charges nothing before the asset is in service', () => {
		expect(chargeForPeriod({ ...laptop, lastDepreciationPeriod: null }, '2025-01')).toBe(0);
	});

	it('charges nothing once fully depreciated', () => {
		const done = {
			...laptop,
			accumulatedDepreciation: 270000,
			lastDepreciationPeriod: '2028-01',
		};
		expect(chargeForPeriod(done, '2028-02')).toBe(0);
	});
});

describe('the register API', () => {
	const call = async (method: string, path: string, body?: unknown) =>
		SELF.fetch(`https://test.local/api/finance${path}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor('ceo')}` },
			...(body ? { body: JSON.stringify(body) } : {}),
		});

	it('creates an asset and values it', async () => {
		const res = await call('POST', '/assets', {
			assetName: 'MacBook Pro 14',
			assetClass: 'laptop',
			purchaseCost: 300000,
			purchaseDate: '2025-01-15',
			salvageValue: 30000,
			usefulLifeMonths: 36,
			serialNumber: 'C02X',
			vendor: 'Apple',
		});
		expect(res.status).toBe(201);
		const { data } = await res.json<any>();

		const got = await (await call('GET', `/assets/${data.id}?asOf=2025-07-31`)).json<any>();
		expect(got.data.monthlyDepreciation).toBe(7500);
		// Nothing posted yet, so the books still carry it at cost — and the gap
		// to what *should* have accrued is reported rather than hidden.
		expect(got.data.writtenDownValue).toBe(300000);
		expect(got.data.unpostedDepreciation).toBe(45000);
	});

	it('supplies a useful life from the class when none is given', async () => {
		const res = await call('POST', '/assets', {
			assetName: 'Office chair',
			assetClass: 'furniture',
			purchaseCost: 24000,
			purchaseDate: '2025-01-01',
		});
		const { data } = await res.json<any>();
		const got = await (await call('GET', `/assets/${data.id}`)).json<any>();
		expect(got.data.usefulLifeMonths).toBe(120);
	});

	it('rejects a salvage value above cost', async () => {
		const res = await call('POST', '/assets', {
			assetName: 'Nonsense',
			purchaseCost: 100,
			salvageValue: 500,
		});
		expect(res.status).toBe(400);
	});

	it('will not let a PATCH rewrite the primary key or the posted figure', async () => {
		const { data } = await (
			await call('POST', '/assets', { assetName: 'Printer', purchaseCost: 5000 })
		).json<any>();

		await call('PATCH', `/assets/${data.id}`, {
			id: 'ast_hijacked',
			accumulatedDepreciation: 999999,
			vendor: 'Canon',
		});

		const row = await env.DB.prepare(
			'SELECT id, vendor, accumulated_depreciation FROM assets WHERE id = ?',
		).bind(data.id).first<any>();
		expect(row.id).toBe(data.id);
		expect(row.vendor).toBe('Canon');
		// Accumulated depreciation is a consequence of posting, never an input:
		// setting it directly would put the register out of step with the ledger
		// with no journal to explain the difference.
		expect(row.accumulated_depreciation).toBe(0);
	});
});

describe('posting depreciation', () => {
	const call = async (method: string, path: string, body?: unknown) =>
		SELF.fetch(`https://test.local/api/finance${path}`, {
			method,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor('ceo')}` },
			...(body ? { body: JSON.stringify(body) } : {}),
		});

	let assetId = '';

	beforeAll(async () => {
		const now = Date.now();
		for (const [id, name, type] of [
			['acc_dep_exp', 'Depreciation Expense', 'expense'],
			['acc_dep_acc', 'Accumulated Depreciation', 'asset'],
		]) {
			await env.DB.prepare(
				`INSERT OR IGNORE INTO accounts (account_id, account_name, account_type, created_at)
				 VALUES (?, ?, ?, ?)`,
			).bind(id, name, type, now).run();
		}

		const { data } = await (
			await call('POST', '/assets', {
				assetName: 'Server rack',
				assetClass: 'equipment',
				purchaseCost: 600000,
				purchaseDate: '2025-01-01',
				salvageValue: 0,
				usefulLifeMonths: 60,
				depreciationExpenseAccountId: 'acc_dep_exp',
				accumulatedDepreciationAccountId: 'acc_dep_acc',
			})
		).json<any>();
		assetId = data.id;
	});

	it('writes one balanced compound entry and advances the register', async () => {
		const res = await call('POST', '/assets/post-depreciation', { period: '2025-02' });
		expect(res.status).toBe(200);
		const { data } = await res.json<any>();
		expect(data.posted).toBe(true);

		const journal = await env.DB.prepare(
			'SELECT amount, lines FROM general_journals WHERE journal_id = ?',
		).bind(data.journalId).first<any>();
		const lines = JSON.parse(journal.lines);
		const dr = lines.filter((l: any) => l.type === 'debit').reduce((s: number, l: any) => s + l.amount, 0);
		const cr = lines.filter((l: any) => l.type === 'credit').reduce((s: number, l: any) => s + l.amount, 0);
		expect(dr).toBe(cr);

		const row = await env.DB.prepare(
			'SELECT accumulated_depreciation, last_depreciation_period FROM assets WHERE id = ?',
		).bind(assetId).first<any>();
		expect(row.last_depreciation_period).toBe('2025-02');
		expect(row.accumulated_depreciation).toBeGreaterThan(0);
	});

	it('posts nothing when the period has already been charged', async () => {
		const before = await env.DB.prepare(
			'SELECT accumulated_depreciation FROM assets WHERE id = ?',
		).bind(assetId).first<any>();

		const { data } = await (await call('POST', '/assets/post-depreciation', { period: '2025-02' })).json<any>();
		expect(data.posted).toBe(false);
		expect(data.total).toBe(0);

		const after = await env.DB.prepare(
			'SELECT accumulated_depreciation FROM assets WHERE id = ?',
		).bind(assetId).first<any>();
		expect(after.accumulated_depreciation).toBe(before.accumulated_depreciation);
	});

	it('names assets it cannot post rather than silently skipping them', async () => {
		await call('POST', '/assets', {
			assetName: 'Unwired van',
			assetClass: 'vehicle',
			purchaseCost: 1200000,
			purchaseDate: '2025-01-01',
			usefulLifeMonths: 60,
		});
		const { data } = await (await call('POST', '/assets/post-depreciation', { period: '2025-06' })).json<any>();
		expect(data.skipped.some((s: any) => s.assetName === 'Unwired van')).toBe(true);
	});

	it('refuses to delete an asset whose depreciation is in the ledger', async () => {
		// Those charges are posted; deleting the thing they refer to would leave
		// journal lines pointing at nothing. Disposal is the way out.
		const res = await call('DELETE', `/assets/${assetId}`);
		expect(res.status).toBe(400);
	});

	it('disposes instead, and stops charging', async () => {
		expect((await call('POST', `/assets/${assetId}/dispose`, { disposedAt: '2025-03-31' })).status).toBe(200);
		const { data } = await (await call('POST', '/assets/post-depreciation', { period: '2025-09' })).json<any>();
		expect(data.skipped.some((s: any) => s.assetId === assetId)).toBe(false);
		const row = await env.DB.prepare('SELECT status FROM assets WHERE id = ?').bind(assetId).first<any>();
		expect(row.status).toBe('Disposed');
	});
});
