import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { resetDatabase } from './helpers';
import { pruneJournalVectors } from '../src/agents/pleiades-accountant/journal';

/**
 * A year of semantic history, and a permanent dated record.
 *
 * The two are deliberately different lengths. Vectorize is bounded because
 * similarity search over years of routine bookkeeping surfaces the merely
 * similar ahead of the recent and relevant; `agent_journal` is not, because it
 * is the accountable record of what the agent did and a company's books are not
 * something to forget after twelve months.
 */
beforeAll(async () => {
	await resetDatabase();

	const row = (id: string, subject: string, occurredAt: string, vectorId: string | null) =>
		env.DB.prepare(
			`INSERT INTO agent_journal
			 (id, action_type, subject, summary, outcome, actor_user_id, source, vector_id, occurred_at, created_at)
			 VALUES (?, 'test', ?, 'summary', 'completed', 'u_ceo', 'agent', ?, ?, ?)`,
			// Seconds, not milliseconds: Drizzle's `mode: 'timestamp'` stores unix
			// seconds, which is what every row written through the ORM contains.
		).bind(id, subject, vectorId, Math.floor(Date.parse(occurredAt) / 1000), Math.floor(Date.now() / 1000)).run();

	await row('jnl_ancient', 'Two years ago', '2024-08-01T00:00:00Z', 'journal:jnl_ancient');
	await row('jnl_old', 'Thirteen months ago', '2025-07-20T00:00:00Z', 'journal:jnl_old');
	await row('jnl_recent', 'Last month', '2026-07-20T00:00:00Z', 'journal:jnl_recent');
	await row('jnl_never_embedded', 'Never indexed', '2020-01-01T00:00:00Z', null);
});

const now = new Date('2026-08-27T00:00:00Z');

/**
 * A stand-in for the index.
 *
 * The real binding cannot be reached from the test pool, and pointing this at
 * the live index would delete production vectors to prove a point. The stub
 * records what it was asked to remove, which is the thing worth asserting: the
 * sweep is only correct if it deletes exactly the vectors it then forgets.
 */
function stubVectorize() {
	const deleted: string[] = [];
	return {
		deleted,
		env: { ...env, VECTORIZE: { deleteByIds: async (ids: string[]) => { deleted.push(...ids); } } },
	};
}

describe('the retention sweep', () => {
	it('drops vectors older than a year and keeps the rest', async () => {
		const v = stubVectorize();
		const { pruned } = await pruneJournalVectors(v.env as any, { now });
		expect(pruned).toBe(2);
		expect(v.deleted.sort()).toEqual(['journal:jnl_ancient', 'journal:jnl_old']);

		const rows = await env.DB.prepare(
			'SELECT id, vector_id FROM agent_journal ORDER BY id',
		).all<any>();
		const byId = Object.fromEntries(rows.results.map((r: any) => [r.id, r.vector_id]));
		expect(byId.jnl_ancient).toBeNull();
		expect(byId.jnl_old).toBeNull();
		expect(byId.jnl_recent).toBe('journal:jnl_recent');
	});

	it('keeps every row, however old', async () => {
		// The record is the point. Dated recall still reaches all of it; only
		// similarity search is bounded.
		const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM agent_journal').first<any>();
		expect(row.n).toBe(4);
	});

	it('is safe to run again', async () => {
		const v = stubVectorize();
		const { pruned } = await pruneJournalVectors(v.env as any, { now });
		expect(pruned).toBe(0);
		expect(v.deleted).toEqual([]);
	});

	it('does nothing at all when there is no index to prune from', async () => {
		// Clearing `vector_id` without the binding would drop the only pointer to
		// vectors still sitting in the index, stranding them permanently.
		const before = await env.DB.prepare(
			'SELECT COUNT(*) AS n FROM agent_journal WHERE vector_id IS NOT NULL',
		).first<any>();
		const { pruned } = await pruneJournalVectors(
			{ ...env, VECTORIZE: undefined } as any,
			{ now, olderThanDays: 0 },
		);
		expect(pruned).toBe(0);
		const after = await env.DB.prepare(
			'SELECT COUNT(*) AS n FROM agent_journal WHERE vector_id IS NOT NULL',
		).first<any>();
		expect(after.n).toBe(before.n);
	});

	it('leaves rows that were never embedded alone', async () => {
		const row = await env.DB.prepare(
			'SELECT subject FROM agent_journal WHERE id = ?',
		).bind('jnl_never_embedded').first<any>();
		expect(row.subject).toBe('Never indexed');
	});

	it('takes the window from the caller', async () => {
		// A 30-day window catches last month's entry too, which proves the cutoff
		// is the parameter and not a constant baked into the query.
		const v = stubVectorize();
		const { pruned } = await pruneJournalVectors(v.env as any, { now, olderThanDays: 30 });
		expect(pruned).toBe(1);
		expect(v.deleted).toEqual(['journal:jnl_recent']);
	});
});
