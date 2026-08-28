import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { resetDatabase } from './helpers';
import { promptFor, runDailyCheck } from '../src/agents/accountant/daily-runner';

/**
 * The scheduled check.
 *
 * The turn itself needs a model, which the test pool has no access to, so what
 * is pinned here is everything around it: whose authority it runs under, when
 * it refuses to run at all, and what the prompt actually instructs. Those are
 * the parts where a mistake would matter — an unattended job acting under the
 * wrong identity, or one that quietly invents figures.
 */
beforeAll(async () => {
	await resetDatabase();
});

const setActor = (value: string | null) =>
	env.DB.prepare('UPDATE compliance_config SET value = ? WHERE config_key = ?')
		.bind(value, 'daily_runner_actor').run();

describe('who it runs as', () => {
	it('refuses to run when no operator is configured', async () => {
		await setActor(null);
		const result = await runDailyCheck(env as any, 'https://test.local');
		// Not an error, and emphatically not a default. Picking whose authority
		// to act under is a decision about trust, not something code guesses.
		expect(result.ran).toBe(false);
		expect(result.reason).toMatch(/not configured/i);
	});

	it('refuses when the configured operator is not a real active account', async () => {
		await setActor('u_does_not_exist');
		const result = await runDailyCheck(env as any, 'https://test.local');
		expect(result.ran).toBe(false);
		expect(result.reason).toMatch(/not an active account/i);
	});

	it('refuses when the operator has been deactivated', async () => {
		// A leaver's account must not keep driving a nightly job.
		await env.DB.prepare('UPDATE users_logins SET is_active = 0 WHERE id = ?').bind('u_tech').run();
		await setActor('u_tech');
		const result = await runDailyCheck(env as any, 'https://test.local');
		expect(result.ran).toBe(false);
		await env.DB.prepare('UPDATE users_logins SET is_active = 1 WHERE id = ?').bind('u_tech').run();
	});

	it('posts nothing when it refuses', async () => {
		const { results } = await env.DB.prepare(
			"SELECT id FROM app_messages WHERE type = 'agent_check'",
		).all();
		expect(results).toHaveLength(0);
	});
});

describe('what it asks for', () => {
	const morning = promptFor(new Date('2026-08-26T06:00:00Z'), 'morning');
	const evening = promptFor(new Date('2026-08-26T17:00:00Z'), 'evening');

	it('states the date, so the agent never has to guess it', () => {
		expect(morning).toContain('2026-08-26');
	});

	it('sends it to the manual and the settings before it says anything', () => {
		expect(morning).toContain('knowledge_search');
		expect(morning).toContain('get_compliance_config');
	});

	it('forbids estimating an unset rate', () => {
		// The rule the whole agent is built around: refuse rather than approximate.
		expect(morning).toMatch(/only rates you may quote/i);
		expect(morning).toMatch(/rather than estimating/i);
	});

	it('has it check what it already did this month', () => {
		expect(morning).toContain('recall_actions');
		expect(morning).toContain('2026-08');
	});

	it('lets it generate a statement but not change the books', () => {
		// A statement writes a draft PDF and changes nothing; anything that would
		// touch the ledger has to come back as an approval.
		expect(morning).toMatch(/changes no books/i);
		expect(morning).toMatch(/raise as an approval and stop/i);
	});

	it('allows a quiet day to be a quiet day', () => {
		expect(morning).toMatch(/inventing\s+work to look busy is not/i);
		expect(evening).toMatch(/say so in one line/i);
	});

	it('asks a different question in the evening', () => {
		expect(evening).toMatch(/approvals still pending/i);
		expect(evening).not.toBe(morning);
	});
});
