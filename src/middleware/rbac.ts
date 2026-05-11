import { Context, Next } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@ganova/database';
import { schema } from '@ganova/database';
import { UserPayload } from './auth';
import { Env } from '../index';

export type AppModule =
  | 'hr' | 'finance' | 'legal' | 'ops' | 'acquisition' | 'tech' | 'mcp_server' | 'crm' | 'dashboard';

/**
 * APP_FEATURES defines the canonical list of features for each app.
 * This is the single source of truth used by the permissions UI and backend.
 */
export const APP_FEATURES: Record<string, string[]> = {
  hr: ['employees', 'appointments', 'payroll', 'resets', 'tasks'],
  finance: ['transactions', 'invoices', 'fund_requests', 'accounts', 'tasks'],
  legal: ['agreements', 'templates', 'compliance', 'ip', 'tasks'],
  tech: ['projects', 'issues', 'deployments', 'tasks'],
  acquisition: ['campaigns', 'contacts', 'content', 'sprints', 'tasks'],
  ops: ['labs', 'committees', 'clients', 'docs', 'tasks'],
  crm: ['tickets', 'documents', 'planner', 'tasks'],
  dashboard: ['overview', 'notes'],
};

// ── Helper: check if user is superadmin ──────────────────────────
async function isSuperadmin(c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>): Promise<boolean> {
  const user = c.get('user');
  return user?.isSuperadmin === true;
}

/**
 * requireAppAccess(module)
 *
 * Checks whether the user has ANY permission for the given app module.
 * Resolution order:
 *   1. Superadmin bypass — always allowed.
 *   2. Check user_app_permissions for ANY row with can_view=1 for this app.
 *   3. Special case: CRM allows access via committee membership.
 *   4. Fallback: check legacy user_app_access table.
 */
export function requireAppAccess(moduleName: AppModule, _minLevel?: 'admin' | 'employee') {
  return async (
    c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>,
    next: Next,
  ) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // 1. Superadmin bypass
    if (await isSuperadmin(c)) return await next();

    const db = getDb(c.env);

    // 2. Check new granular permissions
    const permRecord = await db.query.userAppPermissions.findFirst({
      where: and(
        eq(schema.userAppPermissions.userId, user.id),
        eq(schema.userAppPermissions.appName, moduleName),
        eq(schema.userAppPermissions.canView, true)
      )
    });

    if (permRecord) return await next();

    // 3. CRM special case: committee membership
    if (moduleName === 'crm' && user.employeeId) {
      const membership = await db.query.committeeMembers.findFirst({
        where: eq(schema.committeeMembers.employeeId, user.employeeId)
      });
      if (membership) return await next();
    }

    // 4. Legacy fallback: check user_app_access
    const legacyAccess = await db.query.userAppAccess.findFirst({
      where: and(
        eq(schema.userAppAccess.userId, user.id),
        eq(schema.userAppAccess.appName, moduleName)
      )
    });
    if (legacyAccess) return await next();

    return c.json({ error: `Forbidden: Missing access to module ${moduleName}` }, 403);
  };
}

/**
 * requireFeatureAccess(appName, feature, level)
 *
 * Checks whether the user has specific feature-level permission.
 * level: 'view' | 'edit' | 'delete'
 * Superadmins always pass.
 */
export function requireFeatureAccess(appName: string, feature: string, level: 'view' | 'edit' | 'delete') {
  return async (
    c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>,
    next: Next,
  ) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Superadmin bypass
    if (await isSuperadmin(c)) return await next();

    const db = getDb(c.env);

    const perm = await db.query.userAppPermissions.findFirst({
      where: and(
        eq(schema.userAppPermissions.userId, user.id),
        eq(schema.userAppPermissions.appName, appName),
        eq(schema.userAppPermissions.feature, feature)
      )
    });

    if (!perm) {
      return c.json({ error: `Forbidden: no access to ${appName}/${feature}` }, 403);
    }

    if (level === 'view' && !perm.canView) {
      return c.json({ error: `Forbidden: cannot view ${appName}/${feature}` }, 403);
    }
    if (level === 'edit' && !perm.canEdit) {
      return c.json({ error: `Forbidden: cannot edit ${appName}/${feature}` }, 403);
    }
    if (level === 'delete' && !perm.canDelete) {
      return c.json({ error: `Forbidden: cannot delete ${appName}/${feature}` }, 403);
    }

    return await next();
  };
}

/**
 * Helper to check permissions inline (non-middleware)
 */
export async function checkFeaturePermission(
  c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>,
  appName: string,
  feature: string,
  level: 'view' | 'edit' | 'delete'
): Promise<boolean> {
  const user = c.get('user');
  if (!user) return false;

  if (await isSuperadmin(c)) return true;

  const db = getDb(c.env);
  const perm = await db.query.userAppPermissions.findFirst({
    where: and(
      eq(schema.userAppPermissions.userId, user.id),
      eq(schema.userAppPermissions.appName, appName),
      eq(schema.userAppPermissions.feature, feature)
    )
  });

  if (!perm) return false;
  if (level === 'view') return perm.canView === true;
  if (level === 'edit') return perm.canEdit === true;
  if (level === 'delete') return perm.canDelete === true;
  return false;
}

/**
 * requireSelfOrOwner(getTargetUserId)
 *
 * Allows access if:
 *   (a) Actor IS the target user (self), OR
 *   (b) Actor is a superadmin, OR
 *   (c) Actor has edit permission for hr/employees.
 */
export function requireSelfOrOwner(getTargetUserId: (c: Context) => string) {
  return async (
    c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>,
    next: Next,
  ) => {
    const actor = c.get('user');
    if (!actor) return c.json({ error: 'Unauthorized' }, 401);

    const targetUserId = getTargetUserId(c);

    // Self check
    if (actor.id === targetUserId) return await next();

    // Superadmin bypass
    if (await isSuperadmin(c)) return await next();

    // HR edit permission check
    if (await checkFeaturePermission(c, 'hr', 'employees', 'edit')) {
      return await next();
    }

    return c.json({
      error: 'Forbidden: you can only access your own records or if you have HR employee management permission',
    }, 403);
  };
}
