import { Agent } from 'agents';
import { Pipeline } from 'nova-agent-framework';
import { Env } from '../../index';
import { buildSystemPrompt } from './prompt';
import { buildTools } from './tools';
import { postToSlack, replyToSlashCommand } from './lib/slack';

/**
 * One turn handed to the agent by the webhook, after the Slack signature has
 * been verified and the Slack user mapped to an officeOS account.
 */
export interface SlackTurn {
  /** Slack user id (U…), used for addressing and prompt context only. */
  slackId: string;
  /** The officeOS users_logins id whose permissions this turn runs under. */
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
 *    with the conversation instead of in a KV blob keyed by user.
 *  - `this.schedule()` is available for follow-ups the agent should perform
 *    later, which a stateless webhook cannot do at all.
 *
 * Only the SDK's core entry point is imported. Its `schedule`, `mcp` and
 * `experimental/*` subpaths require zod v4 while this project is on v3 (see
 * tools.ts) — `this.schedule()` used here is a method on Agent and is not part
 * of that zod-dependent surface.
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
            'x-agent-secret': this.env.AGENT_INTERNAL_SECRET || '',
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
    this.record('user', turn, turn.prompt);

    const pipeline = new Pipeline({
      verbose: this.env.VERBOSE === 'true',
      llmConfig: {
        model: this.env.LLM_MODEL,
        provider: this.env.LLM_PROVIDER,
        temperature: 0.2,
        cloudflare: {
          accountId: this.env.CF_ACCOUNT_ID,
          gatewayId: this.env.CF_GATEWAY_NAME,
          cfAIGToken: this.env.CF_AIG_TOKEN,
        },
      },
      ctxManagerConfig: {
        // Keyed by conversation, not by user: this agent instance *is* the
        // thread, so two threads with the same person no longer share context.
        clientId: this.name,
        agentId: this.env.AGENT_ID || 'nova-slack-agent',
        memory: {
          type: 'summary',
          kvNamespace: this.env.MEMORY_KV_NAMESPACE,
          limitTurns: 3,
        },
      },
      promptBuilderConfig: { systemPrompt: buildSystemPrompt(turn.slackId) },
      tools: buildTools(this.apiCaller(turn)),
    });

    const token = this.env.SLACK_BOT_OAUTH_TOKEN;

    let answer: string;
    try {
      answer = await pipeline.run(turn.prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SlackAgent] Pipeline error:', err);
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
