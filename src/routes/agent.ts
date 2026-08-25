import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { UserPayload } from '../middleware/auth';
import { requireFeatureAccess } from '../middleware/rbac';
import { logAudit } from '../utils/audit';
import { ok, badRequest, serverError } from '../utils/response';
import { chunk } from '../utils/batch';
import { decideApproval, listPending } from '../agents/pleiades-accountant/approvals';
import { accountantKey, type AccountantTurn } from '../agents/pleiades-accountant/agent';
import {
  loadConfig,
  missingRequired,
  renderComplianceContext,
  GROUP_LABELS,
  GROUP_ORDER,
} from '../agents/pleiades-accountant/config';

/**
 * The Pleiades accountant, mounted inside the finance router at
 * /api/finance/agent.
 *
 * It is a capability of the Accounting department, not an application of its
 * own — the people who use it are the people who already work the ledgers.
 * Mounting it here means authMiddleware and requireAppAccess('finance') are
 * already applied by the parent, so this file only expresses the *extra* trust
 * each route needs beyond having finance access at all.
 */
const agentRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

/**
 * Validates a value against its declared type.
 *
 * This runs at the write boundary rather than at render time on purpose: a
 * malformed rate that reaches compliance_config is a figure the agent will read
 * out as fact. Rejecting "twenty-nine" here is much cheaper than discovering it
 * inside a filing draft.
 */
function validate(valueType: string, raw: string | null): { ok: true; value: string | null } | { ok: false; reason: string } {
  // Clearing a value is always allowed — it returns the variable to "unset",
  // which makes the agent refuse rather than use a stale figure.
  if (raw === null || raw === '') return { ok: true, value: null };
  const value = raw.trim();

  switch (valueType) {
    case 'percent': {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, reason: 'must be a number' };
      if (n < 0 || n > 100) return { ok: false, reason: 'must be between 0 and 100' };
      return { ok: true, value: String(n) };
    }
    case 'currency':
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) return { ok: false, reason: 'must be a number' };
      if (n < 0) return { ok: false, reason: 'cannot be negative' };
      return { ok: true, value: String(n) };
    }
    case 'date':
      // MM-DD: these are recurring annual boundaries, not calendar dates, so a
      // year would be actively misleading.
      if (!/^\d{2}-\d{2}$/.test(value)) return { ok: false, reason: 'must be MM-DD' };
      {
        const [m, d] = value.split('-').map(Number);
        if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, reason: 'not a valid month/day' };
      }
      return { ok: true, value };
    case 'boolean':
      if (value !== 'true' && value !== 'false') return { ok: false, reason: 'must be true or false' };
      return { ok: true, value };
    case 'json':
      try {
        JSON.parse(value);
      } catch {
        return { ok: false, reason: 'must be valid JSON' };
      }
      return { ok: true, value };
    case 'text':
      return { ok: true, value };
    default:
      return { ok: false, reason: `unknown value type: ${valueType}` };
  }
}

/**
 * GET /api/agent/config
 *
 * Every compliance variable, grouped for the settings UI, plus which required
 * ones are still unset.
 */
agentRouter.get('/config', requireFeatureAccess('finance', 'agent_config', 'view'), async (c) => {
  try {
    const vars = await loadConfig(c.env);
    return ok(c, {
      groups: GROUP_ORDER.filter((g) => vars.some((v) => v.group === g)).map((g) => ({
        key: g,
        label: GROUP_LABELS[g],
        vars: vars.filter((v) => v.group === g),
      })),
      missingRequired: missingRequired(vars).map((v) => ({ key: v.key, label: v.label, group: v.group })),
      total: vars.length,
    });
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * PUT /api/agent/config
 * Body: { values: { <config_key>: <string | null> } }
 *
 * Updates values in place for the current effective window. Superseding a rate
 * for a *new* window (a Finance Act change) is a different operation — see
 * POST /config/supersede — because editing in place would rewrite the past.
 */
agentRouter.put('/config', requireFeatureAccess('finance', 'agent_config', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const { values } = await c.req.json<{ values: Record<string, string | null> }>();
    if (!values || typeof values !== 'object') return badRequest(c, 'values object required');

    const existing = await loadConfig(c.env);
    const byKey = new Map(existing.map((v) => [v.key, v]));

    const errors: string[] = [];
    const updates: { key: string; value: string | null }[] = [];

    for (const [key, raw] of Object.entries(values)) {
      const v = byKey.get(key);
      if (!v) {
        errors.push(`${key}: unknown setting`);
        continue;
      }
      const result = validate(v.valueType, raw);
      if (!result.ok) {
        errors.push(`${v.label}: ${result.reason}`);
        continue;
      }
      updates.push({ key, value: result.value });
    }

    // All-or-nothing: a partial save would leave the operator guessing which
    // of their edits landed.
    if (errors.length > 0) return badRequest(c, errors.join('; '));

    const now = new Date();
    for (const batch of chunk(updates, 5)) {
      for (const u of batch) {
        await db
          .update(schema.complianceConfig)
          .set({ value: u.value, updatedBy: user.id, updatedAt: now })
          .where(eq(schema.complianceConfig.configKey, u.key));
      }
    }

    await logAudit(c.env, user.id, 'UPDATE', 'compliance_config', 'bulk', {
      keys: updates.map((u) => u.key),
    });

    const after = await loadConfig(c.env);
    return ok(c, {
      updated: updates.length,
      missingRequired: missingRequired(after).length,
    });
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * GET /api/agent/config/preview
 *
 * The exact compliance block that gets injected into the agent's system prompt.
 * Worth exposing: the operator should be able to see what the agent will read,
 * rather than trusting that their settings landed.
 */
agentRouter.get('/config/preview', requireFeatureAccess('finance', 'agent_config', 'view'), async (c) => {
  try {
    const vars = await loadConfig(c.env);
    return ok(c, { prompt: renderComplianceContext(vars) });
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * GET /api/agent/approvals
 *
 * What the agent is waiting on. These are the "crucial decisions" — opening an
 * account, linking a ledger, running payroll — that it refuses to take alone.
 */
agentRouter.get('/approvals', requireFeatureAccess('finance', 'agent', 'view'), async (c) => {
  try {
    return ok(c, await listPending(c.env));
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * POST /api/agent/approvals/:id
 * Body: { decision: 'approved' | 'rejected' }
 *
 * Gated on edit, not view: approving is authorising a change to the books, and
 * must be a deliberate act by someone entitled to make it.
 */
agentRouter.post('/approvals/:id', requireFeatureAccess('finance', 'agent', 'edit'), async (c) => {
  try {
    const user = c.get('user');
    const { decision } = await c.req.json<{ decision: 'approved' | 'rejected' }>();
    if (decision !== 'approved' && decision !== 'rejected') {
      return badRequest(c, "decision must be 'approved' or 'rejected'");
    }
    const result = await decideApproval(c.env, c.req.param('id')!, user.id, decision);
    if (!result.ok) return badRequest(c, result.reason);
    return ok(c, { id: c.req.param('id'), decision });
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * POST /api/agent/chat
 * Body: { message, thread? }
 *
 * The Accounting-department entry to the agent. Gated on `agent/reports` edit
 * rather than view: a turn can request approvals and, once approved, change the
 * books, so reading reports and driving the agent are different privileges.
 *
 * The turn runs as the caller. Every tool it invokes travels back through this
 * Worker's own middleware with that identity, so the agent is bounded by what
 * the person could do themselves — it cannot be used to borrow authority.
 */
agentRouter.post('/chat', requireFeatureAccess('finance', 'agent', 'edit'), async (c) => {
  try {
    const user = c.get('user');
    const { message, thread } = await c.req.json<{ message: string; thread?: string }>();
    if (!message || !message.trim()) return badRequest(c, 'message is required');

    const db = getDb(c.env);
    const account = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, user.id),
      with: { employee: true },
      columns: { name: true, email: true },
    });
    const operatorName =
      (account as any)?.employee?.name || account?.name || account?.email || 'the operator';

    const turn: AccountantTurn = {
      actorUserId: user.id,
      operatorName,
      prompt: message.trim(),
      origin: new URL(c.req.url).origin,
      conversationId: thread ? `conv_${user.id}_${thread}` : undefined,
    };

    const id = c.env.PLEIADES_AGENT.idFromName(accountantKey(user.id, thread));
    const stub = c.env.PLEIADES_AGENT.get(id);
    const res = await stub.fetch('https://pleiades.internal/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(turn),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[pleiades] turn failed:', res.status, detail);
      return serverError(c, new Error('The agent could not complete that turn.'));
    }

    await logAudit(c.env, user.id, 'CREATE', 'conversation_turns', 'chat', {
      thread: thread || 'default',
    });
    return ok(c, await res.json());
  } catch (err) {
    return serverError(c, err);
  }
});

export default agentRouter;
