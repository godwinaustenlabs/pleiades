import { Agent } from 'agents';
import { Pipeline } from 'nova-agent-framework';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../../index';
import { generateId } from '../../utils/id';
import { buildComplianceContext } from './config';
import { buildPleiadesTools } from './tools';
import { buildSystemPrompt } from './prompt';

/** One turn, after the caller has been authenticated and authorised. */
export interface AccountantTurn {
  /** users_logins.id whose permissions this turn runs under. */
  actorUserId: string;
  operatorName: string;
  prompt: string;
  /** Worker origin, so tools can call back into its own API. */
  origin: string;
  /** Groups turns into one conversation; defaults to the agent instance name. */
  conversationId?: string;
}

export interface AccountantReply {
  reply: string;
  conversationId: string;
  /** Approvals raised during this turn, for the UI to surface immediately. */
  pendingApprovals: { id: string; summary: string }[];
}

/**
 * The Pleiades accountant, hosted as an Agents-SDK Durable Object.
 *
 * One instance per conversation, which matters more here than for a chat
 * assistant: bookkeeping turns are stateful and consequential, and the Durable
 * Object serialises them so two requests cannot post the same journal twice or
 * race each other into creating the same account.
 *
 * Conversation history is written to D1 (agent_conversations /
 * conversation_turns) rather than only to `this.sql`, because the spec requires
 * a queryable audit trail the operator and their accountant can read directly —
 * `this.sql` is private to the instance.
 */
export class PleiadesAgent extends Agent<Env> {
  private async ensureConversation(turn: AccountantTurn): Promise<string> {
    const db = getDb(this.env);
    const id = turn.conversationId || `conv_${this.name}`;

    const existing = await db.query.agentConversations.findFirst({
      where: eq(schema.agentConversations.id, id),
    });
    if (!existing) {
      await db.insert(schema.agentConversations).values({
        id,
        startedAt: new Date(),
        operator: turn.actorUserId,
      });
    }
    return id;
  }

  private async recordTurn(
    conversationId: string,
    role: 'user' | 'assistant' | 'tool',
    content: string,
    toolCalls?: unknown,
  ) {
    const db = getDb(this.env);
    await db.insert(schema.conversationTurns).values({
      id: generateId('ctn'),
      conversationId,
      role,
      content,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : null,
      createdAt: new Date(),
    });
  }

  /**
   * Calls back into the Worker's own API as the acting user.
   *
   * A real subrequest, not an in-process call: a Durable Object cannot reach the
   * Hono app without an import cycle, and going over the origin means every tool
   * request traverses the same middleware chain a browser request does. The
   * internal actor header authorises it and its secret never leaves the Worker.
   */
  private apiCaller(turn: AccountantTurn) {
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
        const text = await res.text();
        if (!res.ok) {
          // Give the model the status: a 403 means "you may not", which it
          // should relay rather than retry, and a 400 usually means its payload
          // was wrong, which it can fix.
          return JSON.stringify({ success: false, status: res.status, error: text.slice(0, 500) });
        }
        return text;
      } catch (err) {
        return JSON.stringify({
          success: false,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      }
    };
  }

  async handleTurn(turn: AccountantTurn): Promise<AccountantReply> {
    const conversationId = await this.ensureConversation(turn);
    await this.recordTurn(conversationId, 'user', turn.prompt);

    const tools = buildPleiadesTools({
      env: this.env,
      actorUserId: turn.actorUserId,
      callApi: this.apiCaller(turn),
    });

    // Compliance context is rebuilt every turn, not cached: the operator may
    // have corrected a rate seconds ago, and a stale rate is the failure mode
    // this whole design exists to prevent.
    const complianceContext = await buildComplianceContext(this.env);

    const pipeline = new Pipeline({
      verbose: this.env.VERBOSE === 'true',
      llmConfig: {
        model: this.env.LLM_MODEL,
        provider: this.env.LLM_PROVIDER,
        // Low: this is bookkeeping, not brainstorming.
        temperature: 0.1,
        cloudflare: {
          accountId: this.env.CF_ACCOUNT_ID,
          gatewayId: this.env.CF_GATEWAY_NAME,
          cfAIGToken: this.env.CF_AIG_TOKEN,
        },
      },
      ctxManagerConfig: {
        clientId: conversationId,
        agentId: 'pleiades-accountant',
        memory: { type: 'summary', kvNamespace: this.env.MEMORY_KV_NAMESPACE, limitTurns: 6 },
      },
      promptBuilderConfig: {
        systemPrompt: buildSystemPrompt({
          complianceContext,
          operatorName: turn.operatorName,
          todayIso: new Date().toISOString().slice(0, 10),
        }),
      },
      tools,
    });

    let reply: string;
    try {
      reply = await pipeline.run(turn.prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordTurn(conversationId, 'assistant', `[error] ${message}`);
      throw err;
    }

    await this.recordTurn(conversationId, 'assistant', reply);

    // Anything the turn raised for a human to decide, surfaced with the answer
    // so the operator does not have to go looking for it.
    const db = getDb(this.env);
    const pending = await db.query.agentApprovals.findMany({
      where: eq(schema.agentApprovals.status, 'pending'),
    });
    const mine = pending
      .filter((p) => p.requestedBy === turn.actorUserId && p.expiresAt.getTime() > Date.now())
      .map((p) => ({ id: p.id, summary: p.summary }));

    return { reply, conversationId, pendingApprovals: mine };
  }

  /** HTTP entry. Only reachable from inside this Worker via the binding. */
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const turn = (await request.json()) as AccountantTurn;
    const result = await this.handleTurn(turn);
    return Response.json(result);
  }
}

/** Durable Object name for a conversation: one per operator per thread. */
export const accountantKey = (actorUserId: string, thread = 'default'): string =>
  `${actorUserId}:${thread}`;
