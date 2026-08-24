import { Context, Hono } from 'hono';
import { eq, desc, and, or } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { APP_FEATURES, checkFeaturePermission, requireAppAccess, requireFeatureAccess, requireSelfOrOwner } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';
import { chunk } from '../utils/batch';
import { hashPassword } from '../utils/password';


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

// ── ROLES ─────────────────────────────────────────────────────────────────────

adminRouter.get('/roles', requireFeatureAccess('admin', 'roles', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.roles.findMany()); }
  catch (err) { return serverError(c, err); }
});

adminRouter.post('/roles', requireFeatureAccess('admin', 'roles', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!;
    const { name } = await c.req.json<{ name: string }>();
    if (!name) return badRequest(c, 'name is required');
    const id = generateId('role');
    await db.insert(schema.roles).values({ id, name, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'roles', id, { name });
    return created(c, { id, name });
  } catch (err) { return serverError(c, err); }
});

adminRouter.patch('/roles/:id', requireFeatureAccess('admin', 'roles', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!;
    const id = c.req.param('id')!;
    if (!id) return badRequest(c, 'id is required');
    const body = await c.req.json();
    await db.update(schema.roles).set(body).where(eq(schema.roles.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'roles', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

adminRouter.delete('/roles/:id', requireFeatureAccess('admin', 'roles', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!; const id = c.req.param('id')!;
    if (!id) return badRequest(c, 'id is required');
    await db.delete(schema.roles).where(eq(schema.roles.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'roles', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

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

// ── ROLE GRANTS ────────────────────────────────────────────────────────────────
// Replaces the old /role-permissions and /role-hierarchy routes, which queried
// `role_permissions` and `role_hierarchy` — tables that were never deployed, so
// every one of those routes returned a 500. Role grants now live in
// role_app_permissions and are managed here.

adminRouter.get('/roles/:roleId/permissions', requireFeatureAccess('admin', 'permissions', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.roleAppPermissions.findMany({
      where: eq(schema.roleAppPermissions.roleId, c.req.param('roleId')!),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/**
 * PUT /admin/roles/:roleId/permissions
 * Replaces a role's entire grant set. Body: { permissions: [{ appName, feature,
 * canView, canEdit, canDelete }] }. Every user holding the role is affected.
 */
adminRouter.put('/roles/:roleId/permissions', requireFeatureAccess('admin', 'permissions', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const roleId = c.req.param('roleId')!;
    const { permissions } = await c.req.json<{ permissions: any[] }>();
    if (!Array.isArray(permissions)) return badRequest(c, 'permissions array required');

    const unknown = permissions.filter((p) => !APP_FEATURES[p.appName]?.includes(p.feature));
    if (unknown.length > 0) {
      return badRequest(c, `Unknown app/feature: ${unknown.map((p) => `${p.appName}/${p.feature}`).join(', ')}`);
    }

    await db.delete(schema.roleAppPermissions).where(eq(schema.roleAppPermissions.roleId, roleId));

    const now = new Date();
    const toInsert = permissions.map((p) => ({
      id: generateId('rap'),
      roleId,
      appName: p.appName,
      feature: p.feature,
      canView: p.canView ?? false,
      canEdit: p.canEdit ?? false,
      canDelete: p.canDelete ?? false,
      createdAt: now,
      updatedAt: now,
    }));
    for (const batch of chunk(toInsert, 5)) {
      if (batch.length > 0) await db.insert(schema.roleAppPermissions).values(batch as any);
    }

    await logAudit(c.env, user.id, 'UPDATE', 'role_app_permissions', roleId, { count: toInsert.length });
    return ok(c, { roleId, count: toInsert.length });
  } catch (err) { return serverError(c, err); }
});

// ── USERS (LOGINS) ────────────────────────────────────────────────────────────

adminRouter.get('/users', requireFeatureAccess('admin', 'users', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.usersLogins.findMany({
      with: { role: true, ownership: true },
      columns: { passwordHash: false },
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

adminRouter.get('/users/:id', requireFeatureAccess('admin', 'users', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, c.req.param('id')!),
      with: { role: true, ownership: true },
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
    delete body.passwordHash; delete body.password;
    await db.update(schema.usersLogins).set(body).where(eq(schema.usersLogins.id, id));
    await logAudit(c.env, actor.id, 'UPDATE', 'users_logins', id, body);
    return ok(c, { id });
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
      email: string; password: string; roleId: string; username?: string; employeeId?: string;
    }>();

    if (!body.email || !body.password || !body.roleId) {
      return badRequest(c, 'email, password, and roleId are required');
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

    const passwordHash = await hashPassword(body.password);
    const id = generateId('user');
    const now = new Date();

    await db.insert(schema.usersLogins).values({
      id,
      email: body.email.toLowerCase().trim(),
      passwordHash,
      roleId: body.roleId,
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

    await logAudit(c.env, actor.id, 'CREATE', 'users_logins', id, {
      email: body.email, roleId: body.roleId, provisioned_by: actor.id,
    });

    return created(c, { id, email: body.email, roleId: body.roleId, ownerUserId: actor.id });
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
        with: { role: true, ownership: true },
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
          with: { role: true },
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

adminRouter.get('/pending-resets', requireFeatureAccess('admin', 'resets', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user')!!;

    // This previously read user_app_access, a table with no rows in production,
    // so the "is an admin" branch below was unreachable for every caller.
    const isUserAdmin = await checkFeaturePermission(c, 'admin', 'users', 'edit');

    let pendingResets = await db.query.passwordResetTokens.findMany({
      where: eq(schema.passwordResetTokens.status, 'pending'),
      with: { user: { columns: { passwordHash: false }, with: { role: true } } },
      orderBy: [desc(schema.passwordResetTokens.requestedAt)],
    });

    if (!isUserAdmin) {
      const ownerships = await db.query.userOwnership.findMany({
        where: eq(schema.userOwnership.ownerUserId, actor.id),
      });
      const ownedUserIds = new Set(ownerships.map((o) => o.userId));
      pendingResets = pendingResets.filter((r) => ownedUserIds.has(r.userId));
    }

    const now = new Date();
    const expired = pendingResets.filter((r) => new Date(r.expiresAt) < now);
    if (expired.length > 0) {
      await Promise.all(expired.map((r) =>
        db.update(schema.passwordResetTokens)
          .set({ status: 'expired' })
          .where(eq(schema.passwordResetTokens.id, r.id))
      ));
    }

    return ok(c, pendingResets.filter((r) => new Date(r.expiresAt) >= now));
  } catch (err) { return serverError(c, err); }
});

adminRouter.post('/pending-resets/:tokenId/approve', requireFeatureAccess('admin', 'resets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const actor = c.get('user')!!;
    const tokenId = c.req.param('tokenId')!;

    const resetRecord = await db.query.passwordResetTokens.findFirst({
      where: eq(schema.passwordResetTokens.id, tokenId),
    });
    if (!resetRecord) return notFound(c);
    if (resetRecord.status !== 'pending') {
      return badRequest(c, `Token is already '${resetRecord.status}'`);
    }
    if (new Date(resetRecord.expiresAt) < new Date()) {
      await db.update(schema.passwordResetTokens).set({ status: 'expired' }).where(eq(schema.passwordResetTokens.id, tokenId));
      return badRequest(c, 'Token has expired');
    }

    // This previously read user_app_access, a table with no rows in production,
    // so the "is an admin" branch below was unreachable for every caller.
    const isUserAdmin = await checkFeaturePermission(c, 'admin', 'users', 'edit');

    if (!isUserAdmin) {
      const ownership = await db.query.userOwnership.findFirst({
        where: and(
          eq(schema.userOwnership.userId, resetRecord.userId),
          eq(schema.userOwnership.ownerUserId, actor.id),
        ),
      });
      if (!ownership) {
        return c.json({ error: 'Forbidden: you do not own this user account' }, 403);
      }
    }

    await db.update(schema.passwordResetTokens)
      .set({ status: 'approved', approvedByUserId: actor.id, approvedAt: new Date() })
      .where(eq(schema.passwordResetTokens.id, tokenId));

    await logAudit(c.env, actor.id, 'UPDATE', 'password_reset_tokens', tokenId, { action: 'reset_approved' });
    return ok(c, { tokenId, approved: true });
  } catch (err) { return serverError(c, err); }
});

adminRouter.post('/pending-resets/:tokenId/reject', requireFeatureAccess('admin', 'resets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const actor = c.get('user')!!;
    const tokenId = c.req.param('tokenId')!;

    const resetRecord = await db.query.passwordResetTokens.findFirst({
      where: eq(schema.passwordResetTokens.id, tokenId),
    });
    if (!resetRecord) return notFound(c);
    if (resetRecord.status !== 'pending') return badRequest(c, `Token is already '${resetRecord.status}'`);

    // This previously read user_app_access, a table with no rows in production,
    // so the "is an admin" branch below was unreachable for every caller.
    const isUserAdmin = await checkFeaturePermission(c, 'admin', 'users', 'edit');

    if (!isUserAdmin) {
      const ownership = await db.query.userOwnership.findFirst({
        where: and(
          eq(schema.userOwnership.userId, resetRecord.userId),
          eq(schema.userOwnership.ownerUserId, actor.id),
        ),
      });
      if (!ownership) return c.json({ error: 'Forbidden: you do not own this user account' }, 403);
    }

    await db.update(schema.passwordResetTokens)
      .set({ status: 'rejected' })
      .where(eq(schema.passwordResetTokens.id, tokenId));

    await logAudit(c.env, actor.id, 'UPDATE', 'password_reset_tokens', tokenId, { action: 'reset_rejected' });
    return ok(c, { tokenId, rejected: true });
  } catch (err) { return serverError(c, err); }
});

// ── API KEYS ───────────────────────────────────────────────────────────────────

adminRouter.get('/api-keys', requireFeatureAccess('admin', 'api_keys', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.apiKeys.findMany({ with: { role: true } });
    return ok(c, rows.map(({ keyHash: _, ...r }) => r));
  } catch (err) { return serverError(c, err); }
});

adminRouter.post('/api-keys', requireFeatureAccess('admin', 'api_keys', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user')!!;
    const { ownerName, roleId } = await c.req.json<{ ownerName: string; roleId: string }>();
    if (!ownerName || !roleId) return badRequest(c, 'ownerName and roleId required');
    const rawKey = generateId('sk');
    const keyHash = await sha256hex(rawKey);
    const id = generateId('ak');
    await db.insert(schema.apiKeys).values({ id, keyHash, ownerName, roleId, isActive: true, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'api_keys', id, { ownerName, roleId });
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
