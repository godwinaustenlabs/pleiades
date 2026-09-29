import { Context, Hono, type MiddlewareHandler } from 'hono';
import { eq, desc, and, ne, or } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { APP_FEATURES, checkFeaturePermission, describeGrants, requireAppAccess, requireFeatureAccess, requireSelfOrOwner } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';
import { chunk } from '../utils/batch';
import { hashPassword } from '../utils/password';
import { validateRecoveryAddress } from '../email/password-reset';


const adminRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
adminRouter.use('*', authMiddleware);
// The admin surface was previously gated on the `hr` module, which meant any user
// with HR view could administer roles, users and API keys. It is now gated on a
// dedicated `admin` module, with per-feature levels on each route below.
adminRouter.use('*', requireAppAccess('admin'));

// ── Shared helper ─────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── PERMISSIONS ────────────────────────────────────────────────────────────────

adminRouter.get('/permissions', requireFeatureAccess('admin', 'permissions', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.permissions.findMany()); }
  catch (err) { return serverError(c, err); }
});

adminRouter.post('/permissions', requireFeatureAccess('admin', 'permissions', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!;
    const { name } = await c.req.json<{ name: string }>();
    if (!name) return badRequest(c, 'name is required');
    const id = generateId('perm');
    await db.insert(schema.permissions).values({ id, name, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'permissions', id, { name });
    return created(c, { id, name });
  } catch (err) { return serverError(c, err); }
});

adminRouter.delete('/permissions/:id', requireFeatureAccess('admin', 'permissions', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!; const id = c.req.param('id')!;
    if (!id) return badRequest(c, 'id is required');
    await db.delete(schema.permissions).where(eq(schema.permissions.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'permissions', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

// ── GRANTS ────────────────────────────────────────────────────────────────────
//
// Two tables, unioned, and the choice between them is the whole model:
//
//   appointment_app_permissions  access that belongs to a POST. Handing the post
//     to somebody else moves it, in one edit, for both people. Normally the right
//     place for anything that goes with a job title.
//   user_app_permissions         access that belongs to a PERSON regardless of
//     post, and the only option for a login with no employee record.
//
// Neither overrides the other — `satisfies` sees the OR of both — so there is no
// precedence rule to get wrong, and no group that widening could widen by
// accident: an appointment is held by one person at a time.
//
// Both editors are gated on `admin/permissions` edit and NOT on anything in HR.
// Assigning somebody to a post is an HR authority; deciding what the post may
// reach is not. `PUT /api/permissions/user/:id` was deleted once for being gated
// on `hr/appointments` edit, and putting the appointment editor behind that same
// grant would have reinstated the escalation under a new name.

/** Shared by both editors: a grant naming something outside APP_FEATURES can never be satisfied. */
function unknownFeatures(grants: { appName: string; feature: string }[]): string[] {
  return grants
    .filter((p) => !APP_FEATURES[p.appName]?.includes(p.feature))
    .map((p) => `${p.appName}/${p.feature}`);
}

adminRouter.get('/users/:id/permissions', requireFeatureAccess('admin', 'permissions', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.userAppPermissions.findMany({
      where: eq(schema.userAppPermissions.userId, c.req.param('id')!),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/**
 * PUT /admin/users/:id/permissions
 *
 * Replaces one user's entire grant set. Body: { permissions: [{ appName,
 * feature, canView, canEdit, canDelete }] }. Delete-then-insert rather than a
 * merge, so unticking a box actually removes the grant.
 */
adminRouter.put('/users/:id/permissions', requireFeatureAccess('admin', 'permissions', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user');
    const userId = c.req.param('id')!;
    const { permissions } = await c.req.json<{ permissions: any[] }>();
    if (!Array.isArray(permissions)) return badRequest(c, 'permissions array required');

    const target = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, userId),
      columns: { id: true, isSuperadmin: true },
    });
    if (!target) return notFound(c, 'User not found');

    // APP_FEATURES is the source of truth for what exists. A grant naming
    // something outside it can never be satisfied by getPerm(), so it would sit
    // in the table looking like access that silently does nothing.
    const unknown = unknownFeatures(permissions);
    if (unknown.length > 0) return badRequest(c, `Unknown app/feature: ${unknown.join(', ')}`);

    await db.delete(schema.userAppPermissions).where(eq(schema.userAppPermissions.userId, userId));

    const now = new Date();
    // A grant that carries no level at all is just a row that does nothing.
    const toInsert = permissions
      .filter((p) => p.canView || p.canEdit || p.canDelete)
      .map((p) => ({
        id: generateId('uap'),
        userId,
        appName: p.appName,
        feature: p.feature,
        canView: p.canView ?? false,
        canEdit: p.canEdit ?? false,
        canDelete: p.canDelete ?? false,
        createdAt: now,
        updatedAt: now,
      }));
    for (const batch of chunk(toInsert, 5)) {
      if (batch.length > 0) await db.insert(schema.userAppPermissions).values(batch as any);
    }

    await logAudit(c.env, actor.id, 'UPDATE', 'user_app_permissions', userId, { count: toInsert.length });
    return ok(c, { userId, count: toInsert.length, isSuperadmin: !!target.isSuperadmin });
  } catch (err) { return serverError(c, err); }
});

// ── APPOINTMENT GRANTS ────────────────────────────────────────────────────────

/**
 * Either grant opens the appointment list.
 *
 * The Posts editor needs it (admin/permissions) and so does the mailbox editor, to
 * attach an address to a post (admin/mailboxes). Gated on permissions alone, a
 * mailbox administrator got a 403 and the appointment picker rendered empty — which
 * looks like "there are no appointments" rather than "you cannot see them".
 */
const canListAppointments: MiddlewareHandler = async (rawCtx, next) => {
  const c = rawCtx as Parameters<typeof checkFeaturePermission>[0];
  if (await checkFeaturePermission(c, 'admin', 'permissions', 'view')) return await next();
  if (await checkFeaturePermission(c, 'admin', 'mailboxes', 'view')) return await next();
  return c.json({ error: 'Forbidden: needs admin/permissions or admin/mailboxes' }, 403);
};

adminRouter.get('/appointments', canListAppointments, async (c) => {
  try {
    /**
     * Every appointment, with its holder, for the access editor's picker.
     *
     * Here rather than reusing `GET /hr/appointments` because the two answer to
     * different grants: administering access must not require HR access, and
     * requiring both would mean nobody could edit an appointment's permissions
     * without also being able to read the payroll.
     */
    const rows = await getDb(c.env).query.appointments.findMany({
      with: { employee: { columns: { id: true, name: true, department: true } } },
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

adminRouter.get('/appointments/:id/permissions', requireFeatureAccess('admin', 'permissions', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.appointmentAppPermissions.findMany({
      where: eq(schema.appointmentAppPermissions.appointmentId, c.req.param('id')!),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/**
 * PUT /admin/appointments/:id/permissions
 *
 * Replaces one appointment's entire grant set. Body: { permissions: [{ appName,
 * feature, canView, canEdit, canDelete }] }. Delete-then-insert, so unticking a
 * box actually removes the grant.
 *
 * Saving this changes what the CURRENT HOLDER can reach, on their next request —
 * grants are read per request, so there is no token to expire first. It also
 * changes what every future holder can reach, which is the point of editing the
 * post rather than the person.
 */
adminRouter.put('/appointments/:id/permissions', requireFeatureAccess('admin', 'permissions', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user');
    const appointmentId = c.req.param('id')!;
    const { permissions } = await c.req.json<{ permissions: any[] }>();
    if (!Array.isArray(permissions)) return badRequest(c, 'permissions array required');

    const appointment = await db.query.appointments.findFirst({
      where: eq(schema.appointments.id, appointmentId),
      columns: { id: true, roleOrTitle: true, employeeId: true, isActive: true },
    });
    if (!appointment) return notFound(c, 'Appointment not found');

    const unknown = unknownFeatures(permissions);
    if (unknown.length > 0) return badRequest(c, `Unknown app/feature: ${unknown.join(', ')}`);

    await db.delete(schema.appointmentAppPermissions)
      .where(eq(schema.appointmentAppPermissions.appointmentId, appointmentId));

    const now = new Date();
    const toInsert = permissions
      .filter((p) => p.canView || p.canEdit || p.canDelete)
      .map((p) => ({
        id: generateId('aap'),
        appointmentId,
        appName: p.appName,
        feature: p.feature,
        canView: p.canView ?? false,
        canEdit: p.canEdit ?? false,
        canDelete: p.canDelete ?? false,
        createdAt: now,
        updatedAt: now,
      }));
    for (const batch of chunk(toInsert, 5)) {
      if (batch.length > 0) await db.insert(schema.appointmentAppPermissions).values(batch as any);
    }

    await logAudit(c.env, actor.id, 'UPDATE', 'appointment_app_permissions', appointmentId, {
      count: toInsert.length,
      roleOrTitle: appointment.roleOrTitle ?? null,
      // Who this took effect for immediately. An access change that is invisible
      // in the audit log because it was addressed to a post rather than a person
      // is the one thing appointment-level grants could have made worse.
      holder: appointment.employeeId ?? null,
      appliesNow: appointment.isActive === true,
    });
    return ok(c, { appointmentId, count: toInsert.length, holder: appointment.employeeId ?? null });
  } catch (err) { return serverError(c, err); }
});

/**
 * GET /admin/users/:id/effective-permissions
 *
 * What this person can actually reach, and where each grant came from: their own
 * rows, one entry per active appointment they hold, and whether the committee rule
 * contributed. Read-only.
 *
 * It exists because the union is not guessable from either editor on its own. The
 * permission matrix for a person shows their direct grants; without this, a
 * ticked box missing from it looks like access they do not have, and somebody
 * grants it again — directly, to the person, which is precisely the per-person
 * sprawl the appointment table is meant to prevent.
 */
adminRouter.get('/users/:id/effective-permissions', requireFeatureAccess('admin', 'permissions', 'view'), async (c) => {
  try {
    const sources = await describeGrants(c.env, c.req.param('id')!);
    if (!sources) return notFound(c, 'User not found');
    return ok(c, sources);
  } catch (err) { return serverError(c, err); }
});

// ── USERS (LOGINS) ────────────────────────────────────────────────────────────

adminRouter.get('/users', requireFeatureAccess('admin', 'users', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.usersLogins.findMany({
      with: { ownership: true, permissions: true },
      columns: { passwordHash: false },
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

adminRouter.get('/users/:id', requireFeatureAccess('admin', 'users', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, c.req.param('id')!),
      with: { ownership: true, permissions: true },
      columns: { passwordHash: false },
    });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

adminRouter.patch('/users/:id', requireFeatureAccess('admin', 'users', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const actor = c.get('user')!!;
    const body = await c.req.json(); const id = c.req.param('id')!;

    // An allowlist, not a denylist.
    //
    // This spread the whole body into the update behind two `delete`s, which
    // meant `is_superadmin` was settable through the API — so anybody granted
    // admin/users edit could PATCH themselves superadmin and bypass every
    // permission check in the system. CLAUDE.md states that flag is set only by
    // direct database access, and this is the route that made that untrue.
    //
    // A denylist cannot hold: the failure mode of forgetting an entry is silent
    // and it is exactly what happened here, twice over — `recovery_email`, added
    // for password reset, would have been writable the moment the column existed.
    const ALLOWED = ['name', 'email', 'username', 'phone', 'employeeId', 'isActive', 'recoveryEmail'] as const;
    const patch: Record<string, unknown> = {};
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(body)) {
      if ((ALLOWED as readonly string[]).includes(key)) patch[key] = value;
      else rejected.push(key);
    }

    // A recovery address on a domain this system hosts the mail for would mean a
    // locked-out person has to log in to read the email that lets them log in.
    if (typeof patch.recoveryEmail === 'string' && patch.recoveryEmail !== '') {
      const problem = validateRecoveryAddress(patch.recoveryEmail);
      if (problem) return badRequest(c, problem);
    }
    if (patch.recoveryEmail === '') patch.recoveryEmail = null;

    /**
     * Whose recovery address is being changed matters.
     *
     * A recovery address decides where a reset link is delivered, so writing one
     * on somebody else's account is the first step of taking it over. On a
     * superadmin that is the whole game — see the note in
     * src/email/password-reset.ts for the four-step chain. Refused here as well as
     * there, because two independent checks are what makes the chain stay broken
     * when one of them is later refactored.
     */
    const target = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, id),
      columns: { isSuperadmin: true, recoveryEmail: true, employeeId: true },
    });
    if (!target) return notFound(c);
    if ('recoveryEmail' in patch && target.isSuperadmin && id !== actor.id) {
      return c.json({
        success: false,
        error: "A superadmin's recovery address can only be changed by that account itself. It decides where a password reset is delivered.",
      }, 403);
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(c, `Nothing to change. This route accepts: ${ALLOWED.join(', ')}.`);
    }

    /**
     * Relinking a login to an employee is an ACCESS change, not a label change: it
     * decides which appointments apply, and therefore what this account can reach.
     *
     * Two guards. There is one login per person — the database enforces it — so a
     * collision is reported rather than surfaced as a constraint error nobody can
     * act on. And the previous value goes in the audit entry, because without it a
     * relink that was later reverted leaves no record of which posts this account
     * was collecting in between.
     */
    if ('employeeId' in patch) {
      const next = (patch.employeeId as string | null) || null;
      patch.employeeId = next;
      if (next) {
        const clash = await db.query.usersLogins.findFirst({
          where: and(eq(schema.usersLogins.employeeId, next), ne(schema.usersLogins.id, id)),
          columns: { email: true },
        });
        if (clash) {
          return badRequest(c, `${clash.email} is already the account for that employee. There is one login per person.`);
        }
      }
    }

    await db.update(schema.usersLogins).set(patch).where(eq(schema.usersLogins.id, id));
    // Rejected keys are recorded rather than ignored: an attempt to set
    // is_superadmin through here is worth being able to find later. So is the
    // PREVIOUS recovery address — without it, a redirect that was later reverted
    // leaves no trace of where the reset mail went in between.
    await logAudit(c.env, actor.id, 'UPDATE', 'users_logins', id, {
      ...patch,
      ...('recoveryEmail' in patch ? { previousRecoveryEmail: target.recoveryEmail ?? null } : {}),
      ...('employeeId' in patch ? { previousEmployeeId: target.employeeId ?? null } : {}),
      ...(rejected.length ? { rejectedFields: rejected } : {}),
    });
    return ok(c, { id, ...(rejected.length ? { ignored: rejected } : {}) });
  } catch (err) { return serverError(c, err); }
});

adminRouter.delete('/users/:id', requireFeatureAccess('admin', 'users', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const actor = c.get('user')!!; const id = c.req.param('id')!;
    await db.delete(schema.usersLogins).where(eq(schema.usersLogins.id, id));
    await logAudit(c.env, actor.id, 'DELETE', 'users_logins', id);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

// ── HR-GATED USER PROVISIONING ────────────────────────────────────────────────

adminRouter.post('/users/provision', requireFeatureAccess('admin', 'users', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user')!!;
    const body = await c.req.json<{
      email: string; password: string; username?: string; employeeId?: string;
      permissions?: { appName: string; feature: string; canView?: boolean; canEdit?: boolean; canDelete?: boolean }[];
    }>();

    if (!body.email || !body.password) {
      return badRequest(c, 'email and password are required');
    }

    // A new account starts with no access at all unless permissions are given
    // here. Nothing is implied by job title or by anything else on the request.
    const requested = Array.isArray(body.permissions) ? body.permissions : [];
    const unknown = requested.filter((g) => !APP_FEATURES[g.appName]?.includes(g.feature));
    if (unknown.length > 0) {
      return badRequest(c, `Unknown app/feature: ${unknown.map((g) => `${g.appName}/${g.feature}`).join(', ')}`);
    }
    if (body.password.length < 8) return badRequest(c, 'Password must be at least 8 characters');

    // This previously read user_app_access, a table with no rows in production,
    // so the "is an admin" branch below was unreachable for every caller.
    const isUserAdmin = await checkFeaturePermission(c, 'admin', 'users', 'edit');


    const email = body.email.toLowerCase().trim();
    const username = body.username?.toLowerCase().trim();

    const existing = await db.query.usersLogins.findFirst({
      where: or(
        eq(schema.usersLogins.email, email),
        username ? eq(schema.usersLogins.username, username) : undefined
      ),
    });
    if (existing) {
      if (existing.email === email) return badRequest(c, 'An account with this email already exists');
      if (username && existing.username === username) return badRequest(c, 'An account with this username already exists');
    }

    // One login per person. Checked here rather than left to the unique index, so the
    // answer names the account that already exists instead of being a 500. For a
    // staff member, POST /api/hr/employees/:id/account is the route that knows how
    // to update the one they have.
    if (body.employeeId) {
      const taken = await db.query.usersLogins.findFirst({
        where: eq(schema.usersLogins.employeeId, body.employeeId),
        columns: { email: true },
      });
      if (taken) {
        return badRequest(c, `${taken.email} is already the account for that employee. There is one login per person — amend that one instead.`);
      }
    }

    const passwordHash = await hashPassword(body.password);
    const id = generateId('user');
    const now = new Date();

    await db.insert(schema.usersLogins).values({
      id,
      email: body.email.toLowerCase().trim(),
      passwordHash,
      employeeId: body.employeeId ?? null,
      isActive: true,
      createdAt: now,
      createdByUserId: actor.id,
      failedAttempts: 0,
    });

    await db.insert(schema.userOwnership).values({
      userId: id,
      ownerUserId: actor.id,
      assignedAt: now,
      assignedByUserId: actor.id,
    });

    const grants = requested
      .filter((g) => g.canView || g.canEdit || g.canDelete)
      .map((g) => ({
        id: generateId('uap'),
        userId: id,
        appName: g.appName,
        feature: g.feature,
        canView: g.canView ?? false,
        canEdit: g.canEdit ?? false,
        canDelete: g.canDelete ?? false,
        createdAt: now,
        updatedAt: now,
      }));
    for (const batch of chunk(grants, 5)) {
      if (batch.length > 0) await db.insert(schema.userAppPermissions).values(batch as any);
    }

    await logAudit(c.env, actor.id, 'CREATE', 'users_logins', id, {
      email: body.email, grants: grants.length, provisioned_by: actor.id,
    });

    return created(c, { id, email: body.email, grants: grants.length, ownerUserId: actor.id });
  } catch (err) { return serverError(c, err); }
});

adminRouter.get('/users/my-team', requireFeatureAccess('admin', 'users', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user')!!;
    // This previously read user_app_access, a table with no rows in production,
    // so the "is an admin" branch below was unreachable for every caller.
    const isUserAdmin = await checkFeaturePermission(c, 'admin', 'users', 'edit');

    if (isUserAdmin) {
      const rows = await db.query.usersLogins.findMany({
        with: { ownership: true, permissions: true },
        columns: { passwordHash: false },
      });
      return ok(c, rows);
    }

    const ownerships = await db.query.userOwnership.findMany({
      where: eq(schema.userOwnership.ownerUserId, actor.id),
    });
    const userIds = ownerships.map((o) => o.userId);
    if (userIds.length === 0) return ok(c, []);

    const rows = await Promise.all(
      userIds.map((uid) =>
        db.query.usersLogins.findFirst({
          where: eq(schema.usersLogins.id, uid),
          with: { permissions: true },
          columns: { passwordHash: false },
        })
      )
    );

    return ok(c, rows.filter(Boolean));
  } catch (err) { return serverError(c, err); }
});

adminRouter.post('/users/:id/reassign-owner', requireFeatureAccess('admin', 'users', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const actor = c.get('user')!!;
    const userId = c.req.param('id')!;
    const { newOwnerUserId } = await c.req.json<{ newOwnerUserId: string }>();
    if (!newOwnerUserId) return badRequest(c, 'newOwnerUserId is required');

    await db.update(schema.userOwnership)
      .set({ ownerUserId: newOwnerUserId, assignedByUserId: actor.id, assignedAt: new Date() })
      .where(eq(schema.userOwnership.userId, userId));

    await logAudit(c.env, actor.id, 'UPDATE', 'user_ownership', userId, { newOwnerUserId });
    return ok(c, { userId, newOwnerUserId });
  } catch (err) { return serverError(c, err); }
});

// ── DIRECT PASSWORD RESET ──────────────────────────────────

adminRouter.post(
  '/users/:id/reset-password',
  requireSelfOrOwner((c) => c.req.param('id')!),
  async (c) => {
    try {
      const db = getDb(c.env); const actor = c.get('user')!!;
      const { password } = await c.req.json<{ password: string }>();
      if (!password) return badRequest(c, 'password required');
      if (password.length < 8) return badRequest(c, 'Password must be at least 8 characters');
      const id = c.req.param('id')!;
      const passwordHash = await hashPassword(password);
      await db.update(schema.usersLogins)
        .set({ passwordHash, passwordUpdatedAt: new Date(), failedAttempts: 0, lockedUntil: null })
        .where(eq(schema.usersLogins.id, id));
      await logAudit(c.env, actor.id, 'UPDATE', 'users_logins', id, { action: 'direct_password_reset' });
      return ok(c, { id, reset: true });
    } catch (err) { return serverError(c, err); }
  }
);

// ── DELEGATED RESET APPROVAL ──────────────────────────────────────────────────

/**
 * The manual reset-approval queue used to live here — GET /pending-resets and
 * POST /pending-resets/:id/{approve,reject}, gated on `admin/resets` or `hr/resets`.
 *
 * It is gone, and reset is self-service: POST /auth/request-reset mints a link and
 * emails it. The queue meant somebody locked out at 9pm stayed locked out until a
 * colleague noticed a list, which is a worse failure than the one approval prevented.
 *
 * What approval DID protect against was an unauthenticated stranger causing mail to be
 * sent, and that is replaced in src/email/password-reset.ts by a per-account rate
 * limit plus each request superseding the previous token. Read the note there before
 * changing either: removing approval also SHORTENED the escalation path to superadmin
 * from two grants to one, which is why the superadmin guard there and the
 * recovery-address guard below are load-bearing rather than belt-and-braces.
 */


// ── API KEYS ───────────────────────────────────────────────────────────────────

adminRouter.get('/api-keys', requireFeatureAccess('admin', 'api_keys', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.apiKeys.findMany({ with: { user: { columns: { passwordHash: false } } } });
    return ok(c, rows.map(({ keyHash: _, ...r }) => r));
  } catch (err) { return serverError(c, err); }
});

adminRouter.post('/api-keys', requireFeatureAccess('admin', 'api_keys', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!;
    // An agent has no permissions of its own: it names the user it acts as and
    // inherits exactly that person's grants, so revoking their access revokes
    // the agent's too.
    const { ownerName, userId } = await c.req.json<{ ownerName: string; userId: string }>();
    if (!ownerName || !userId) return badRequest(c, 'ownerName and userId required');
    const actsAs = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, userId),
      columns: { id: true },
    });
    if (!actsAs) return badRequest(c, 'userId does not name a known user');
    const rawKey = generateId('sk');
    const keyHash = await sha256hex(rawKey);
    const id = generateId('ak');
    await db.insert(schema.apiKeys).values({ id, keyHash, ownerName, userId, isActive: true, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'api_keys', id, { ownerName, userId });
    return created(c, { id, ownerName, rawKey });
  } catch (err) { return serverError(c, err); }
});

adminRouter.delete('/api-keys/:id', requireFeatureAccess('admin', 'api_keys', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!; const id = c.req.param('id')!;
    await db.update(schema.apiKeys).set({ isActive: false }).where(eq(schema.apiKeys.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'api_keys', id);
    return ok(c, { id, status: 'revoked' });
  } catch (err) { return serverError(c, err); }
});

// ── AUDIT LOGS ─────────────────────────────────────────────────────────────────

adminRouter.get('/audit-logs', requireFeatureAccess('admin', 'audit_logs', 'view'), async (c) => {
  try {
    const { table_name, user_id, action } = c.req.query();
    const rows = await getDb(c.env).query.auditLogs.findMany({
      orderBy: [desc(schema.auditLogs.timestamp)],
    });
    const filtered = rows.filter(r => {
      if (user_id && r.userId !== user_id) return false;
      if (action && r.action !== action) return false;
      if (table_name && r.tableName !== table_name) return false;
      return true;
    });
    return ok(c, filtered);
  } catch (err) { return serverError(c, err); }
});

export default adminRouter;
