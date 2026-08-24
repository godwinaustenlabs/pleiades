import { Hono } from 'hono';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { APP_FEATURES, checkFeaturePermission, listGrants } from '../middleware/rbac';
import { ok, forbidden, serverError } from '../utils/response';

const permissionsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

permissionsRouter.use('*', authMiddleware);

// GET /permissions/app-features
permissionsRouter.get('/app-features', (c) => {
  return ok(c, APP_FEATURES);
});

/**
 * GET /permissions/me
 * The caller's own effective grants, derived from their role.
 */
permissionsRouter.get('/me', async (c) => {
  try {
    return ok(c, await listGrants(c));
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * GET /permissions/user/:userId
 *
 * Effective grants for a user, derived from their role. Kept at this path (and
 * in this response shape) because the web app reads it in several places.
 *
 * Previously this route had NO authorization check at all, so any authenticated
 * user could read anyone else's permissions. Reading another user's grants now
 * requires the ability to administer users.
 */
permissionsRouter.get('/user/:userId', async (c) => {
  try {
    const actor = c.get('user');
    const userId = c.req.param('userId');

    if (actor.id !== userId) {
      const canAdminister =
        (await checkFeaturePermission(c, 'admin', 'users', 'view')) ||
        (await checkFeaturePermission(c, 'hr', 'employees', 'view'));
      if (!canAdminister) return forbidden(c, "Forbidden: cannot read another user's permissions");
    }

    return ok(c, await listGrants(c, userId));
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * NOTE: `PUT /permissions/user/:userId` was removed.
 *
 * It granted arbitrary per-user permissions while being gated on
 * hr/appointments/edit, which let anyone able to edit an HR appointment rewrite
 * any user's permissions — including their own — to every app. Nothing in the
 * web app called it.
 *
 * Permissions are per user again, but editing them is an admin capability, not
 * an HR one: use `PUT /api/admin/users/:id/permissions`, gated on
 * admin/permissions edit.
 */

export default permissionsRouter;
