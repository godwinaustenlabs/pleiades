import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { requireFeatureAccess, APP_FEATURES } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { ok, created, notFound, serverError, badRequest } from '../utils/response';
import { chunk } from '../utils/batch';

const permissionsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

permissionsRouter.use('*', authMiddleware);

// GET /permissions/app-features
permissionsRouter.get('/app-features', (c) => {
  return ok(c, APP_FEATURES);
});

// GET /permissions/user/:userId
permissionsRouter.get('/user/:userId', async (c) => {
  try {
    const db = getDb(c.env);
    const userId = c.req.param('userId');

    const perms = await db.query.userAppPermissions.findMany({
      where: eq(schema.userAppPermissions.userId, userId),
    });

    const inheritedPerms = perms.map(p => ({
      ...p,
      canEdit: p.canEdit === true || p.canDelete === true,
      canView: p.canView === true || p.canEdit === true || p.canDelete === true,
    }));

    return ok(c, inheritedPerms);
  } catch (err) {
    return serverError(c, err);
  }
});

// PUT /permissions/user/:userId
// Bulk update permissions for a user
permissionsRouter.put('/user/:userId', requireFeatureAccess('hr', 'appointments', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const userId = c.req.param('userId');
    if (!userId) return badRequest(c, 'userId param required');

    const { permissions } = await c.req.json<{ permissions: any[] }>();

    if (!Array.isArray(permissions)) {
      return c.json({ success: false, error: 'permissions array required' }, 400);
    }

    // 1. Delete existing permissions for this user
    await db.delete(schema.userAppPermissions).where(eq(schema.userAppPermissions.userId, userId!));

    // 2. Insert new permissions
    const toInsert = permissions.map(p => ({
      id: generateId('perm'),
      userId: userId!,
      appName: p.appName,
      feature: p.feature,
      canView: p.canView ?? false,
      canEdit: p.canEdit ?? false,
      canDelete: p.canDelete ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (toInsert.length > 0) {
      const batches = chunk(toInsert, 5);
      for (const b of batches) {
        await db.insert(schema.userAppPermissions).values(b as any);
      }
    }

    return ok(c, { success: true, count: toInsert.length });
  } catch (err) {
    return serverError(c, err);
  }
});

export default permissionsRouter;

