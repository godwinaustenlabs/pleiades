import { Context, MiddlewareHandler, Next } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '@ganova/database';
import { schema } from '@ganova/database';
import { UserPayload } from './auth';
import { Env } from '../index';

export type AppModule =
  | 'hr' | 'finance' | 'legal' | 'ops' | 'acquisition' | 'tech' | 'crm' | 'dashboard' | 'core' | 'admin';

export type PermissionLevel = 'view' | 'edit' | 'delete';

/**
 * APP_FEATURES defines the canonical list of features for each app.
 * This is the single source of truth used by the permissions UI and backend.
 */
export const APP_FEATURES: Record<string, string[]> = {
  hr: ['employees', 'appointments', 'payroll', 'resets', 'tasks'],
  // `ledgers`, `journals` and `trial_balance` are gated by the Finance UI but
  // were missing here, so getPerm() always returned false and those tabs were
  // superadmin-only by accident. They are real features; declare them.
  finance: [
    'transactions', 'invoices', 'fund_requests', 'accounts',
    'ledgers', 'journals', 'trial_balance',
    // The asset register. HR's own asset routes stay gated on hr/employees and
    // cover custody; the money columns live behind this one.
    'assets',
    'docs', 'tasks',
    // The Pleiades accountant lives in Accounting rather than in an app of its
    // own. Two features, not one: driving the agent and editing the rates it
    // quotes are different levels of trust, and collapsing them would mean
    // anyone who can ask it a question can also change what the law says.
    'agent', 'agent_config',
  ],
  // legal, tech, acquisition and ops were gated only by requireAppAccess, so a
  // role holding just `<app>/tasks` could read and write everything else in the
  // module — the same hole that was closed for finance and HR. Gating them per
  // feature meant declaring the features their routes actually serve; the ones
  // added here were undeclared, which (exactly as with finance's `ledgers`)
  // made getPerm() return false and hid those tabs from everyone but a
  // superadmin. Migration 0024 grants each new feature to whoever already holds
  // the app, so no role gains or loses access.
  legal: ['agreements', 'templates', 'compliance', 'ip', 'tasks', 'parties', 'requests', 'sops'],
  tech: ['projects', 'issues', 'deployments', 'tasks', 'epics', 'stories', 'releases', 'environments'],
  acquisition: [
    'campaigns', 'contacts', 'content', 'sprints', 'tasks',
    'funnels', 'outreach', 'activity', 'deals',
  ],
  ops: ['labs', 'committees', 'clients', 'docs', 'tasks', 'reports'],
  crm: ['tickets', 'documents', 'planner', 'tasks'],
  dashboard: ['overview', 'notes', 'tasks'],
  core: ['employees', 'labs', 'clients', 'committees', 'docs'],
  // `roles` was an admin feature until 0025 removed roles from the model.
  admin: ['permissions', 'users', 'api_keys', 'audit_logs', 'resets'],
};

/** The role whose grants a committee member inherits for CRM. */
/**
 * Committee membership implies these CRM grants.
 *
 * This used to be expressed as "whatever the CRM Member role holds". With roles
 * gone the rule is stated directly, which is also more honest: it was never
 * really about a role, it is that sitting on a committee is what entitles you
 * to the committee's CRM workspace. Delete is deliberately not implied — a
 * member can work the queue, not erase it.
 */
const COMMITTEE_IMPLIED_GRANTS: Grant[] = APP_FEATURES.crm.map((feature) => ({
  appName: 'crm',
  feature,
  canView: true,
  canEdit: true,
  canDelete: false,
}));

type Grant = {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type RbacContext = Context<{ Bindings: Env; Variables: { user: UserPayload } }>;

/**
 * Per-request grant cache. A Hono Context is created per request, so entries
 * become unreachable (and collectable) as soon as the request completes. This
 * avoids re-querying D1 for every feature check within a single request.
 */
const grantCache = new WeakMap<object, Grant[]>();

function toGrant(row: {
  appName: string;
  feature: string;
  canView: boolean | null;
  canEdit: boolean | null;
  canDelete: boolean | null;
}): Grant {
  return {
    appName: row.appName,
    feature: row.feature,
    canView: row.canView === true,
    canEdit: row.canEdit === true,
    canDelete: row.canDelete === true,
  };
}

/**
 * Resolves the caller's grants. This is the ONLY place authorization data is
 * read. Resolution is:
 *
 *   1. Superadmin  → short-circuited by the callers below, never reaches here.
 *   2. user id     → user_app_permissions (the single source of truth).
 *   3. Committee membership → inherits the CRM Member role's `crm` grants.
 *
 * Rule 3 preserves the long-standing behaviour that being on a committee is
 * itself sufficient for CRM access. It used to be an unnamed fallback buried in
 * the middleware; it is now an explicit, testable rule.
 */
async function resolveGrants(c: RbacContext): Promise<Grant[]> {
  const cached = grantCache.get(c);
  if (cached) return cached;

  const user = c.get('user');
  const db = getDb(c.env);

  // Read grants from the database rather than trusting anything in the JWT.
  // Tokens live for 8 hours, so a claim would let revoked access keep working
  // until expiry. An agent key names the user it acts as, and authMiddleware
  // already resolves that fresh on every request, so both paths end up here
  // with a user id and nothing else.
  const account = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.id, user.id),
    columns: { id: true, isActive: true },
  });
  if (!account || account.isActive === false) {
    grantCache.set(c, []);
    return [];
  }

  const rows = await db.query.userAppPermissions.findMany({
    where: eq(schema.userAppPermissions.userId, account.id),
  });
  const grants = rows.map(toGrant);

  // Committee membership implies the CRM grants above.
  if (user.employeeId && !grants.some((g) => g.appName === 'crm')) {
    const membership = await db.query.committeeMembers.findFirst({
      where: eq(schema.committeeMembers.employeeId, user.employeeId),
    });
    if (membership) grants.push(...COMMITTEE_IMPLIED_GRANTS);
  }

  grantCache.set(c, grants);
  return grants;
}

function satisfies(grant: Grant, level: PermissionLevel): boolean {
  // delete implies edit implies view.
  if (level === 'view') return grant.canView || grant.canEdit || grant.canDelete;
  if (level === 'edit') return grant.canEdit || grant.canDelete;
  return grant.canDelete;
}

function isSuperadmin(c: RbacContext): boolean {
  return c.get('user')?.isSuperadmin === true;
}

/**
 * requireAppAccess(module)
 *
 * Gates a whole router: the caller must hold at least view on some feature of
 * `moduleName`. For anything finer, use requireFeatureAccess.
 */
export function requireAppAccess(moduleName: AppModule): MiddlewareHandler {
  return async (rawCtx, next: Next) => {
    const c = rawCtx as unknown as RbacContext;
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (isSuperadmin(c)) return await next();

    const grants = await resolveGrants(c);
    const allowed = grants.some((g) => g.appName === moduleName && satisfies(g, 'view'));
    if (allowed) return await next();

    return c.json({ error: `Forbidden: Missing access to module ${moduleName}` }, 403);
  };
}

/**
 * requireFeatureAccess(appName, feature, level)
 *
 * Gates a single route on one feature at one level.
 */
export function requireFeatureAccess(appName: string, feature: string, level: PermissionLevel): MiddlewareHandler {
  return async (rawCtx, next: Next) => {
    const c = rawCtx as unknown as RbacContext;
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (isSuperadmin(c)) return await next();

    const grants = await resolveGrants(c);
    const grant = grants.find((g) => g.appName === appName && g.feature === feature);
    if (grant && satisfies(grant, level)) return await next();

    return c.json({ error: `Forbidden: cannot ${level} ${appName}/${feature}` }, 403);
  };
}

/**
 * Inline (non-middleware) permission check, for handlers that decide based on
 * request content rather than route shape.
 */
export async function checkFeaturePermission(
  c: RbacContext,
  appName: string,
  feature: string,
  level: PermissionLevel,
): Promise<boolean> {
  const user = c.get('user');
  if (!user) return false;
  if (isSuperadmin(c)) return true;

  const grants = await resolveGrants(c);
  const grant = grants.find((g) => g.appName === appName && g.feature === feature);
  return !!grant && satisfies(grant, level);
}

/**
 * Returns every app the caller can see at least one feature of. Used by the
 * frontend to decide which modules to render.
 */
export async function listAccessibleApps(c: RbacContext): Promise<string[]> {
  if (isSuperadmin(c)) return Object.keys(APP_FEATURES);
  const grants = await resolveGrants(c);
  return [...new Set(grants.filter((g) => satisfies(g, 'view')).map((g) => g.appName))];
}

/** Every grant in the system — what a superadmin effectively holds. */
function allGrants(): Grant[] {
  return Object.entries(APP_FEATURES).flatMap(([appName, features]) =>
    features.map((feature) => ({ appName, feature, canView: true, canEdit: true, canDelete: true })),
  );
}

/**
 * Flattens the implication chain (delete → edit → view) into the flags
 * themselves. The old per-user endpoint did this before returning, and the web
 * app reads `canView` directly, so the API contract is preserved.
 */
function withInheritance(grants: Grant[]): Grant[] {
  return grants.map((g) => ({
    ...g,
    canEdit: g.canEdit || g.canDelete,
    canView: g.canView || g.canEdit || g.canDelete,
  }));
}

/**
 * Effective grants for `userId`, defaulting to the caller. Callers are
 * responsible for authorizing reads of anyone other than themselves.
 */
export async function listGrants(c: RbacContext, userId?: string): Promise<Grant[]> {
  const actor = c.get('user');

  if (!userId || userId === actor.id) {
    return isSuperadmin(c) ? allGrants() : withInheritance(await resolveGrants(c));
  }

  const db = getDb(c.env);
  const target = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.id, userId),
  });
  if (!target) return [];
  if (target.isSuperadmin) return allGrants();

  const rows = await db.query.userAppPermissions.findMany({
    where: eq(schema.userAppPermissions.userId, target.id),
  });
  return withInheritance(rows.map(toGrant));
}

/**
 * requireSelfOrOwner(getTargetUserId)
 *
 * Allows the actor through if they are the target user, are a superadmin, or
 * hold edit on hr/employees.
 */
export function requireSelfOrOwner(getTargetUserId: (c: Context) => string): MiddlewareHandler {
  return async (rawCtx, next: Next) => {
    const c = rawCtx as unknown as RbacContext;
    const actor = c.get('user');
    if (!actor) return c.json({ error: 'Unauthorized' }, 401);

    if (actor.id === getTargetUserId(c)) return await next();
    if (isSuperadmin(c)) return await next();
    if (await checkFeaturePermission(c, 'hr', 'employees', 'edit')) return await next();

    return c.json({
      error: 'Forbidden: you can only access your own records or if you have HR employee management permission',
    }, 403);
  };
}
