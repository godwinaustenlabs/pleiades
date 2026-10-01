import { Context, MiddlewareHandler, Next } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@pleiades/database';
import { schema } from '@pleiades/database';
import { UserPayload } from './auth';
import { Env } from '../index';

export type AppModule =
  | 'hr' | 'finance' | 'legal' | 'ops' | 'acquisition' | 'tech' | 'crm' | 'dashboard' | 'core' | 'admin';

export type PermissionLevel = 'view' | 'edit' | 'delete';

/**
 * APP_FEATURES defines the canonical list of features for each app.
 * This is the single source of truth used by the permissions UI and backend.
 */
/**
 * Mail is a feature of every department, not an app of its own.
 *
 * `<app>/email` is what the Access page calls "who may use this department's
 * mail": view reads that app's mailboxes, edit sends from them, delete archives
 * and permits a bulk send. `<app>/email_templates` is separate because writing
 * the message everyone receives is a different act from sending one.
 *
 * A PERSONAL mailbox appears in none of this. It is reachable by the person it
 * belongs to and nobody else, decided by `owner_user_id` in
 * src/email/mailboxes.ts rather than by a grant — the same reasoning that makes
 * `dashboard` app-gated, since ownership already answers the question. Adding a
 * `dashboard/email` feature would imply somebody could be granted access to
 * another person's private mail, which is exactly what must not be grantable.
 *
 * `core` has no mail: it is shared reference data (employees, labs, clients),
 * not a department anyone writes to.
 */
export const APP_FEATURES: Record<string, string[]> = {
  // `resets` was here for the manual approval queue, which is gone — reset is
  // self-service now and gated on nothing, being for people who cannot log in.
  // `appointments` moved to the `admin` app. Creating a post and deciding who holds
  // it is the act that confers access — a handover moves grants, a mailbox and a
  // committee seat — so it belongs with the other access controls and not with
  // payroll. HR still READS the list, to show somebody's post in the directory.
  hr: ['employees', 'payroll', 'tasks', 'email', 'email_templates'],
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
    'email', 'email_templates',
  ],
  // legal, tech, acquisition and ops were gated only by requireAppAccess, so a
  // role holding just `<app>/tasks` could read and write everything else in the
  // module — the same hole that was closed for finance and HR. Gating them per
  // feature meant declaring the features their routes actually serve; the ones
  // added here were undeclared, which (exactly as with finance's `ledgers`)
  // made getPerm() return false and hid those tabs from everyone but a
  // superadmin. Migration 0024 grants each new feature to whoever already holds
  // the app, so no role gains or loses access.
  legal: ['agreements', 'templates', 'compliance', 'ip', 'tasks', 'parties', 'requests', 'sops', 'email', 'email_templates'],
  tech: ['projects', 'issues', 'deployments', 'tasks', 'epics', 'stories', 'releases', 'environments', 'email', 'email_templates'],
  acquisition: [
    'campaigns', 'contacts', 'content', 'sprints', 'tasks',
    'funnels', 'outreach', 'activity', 'deals',
    'email', 'email_templates',
  ],
  ops: ['labs', 'committees', 'clients', 'docs', 'tasks', 'reports', 'email', 'email_templates'],
  crm: ['tickets', 'documents', 'planner', 'tasks', 'email', 'email_templates'],
  dashboard: ['overview', 'notes', 'tasks'],
  core: ['employees', 'labs', 'clients', 'committees', 'docs'],
  // `roles` was an admin feature until 0025 removed roles from the model.
  // `mailboxes` creates and assigns them; `email_config` edits the system
  // templates every department's automated mail renders through. Split for the
  // same reason finance/agent and finance/agent_config are: whoever can send a
  // message should not thereby be able to change the address it comes from.
  // `appointments` creates posts, assigns holders and deletes them; `permissions`
  // decides what a post may reach. Two features rather than one, for the same reason
  // finance/agent and finance/agent_config are split: being able to appoint somebody
  // to a job should not by itself be able to redefine what the job opens.
  admin: ['permissions', 'appointments', 'users', 'api_keys', 'audit_logs', 'mailboxes', 'email_config'],
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

type Db = ReturnType<typeof getDb>;

/** One appointment a person holds, and what holding it grants. */
export type AppointmentGrants = {
  appointmentId: string;
  roleOrTitle: string | null;
  committeeId: string | null;
  grants: Grant[];
};

/** Every source of a person's access, kept apart so a UI can say where each came from. */
export type GrantSources = {
  employeeId: string | null;
  /**
   * When true, every grant below is recorded but irrelevant: a superadmin
   * bypasses each check outright. Reported rather than expanded into the full
   * grant list, so a UI can say WHY the account reaches everything instead of
   * showing a matrix that looks like somebody ticked all of it.
   */
  isSuperadmin: boolean;
  /** Rows that name the person directly — access that is theirs regardless of post. */
  direct: Grant[];
  /** One entry per ACTIVE appointment they hold. */
  appointments: AppointmentGrants[];
  /** True when committee membership contributed COMMITTEE_IMPLIED_GRANTS. */
  viaCommittee: boolean;
  /** The union, with the delete⊃edit⊃view implication flattened into the flags. */
  effective: Grant[];
};

/**
 * Per-request caches. A Hono Context is created per request, so entries become
 * unreachable (and collectable) as soon as the request completes. This avoids
 * re-querying D1 for every feature check within a single request — which matters
 * more now than it did, because resolving grants costs three or four queries
 * rather than one.
 */
const grantCache = new WeakMap<object, Grant[]>();
const employeeCache = new WeakMap<object, { value: string | null }>();

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
 * Unions grant lists per (appName, feature), OR-ing the three flags.
 *
 * This is what "a person gets everything all their appointments grant" means
 * mechanically. Union rather than precedence, deliberately: with two appointments
 * there is no ordering to break a tie with, and any ordering invented for the
 * purpose would mean holding a second post could silently NARROW access — which
 * is the opposite of what appointing somebody to something is meant to do.
 */
function unionGrants(...lists: Grant[][]): Grant[] {
  const merged = new Map<string, Grant>();
  for (const list of lists) {
    for (const g of list) {
      const key = `${g.appName}\u0000${g.feature}`;
      const seen = merged.get(key);
      if (!seen) {
        merged.set(key, { ...g });
        continue;
      }
      seen.canView = seen.canView || g.canView;
      seen.canEdit = seen.canEdit || g.canEdit;
      seen.canDelete = seen.canDelete || g.canDelete;
    }
  }
  return [...merged.values()];
}

/**
 * Every source of one login's access, read fresh from the database.
 *
 * Used by BOTH the per-request resolver below and `listGrants`, which used to
 * carry its own copy of the query — and, because it was a copy, had already
 * drifted: it omitted the committee rule, so `/api/permissions/user/:id`
 * reported less access than the user actually had. One implementation, two
 * callers.
 */
async function collectGrantSources(db: Db, userId: string): Promise<GrantSources | null> {
  const account = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.id, userId),
    columns: { id: true, isActive: true, employeeId: true, isSuperadmin: true },
  });
  if (!account) return null;

  const empty: GrantSources = {
    employeeId: account.employeeId ?? null,
    isSuperadmin: account.isSuperadmin === true,
    direct: [],
    appointments: [],
    viaCommittee: false,
    effective: [],
  };
  if (account.isActive === false) return empty;

  const direct = (await db.query.userAppPermissions.findMany({
    where: eq(schema.userAppPermissions.userId, account.id),
  })).map(toGrant);

  /**
   * Appointment-derived access.
   *
   * The employee id comes from the row just read, NOT from the JWT. The token
   * carries a copy made when it was signed and sessions last over a week, so a
   * token minted before somebody was linked to an employee — or relinked to a
   * different one — would otherwise still be presenting the old link and
   * collecting the old appointments' grants.
   *
   * `isActive` on the appointment is the switch. An appointment that has been
   * ended grants nothing the moment the box is unticked, with no token to expire
   * first, because this runs per request.
   */
  const appointments: AppointmentGrants[] = [];
  if (account.employeeId) {
    const held = await db.query.appointments.findMany({
      where: and(
        eq(schema.appointments.employeeId, account.employeeId),
        eq(schema.appointments.isActive, true),
      ),
      columns: { id: true, roleOrTitle: true, committeeId: true },
    });

    if (held.length > 0) {
      const rows = await db.query.appointmentAppPermissions.findMany({
        where: inArray(schema.appointmentAppPermissions.appointmentId, held.map((a) => a.id)),
      });
      for (const appt of held) {
        appointments.push({
          appointmentId: appt.id,
          roleOrTitle: appt.roleOrTitle ?? null,
          committeeId: appt.committeeId ?? null,
          grants: rows.filter((r) => r.appointmentId === appt.id).map(toGrant),
        });
      }
    }
  }

  let viaCommittee = false;
  const fromPosts = unionGrants(direct, ...appointments.map((a) => a.grants));

  // Committee membership implies the CRM grants above. Checked after the union
  // because it is a fallback for having no CRM access at all, not an addition to
  // whatever CRM access an appointment already confers.
  if (account.employeeId && !fromPosts.some((g) => g.appName === 'crm')) {
    const membership = await db.query.committeeMembers.findFirst({
      where: eq(schema.committeeMembers.employeeId, account.employeeId),
    });
    if (membership) viaCommittee = true;
  }

  return {
    employeeId: account.employeeId ?? null,
    isSuperadmin: account.isSuperadmin === true,
    direct,
    appointments,
    viaCommittee,
    effective: withInheritance(
      viaCommittee ? unionGrants(fromPosts, COMMITTEE_IMPLIED_GRANTS) : fromPosts,
    ),
  };
}

/**
 * Every source of `userId`'s access, for a UI that needs to show provenance.
 * Authorization decisions go through the functions below, never through this.
 */
export async function describeGrants(env: Env, userId: string): Promise<GrantSources | null> {
  return collectGrantSources(getDb(env), userId);
}

/**
 * The employee the caller is.
 *
 * `authMiddleware` resolves this from `users_logins` on every request and refuses a
 * token whose account is gone or deactivated, so `UserPayload.employeeId` is the
 * database's answer rather than the token's — see the long note there for the three
 * things that were wrong while it was the token's.
 *
 * Still a function rather than a property read at each call site, for two reasons:
 * it is the one place the rule "this comes from the row, not the claim" is stated,
 * and it keeps the option of resolving it lazily if the shape ever changes. Async
 * for the same reason.
 */
export async function actorEmployeeId(c: RbacContext): Promise<string | null> {
  const cached = employeeCache.get(c);
  if (cached) return cached.value;

  const user = c.get('user');
  const value = user?.employeeId ?? null;
  if (user) employeeCache.set(c, { value });
  return value;
}

/**
 * Resolves the caller's grants. This is the ONLY place authorization data is
 * read. Resolution is:
 *
 *   1. Superadmin  → short-circuited by the callers below, never reaches here.
 *   2. user id     → user_app_permissions            (access tied to the person)
 *   3. employee id → active appointments
 *                  → appointment_app_permissions     (access tied to the post)
 *   4. Committee membership → COMMITTEE_IMPLIED_GRANTS, when 2 and 3 gave no CRM.
 *
 * 2 and 3 are UNIONED, not ordered: somebody who is both CMO and a project
 * manager holds what both appointments grant, at once, in one login. That is the
 * whole point of the model — see schema/auth.ts.
 *
 * Nothing here is read from the JWT but the user id. Grants and the employee link
 * are both database reads on every request, so narrowing access — or ending an
 * appointment, or handing it to somebody else — takes effect on the next request
 * rather than at token expiry.
 */
async function resolveGrants(c: RbacContext): Promise<Grant[]> {
  const cached = grantCache.get(c);
  if (cached) return cached;

  const user = c.get('user');
  const sources = await collectGrantSources(getDb(c.env), user.id);
  const grants = sources?.effective ?? [];

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
 *
 * Both branches now resolve through `collectGrantSources`, so what this reports
 * is what the gates will actually allow. They did not before: the other-user
 * branch had its own copy of the query, which read only `user_app_permissions` —
 * so it omitted the committee rule, and would have omitted every appointment
 * grant too. A permissions screen that under-reports access is worse than no
 * screen, because it invites somebody to grant again what is already held.
 */
export async function listGrants(c: RbacContext, userId?: string): Promise<Grant[]> {
  const actor = c.get('user');

  if (!userId || userId === actor.id) {
    return isSuperadmin(c) ? allGrants() : withInheritance(await resolveGrants(c));
  }

  const db = getDb(c.env);
  const target = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.id, userId),
    columns: { id: true, isSuperadmin: true },
  });
  if (!target) return [];
  if (target.isSuperadmin) return allGrants();

  const sources = await collectGrantSources(db, target.id);
  return sources?.effective ?? [];
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
