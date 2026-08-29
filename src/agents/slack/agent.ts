import { Agent } from 'agents';
import { generateText, stepCountIs } from 'ai';
import { Env } from '../../index';
import { agentModel } from '../../utils/model';
import { buildSystemPrompt } from './prompt';
import { buildTools } from './tools';
import { postToSlack, replyToSlashCommand } from './lib/slack';

/**
 * How many prior messages are replayed to the model each turn.
 *
 * Ten messages is five user/assistant exchanges — the "last five" the bot is
 * expected to remember. Counted in messages rather than exchanges because that
 * is what `messages` takes, and a turn that errored leaves a user message with
 * no assistant reply, so the two do not divide evenly.
 */
const MAX_HISTORY_MESSAGES = 10;

/**
 * One turn handed to the agent by the webhook, after the Slack signature has
 * been verified and the Slack user mapped to a Pleiades account.
 */
export interface SlackTurn {
  /** Slack user id (U…), used for addressing and prompt context only. */
  slackId: string;
  /** The Pleiades users_logins id whose permissions this turn runs under. */
  actorUserId: string;
  channel: string;
  threadTs?: string;
  prompt: string;
  /** Slash commands reply here instead of chat.postMessage. */
  responseUrl?: string;
  /** Origin of the Worker, so tools can call back into its own API. */
  origin: string;
}

/**
 * The Slack agent, hosted as a Durable Object via the Agents SDK.
 *
 * One instance per Slack conversation (channel + thread), which is what makes
 * this worth being an Agent rather than a request handler:
 *
 *  - Turns in one thread are serialised by the Durable Object, so two quick
 *    messages cannot interleave and answer each other's question.
 *  - `this.sql` gives the conversation durable, queryable history that lives
 *    with the conversation instead of in a KV blob keyed by user. The last
 *    MAX_HISTORY_MESSAGES of it are replayed to the model each turn, which is
 *    what makes the bot able to follow "what about the other one?".
 *  - `this.schedule()` is available for follow-ups the agent should perform
 *    later, which a stateless webhook cannot do at all.
 *
 * The turn loop is the AI SDK's `generateText` over Workers AI, so tool
 * schemas are real JSON Schema derived from zod rather than a description the
 * model has to interpret.
 */
export class SlackAgent extends Agent<Env> {
  /**
   * Records the conversation. `this.sql` is the Durable Object's own SQLite —
   * separate from D1, and scoped to this one thread.
   */
  private ensureSchema() {
    this.sql`
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        slack_user TEXT,
        actor_user_id TEXT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `;
  }

  private record(role: 'user' | 'assistant' | 'error', turn: SlackTurn, content: string) {
    this.ensureSchema();
    this.sql`
      INSERT INTO turns (role, slack_user, actor_user_id, content, created_at)
      VALUES (${role}, ${turn.slackId}, ${turn.actorUserId}, ${content}, ${Date.now()})
    `;
  }

  /**
   * The recent conversation, replayed to the model.
   *
   * Without this the Durable Object gave serialisation but not memory: turns
   * were written to `turns` on every message and never read back, so the model
   * saw exactly one user message per turn and could not remember what it had
   * just said or what was asked two messages ago. This is the same defect the
   * accountant agent was built to fix — see `agents/accountant/agent.ts`.
   *
   * `error` rows are skipped. They record that a turn failed, which is useful
   * to a human reading the history but is not dialogue, and replaying a stack
   * message as if the assistant had said it invites the model to treat its own
   * failures as content.
   *
   * Ordered by `id` rather than `created_at`: two messages in the same
   * millisecond would tie on the timestamp, and AUTOINCREMENT cannot.
   */
  private loadRecentTurns(limit = MAX_HISTORY_MESSAGES) {
    this.ensureSchema();
    const rows = this.sql<{ role: string; content: string }>`
      SELECT role, content
      FROM turns
      WHERE role IN ('user', 'assistant')
      ORDER BY id DESC
      LIMIT ${limit}
    `;
    return rows
      .reverse()
      .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
  }

  /**
   * Calls back into this Worker's own API as the acting user.
   *
   * A real subrequest to the Worker's origin rather than an in-process call:
   * the Durable Object cannot reach the Hono app instance without an import
   * cycle, and going over the origin means a tool request traverses exactly the
   * same middleware chain (authMiddleware → requireAppAccess →
   * requireFeatureAccess) as a browser request. The internal actor header is
   * what authorises it, and its secret never leaves the Worker.
   */
  private apiCaller(turn: SlackTurn) {
    return async (method: string, path: string, body?: unknown): Promise<string> => {
      try {
        const res = await fetch(`${turn.origin}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'x-agent-actor': turn.actorUserId,
            'x-agent-secret': this.env.AGENT_INTERNAL_SECRET,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return JSON.stringify(await res.json());
      } catch (err) {
        console.error(`[SlackAgent] API call failed (${method} ${path}):`, err);
        return JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      }
    };
  }

  /** Runs one turn and posts the answer back to Slack. */
  async handleTurn(turn: SlackTurn): Promise<void> {
    // Read history *before* recording this turn, or the prompt appears twice —
    // once as the last history entry and again as the live message.
    const history = this.loadRecentTurns();
    this.record('user', turn, turn.prompt);

    // Workers AI through the binding — no third-party quota, which matters for
    // a bot that answers on demand — behind this agent's own AI Gateway, kept
    // separate from the accountant's so neither log buries the other.
    const model = agentModel(this.env, this.env.AI_GATEWAY_SLACK);

    const token = this.env.SLACK_BOT_OAUTH_TOKEN;

    let answer: string;
    try {
      const result = await generateText({
        model,
        system: buildSystemPrompt(turn.slackId),
        messages: [...history, { role: 'user' as const, content: turn.prompt }],
        tools: buildTools(this.apiCaller(turn)),
        // Keep gpt-oss terse: its analysis channel otherwise consumes the
        // output budget and the turn ends without a final message.
        providerOptions: { 'workers-ai': { reasoning_effort: 'low' } },
        stopWhen: stepCountIs(8),
        temperature: 0.2,
      });
      // Reasoning models sometimes leave `text` empty and put the answer in
      // reasoning; prefer text, fall back rather than replying with nothing.
      answer =
        result.text?.trim() ||
        result.reasoningText?.trim() ||
        'I could not produce an answer for that.';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SlackAgent] Turn failed:', err);
      this.record('error', turn, message);
      const text = `Sorry <@${turn.slackId}>, I encountered an error: ${message}`;
      if (turn.responseUrl) await replyToSlashCommand(turn.responseUrl, text);
      else if (token) await postToSlack(token, turn.channel, text, turn.threadTs);
      return;
    }

    this.record('assistant', turn, answer);

    // A DM is already one-to-one; mentioning the user there is noise.
    const text = turn.channel.startsWith('D') ? answer : `<@${turn.slackId}> ${answer}`;
    if (turn.responseUrl) await replyToSlashCommand(turn.responseUrl, text);
    else if (token) await postToSlack(token, turn.channel, text, turn.threadTs);
  }

  /**
   * The Durable Object's HTTP entry. The webhook posts a verified turn here;
   * nothing else may reach it, because the binding is only reachable from
   * inside this Worker.
   */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const turn = (await request.json()) as SlackTurn;
    await this.handleTurn(turn);
    return new Response(null, { status: 204 });
  }
}

/**
 * The Durable Object name for a Slack conversation.
 *
 * Thread replies group under the thread; top-level messages group by channel.
 */
export const conversationKey = (channel: string, threadTs?: string): string =>
  `${channel}:${threadTs ?? 'root'}`;
