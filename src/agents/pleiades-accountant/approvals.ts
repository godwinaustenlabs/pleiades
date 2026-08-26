import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../../index';
import { generateId } from '../../utils/id';
import { logAudit } from '../../utils/audit';
import { recordAction } from './journal';
import { apiCallerFor, buildExecutors } from './executors';

/**
 * Human-in-the-loop approvals.
 *
 * The point of putting this in code rather than the prompt: a prompt
 * instruction ("ask before creating an account") is text, and text can be
 * argued with by other text — including text the agent read out of an invoice
 * description. A missing database row cannot be argued with.
 *
 * The approved payload is hashed and stored, and the hash is re-checked on
 * execution, so an approval for "open a PKR current account" can never be
 * replayed to open a different one.
 */

const TTL_MS = 60 * 60 * 1000; // An hour. A stale "yes" should not still authorise.

/** Stable hash of a payload — key order must not change the result. */
async function hashPayload(payload: unknown): Promise<string> {
  const canonical = JSON.stringify(payload, Object.keys(payload as object).sort());
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface ApprovalRequest {
  id: string;
  summary: string;
}

/** Records a request for the operator to approve, and returns its id. */
export async function requestApproval(
  ctx: { env: Env; actorUserId: string },
  toolName: string,
  payload: unknown,
  summary: string,
): Promise<ApprovalRequest> {
  const db = getDb(ctx.env);
  const id = generateId('apr');
  const now = Date.now();

  await db.insert(schema.agentApprovals).values({
    id,
    toolName,
    payload: JSON.stringify(payload),
    payloadHash: await hashPayload(payload),
    summary,
    status: 'pending',
    requestedBy: ctx.actorUserId,
    expiresAt: new Date(now + TTL_MS),
    createdAt: new Date(now),
  });

  await logAudit(ctx.env, ctx.actorUserId, 'CREATE', 'agent_approvals', id, { toolName, summary });
  return { id, summary };
}

/**
 * Checks an approval and marks it used.
 *
 * Refuses when it is unknown, not approved, expired, already consumed, for a
 * different tool, or for a different payload. Single-use: an approval is
 * consumed on first execution so a token cannot be replayed.
 */
export async function consumeApproval(
  ctx: { env: Env; actorUserId: string },
  approvalId: string,
  toolName: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb(ctx.env);

  const row = await db.query.agentApprovals.findFirst({
    where: eq(schema.agentApprovals.id, approvalId),
  });
  if (!row) return { ok: false, reason: 'That approval id does not exist.' };
  if (row.toolName !== toolName) {
    return { ok: false, reason: `That approval was for ${row.toolName}, not ${toolName}.` };
  }
  if (row.status === 'consumed') return { ok: false, reason: 'That approval has already been used.' };
  if (row.status === 'rejected') return { ok: false, reason: 'The operator rejected this.' };
  if (row.status !== 'approved') return { ok: false, reason: 'This is still awaiting approval.' };
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'That approval has expired. Ask again.' };
  }
  if (row.payloadHash !== (await hashPayload(payload))) {
    return {
      ok: false,
      reason: 'The details changed since approval was given. Request approval for the new version.',
    };
  }

  await db
    .update(schema.agentApprovals)
    .set({ status: 'consumed', consumedAt: new Date() })
    .where(eq(schema.agentApprovals.id, approvalId));

  await logAudit(ctx.env, ctx.actorUserId, 'UPDATE', 'agent_approvals', approvalId, {
    action: 'consumed',
    toolName,
  });

  // Journal it here rather than trusting the agent to remember. Everything that
  // reaches this point is, by definition, consequential enough to have needed a
  // human's permission — so the record of it must not depend on the model
  // choosing to call record_action afterwards. The agent still adds the
  // reasoning; this guarantees the fact.
  try {
    await recordAction(ctx.env, {
      actionType: toolName,
      subject: row.summary,
      summary: `Executed after approval ${approvalId}.`,
      entities: { approvalId, payload },
      actorUserId: ctx.actorUserId,
      source: 'approval_gate',
    });
  } catch (err) {
    console.error('[approvals] journal write failed:', err);
  }

  return { ok: true };
}

/**
 * Approves or rejects a pending request, and carries out an approved one.
 *
 * Approving used to only flip a status. The action itself then required the
 * agent to call the same tool again with a byte-identical payload plus the
 * token — which it could not do, having no memory of either. So the row is the
 * source of truth: it already holds the tool name and the exact payload the
 * operator saw, and that is what gets executed.
 *
 * It runs as `requested_by`, not as the approver. Approval is authorisation,
 * not impersonation — the write belongs in the audit trail under the name of
 * the person the agent was acting for, and running it as the approver would
 * also silently widen it to *their* grants.
 */
export async function decideApproval(
  env: Env,
  approvalId: string,
  deciderUserId: string,
  decision: 'approved' | 'rejected',
  origin?: string,
): Promise<{ ok: true; executed?: boolean; result?: string } | { ok: false; reason: string }> {
  const db = getDb(env);
  const row = await db.query.agentApprovals.findFirst({
    where: eq(schema.agentApprovals.id, approvalId),
  });
  if (!row) return { ok: false, reason: 'No such approval.' };
  if (row.status !== 'pending') return { ok: false, reason: `Already ${row.status}.` };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'Expired.' };

  await db
    .update(schema.agentApprovals)
    .set({ status: decision, decidedBy: deciderUserId, decidedAt: new Date() })
    .where(eq(schema.agentApprovals.id, approvalId));

  await logAudit(env, deciderUserId, 'UPDATE', 'agent_approvals', approvalId, {
    decision,
    toolName: row.toolName,
  });

  if (decision === 'rejected') return { ok: true, executed: false };

  // ── Carry it out ──────────────────────────────────────────────────────────
  if (!origin) {
    // Without an origin the executor cannot reach the Worker's own API. Leave
    // the row approved-but-unexecuted rather than pretending it ran.
    await db
      .update(schema.agentApprovals)
      .set({ executionStatus: 'pending' })
      .where(eq(schema.agentApprovals.id, approvalId));
    return { ok: true, executed: false };
  }

  const executors = buildExecutors(apiCallerFor(env, row.requestedBy, origin));
  const executor = executors[row.toolName];
  if (!executor) {
    await db
      .update(schema.agentApprovals)
      .set({
        executionStatus: 'failed',
        executionResult: `No executor for ${row.toolName}`,
        executedAt: new Date(),
      })
      .where(eq(schema.agentApprovals.id, approvalId));
    return { ok: false, reason: `Approved, but nothing knows how to run ${row.toolName}.` };
  }

  let result: string;
  let failed = false;
  try {
    result = await executor(JSON.parse(row.payload));
    // The API layer answers 200 with { success: false } for a rejected write,
    // so a thrown error is not the only failure mode worth catching.
    try {
      const parsed = JSON.parse(result);
      if (parsed && parsed.success === false) failed = true;
    } catch {
      // A non-JSON body is not itself a failure.
    }
  } catch (err) {
    failed = true;
    result = err instanceof Error ? err.message : String(err);
  }

  await db
    .update(schema.agentApprovals)
    // Only a successful run consumes the approval. A failed one stays
    // `approved` so it can be retried, rather than being burnt.
    .set({
      status: failed ? 'approved' : 'consumed',
      executionStatus: failed ? 'failed' : 'succeeded',
      executionResult: result.slice(0, 2000),
      executedAt: new Date(),
      ...(failed ? {} : { consumedAt: new Date() }),
    })
    .where(eq(schema.agentApprovals.id, approvalId));

  await logAudit(env, row.requestedBy, 'UPDATE', 'agent_approvals', approvalId, {
    action: 'executed',
    toolName: row.toolName,
    ok: !failed,
  });

  try {
    await recordAction(env, {
      actionType: row.toolName,
      subject: row.summary,
      summary: failed
        ? `Approved by ${deciderUserId}, but execution failed.`
        : `Approved by ${deciderUserId} and executed.`,
      rationale: failed ? result.slice(0, 500) : undefined,
      outcome: failed ? 'blocked' : 'completed',
      entities: { approvalId, payload: JSON.parse(row.payload) },
      actorUserId: row.requestedBy,
      source: 'approval_gate',
    });
  } catch (err) {
    console.error('[approvals] journal write failed:', err);
  }

  return failed
    ? { ok: false, reason: `Approved, but it failed to run: ${result.slice(0, 300)}` }
    : { ok: true, executed: true, result };
}

/** Pending requests for the operator to act on. */
export async function listPending(env: Env) {
  const db = getDb(env);
  const rows = await db.query.agentApprovals.findMany({
    where: eq(schema.agentApprovals.status, 'pending'),
  });
  const now = Date.now();
  return rows
    .filter((r) => r.expiresAt.getTime() >= now)
    .map((r) => ({
      id: r.id,
      toolName: r.toolName,
      summary: r.summary,
      payload: JSON.parse(r.payload),
      requestedBy: r.requestedBy,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
}
