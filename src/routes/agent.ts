import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess } from '../middleware/rbac';
import { logAudit } from '../utils/audit';
import { ok, badRequest, serverError } from '../utils/response';
import { chunk } from '../utils/batch';
import { decideApproval, listPending } from '../agents/pleiades/approvals';
import {
  loadConfig,
  missingRequired,
  renderComplianceContext,
  GROUP_LABELS,
  GROUP_ORDER,
} from '../agents/pleiades/config';

const agentRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

agentRouter.use('*', authMiddleware);
agentRouter.use('*', requireAppAccess('agent'));

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
agentRouter.get('/config', requireFeatureAccess('agent', 'config', 'view'), async (c) => {
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
agentRouter.put('/config', requireFeatureAccess('agent', 'config', 'edit'), async (c) => {
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
agentRouter.get('/config/preview', requireFeatureAccess('agent', 'config', 'view'), async (c) => {
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
agentRouter.get('/approvals', requireFeatureAccess('agent', 'reports', 'view'), async (c) => {
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
agentRouter.post('/approvals/:id', requireFeatureAccess('agent', 'reports', 'edit'), async (c) => {
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

export default agentRouter;
