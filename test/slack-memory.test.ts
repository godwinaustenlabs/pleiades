import { env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { conversationKey } from '../src/agents/slack/agent';

/**
 * The Slack agent's conversation memory.
 *
 * The Durable Object always gave serialisation; it did not give memory. Turns
 * were written to `turns` on every message and never read back, so `generateText`
 * received a bare `prompt` and the model saw exactly one user message per turn.
 * These tests drive the real DO methods rather than a re-typed copy of the
 * query, so a regression in the SQL itself fails here.
 */

/** A turn shaped like the webhook builds one. Only the recorded fields matter. */
const turnFor = (prompt: string) => ({
	slackId: 'U0TEST',
	actorUserId: 'usr_test',
	channel: 'D0TEST',
	prompt,
	origin: 'https://pleiades.test',
});

/** A fresh DO instance per test, so history from one cannot leak into another. */
const agentFor = (name: string) => {
	const id = env.SLACK_AGENT.idFromName(name);
	return env.SLACK_AGENT.get(id);
};

describe('slack agent conversation memory', () => {
	it('replays what was said, in the order it was said', async () => {
		await runInDurableObject(agentFor('mem-order'), async (agent: any) => {
			agent.record('user', turnFor(''), 'what is my leave balance?');
			agent.record('assistant', turnFor(''), 'You have 12 days.');
			agent.record('user', turnFor(''), 'and my manager?');

			const history = agent.loadRecentTurns();

			// Rows come out of SQLite newest-first and are reversed; getting this
			// backwards reads as the model answering before being asked.
			expect(history.map((h: any) => h.content)).toEqual([
				'what is my leave balance?',
				'You have 12 days.',
				'and my manager?',
			]);
			expect(history.map((h: any) => h.role)).toEqual(['user', 'assistant', 'user']);
		});
	});

	it('skips error rows, which are a record of failure and not dialogue', async () => {
		await runInDurableObject(agentFor('mem-errors'), async (agent: any) => {
			agent.record('user', turnFor(''), 'run payroll');
			agent.record('error', turnFor(''), 'Error: upstream 500');
			agent.record('assistant', turnFor(''), 'I could not do that.');

			const history = agent.loadRecentTurns();

			// Replaying a stack message as if the assistant had said it invites the
			// model to treat its own failures as content.
			expect(history).toHaveLength(2);
			expect(JSON.stringify(history)).not.toMatch(/upstream 500/);
		});
	});

	it('keeps the five most recent exchanges and drops older ones', async () => {
		await runInDurableObject(agentFor('mem-window'), async (agent: any) => {
			// 8 exchanges = 16 messages, comfortably past the 10-message window.
			for (let i = 1; i <= 8; i++) {
				agent.record('user', turnFor(''), `question ${i}`);
				agent.record('assistant', turnFor(''), `answer ${i}`);
			}

			const history = agent.loadRecentTurns();

			expect(history).toHaveLength(10);
			// The window keeps the newest, not the first ten written.
			expect(history[0].content).toBe('question 4');
			expect(history[history.length - 1].content).toBe('answer 8');
			expect(JSON.stringify(history)).not.toMatch(/question 3\b/);
		});
	});

	it('starts empty rather than throwing on a conversation with no history', async () => {
		await runInDurableObject(agentFor('mem-cold'), async (agent: any) => {
			// First message in a thread: the table does not exist yet, so the read
			// has to create it rather than fail the turn.
			expect(agent.loadRecentTurns()).toEqual([]);
		});
	});

	it('keeps separate threads separate', async () => {
		await runInDurableObject(agentFor(conversationKey('C1', '111.1')), async (agent: any) => {
			agent.record('user', turnFor(''), 'thread one message');
		});

		await runInDurableObject(agentFor(conversationKey('C1', '222.2')), async (agent: any) => {
			// Same channel, different thread — a different DO, so a different
			// history. Leaking between them would put one person's conversation in
			// front of another.
			expect(agent.loadRecentTurns()).toEqual([]);
		});
	});
});

describe('conversationKey', () => {
	it('groups a thread by its ts and top-level messages by channel', () => {
		expect(conversationKey('C1', '111.1')).toBe('C1:111.1');
		expect(conversationKey('C1')).toBe('C1:root');
		expect(conversationKey('C1', '111.1')).not.toBe(conversationKey('C1'));
	});
});
