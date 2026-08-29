import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../../index';

/**
 * Who may drive the accountant agent.
 *
 * The agent can set salary structures, run payroll and post journals. Reaching
 * it is therefore a privilege in its own right, separate from being able to use
 * Slack or hold a Pleiades account — an employee with HR access but no
 * accounting remit should not be able to ask it to open a ledger.
 *
 * The check is the same wherever the request came from: the Accounting UI route
 * enforces it through requireFeatureAccess, and the Slack path calls this
 * directly, because a Slack message never passes through Hono middleware with
 * the actor's identity attached.
 *
 * This is an *entry* check. It does not widen anything: each tool call still
 * travels back through the Worker's middleware as the actor, so their own
 * grants continue to bound what the agent can touch.
 */
export async function mayUseAccountant(
  env: Env,
  userId: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const db = getDb(env);

  const account = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.id, userId),
    columns: { id: true, isActive: true, isSuperadmin: true },
  });
  if (!account || account.isActive === false) {
    return { allowed: false, reason: 'That account is not active.' };
  }
  if (account.isSuperadmin) return { allowed: true };

  // `finance/agent` at edit: driving the agent can change the books once an
  // approval is granted, so it is not a read-level capability. It lives under
  // finance because the accountant is a capability of Accounting, not an app.
  const grant = await db.query.userAppPermissions.findFirst({
    where: and(
      eq(schema.userAppPermissions.userId, userId),
      eq(schema.userAppPermissions.appName, 'finance'),
      eq(schema.userAppPermissions.feature, 'agent'),
    ),
  });

  if (!grant || !(grant.canEdit || grant.canDelete)) {
    return {
      allowed: false,
      reason:
        "You don't have access to the accountant agent. Ask an administrator to grant you " +
        'finance / agent (edit) in the Access settings.',
    };
  }

  return { allowed: true };
}
