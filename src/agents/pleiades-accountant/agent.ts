import { Agent } from 'agents';
import { generateText, stepCountIs } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../../index';
import { agentModel } from '../../utils/model';
import { generateId } from '../../utils/id';
import { buildComplianceContext } from './config';
import { buildPleiadesTools } from './tools';
import { apiCallerFor } from './executors';
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
   * The recent conversation, rebuilt from D1.
   *
   * The Durable Object gives serialisation, not memory: without this the model
   * saw exactly one user message per turn and could not remember what it had
   * just said, what it had proposed, or what the operator asked two messages
   * ago. Turns were being written to `conversation_turns` and never read back.
   *
   * `tool` rows are skipped — they are a record of what was touched, not
   * dialogue, and replaying them as prose invites the model to treat its own
   * bookkeeping notes as instructions. Errors are skipped for the same reason.
   */
  private async loadRecentTurns(
    conversationId: string,
    limit = 8,
  ): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
    const db = getDb(this.env);
    const rows = await db
      .select()
      .from(schema.conversationTurns)
      .where(eq(schema.conversationTurns.conversationId, conversationId))
      .orderBy(desc(schema.conversationTurns.createdAt))
      .limit(limit * 2);

    return rows
      .reverse()
      .filter((r) => (r.role === 'user' || r.role === 'assistant') && !r.content.startsWith('[error]'))
      .slice(-limit)
      .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
  }

  async handleTurn(turn: AccountantTurn): Promise<AccountantReply> {
    const conversationId = await this.ensureConversation(turn);

    // Read history *before* recording this turn, or the prompt appears twice.
    const history = await this.loadRecentTurns(conversationId);
    await this.recordTurn(conversationId, 'user', turn.prompt);

    const tools = buildPleiadesTools({
      env: this.env,
      actorUserId: turn.actorUserId,
      callApi: apiCallerFor(this.env, turn.actorUserId, turn.origin),
    });

    // Compliance context is rebuilt every turn, not cached: the operator may
    // have corrected a rate seconds ago, and a stale rate is the failure mode
    // this whole design exists to prevent.
    const complianceContext = await buildComplianceContext(this.env);

    // Workers AI through the binding — no per-provider quota to run into
    // mid-payroll, and the model runs on the same platform as the data it is
    // reasoning about — fronted by this agent's own AI Gateway for request
    // logging, cost attribution and caching.
    const model = agentModel(this.env, this.env.AI_GATEWAY_PLEIADES);

    let reply: string;
    try {
      const result = await generateText({
        model,
        system: buildSystemPrompt({
          complianceContext,
          operatorName: turn.operatorName,
          todayIso: new Date().toISOString().slice(0, 10),
        }),
        messages: [...history, { role: 'user' as const, content: turn.prompt }],
        tools,
        // Bookkeeping needs several hops: read config, read records, compute,
        // then act. Capped so a confused turn cannot loop indefinitely against
        // the ledgers.
        // gpt-oss spends its output budget on an analysis channel before
        // answering, and on tool-heavy turns it runs out mid-thought and returns
        // no final message at all. Low effort keeps it terse and makes it commit
        // to an answer. The guardrails do not depend on the model deliberating:
        // refusals come from the calculators and approvals from the database.
        providerOptions: { 'workers-ai': { reasoning_effort: 'low' } },
        stopWhen: stepCountIs(12),
        // Low: this is bookkeeping, not brainstorming.
        temperature: 0.1,
      });

      reply = result.text?.trim() || '';

      // gpt-oss is a reasoning model, and on some turns it stops mid-thought:
      // reasoning is populated and `text` is empty. That reasoning is working
      // out, not an answer — presenting it as one would put half-finished
      // arithmetic in front of an accountant as though it were a conclusion. So
      // it is surfaced, but labelled for what it is.
      if (!reply) {
        const thinking = result.reasoningText?.trim();
        if (thinking) {
          reply =
            '_I did not finish this turn — below is my working, not a conclusion. ' +
            'Ask me to continue, or narrow the question._\n\n' +
            thinking;
        }
      }

      // A turn that used tools but produced no prose would otherwise read as
      // silence. Say what happened instead.
      if (!reply) {
        const used = result.steps?.flatMap((st: any) => st.toolCalls ?? []) ?? [];
        reply = used.length
          ? `I ran ${used.length} step(s) but produced no summary. Tools used: ${[
              ...new Set(used.map((c: any) => c.toolName)),
            ].join(', ')}.`
          : 'I could not produce an answer for that.';
      }

      // Record the tool calls alongside the turn, so the conversation log shows
      // what was actually touched and not only what was said about it.
      const toolCalls = result.steps?.flatMap((st: any) =>
        (st.toolCalls ?? []).map((c: any) => ({ tool: c.toolName, input: c.input })),
      );
      if (toolCalls?.length) {
        await this.recordTurn(conversationId, 'tool', `${toolCalls.length} tool call(s)`, toolCalls);
      }
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
