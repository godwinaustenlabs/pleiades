import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { ok, serverError, notFound, created } from '../utils/response';
import { generateId } from '../utils/id';

const notificationsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
notificationsRouter.use('*', authMiddleware);

// GET /notifications
notificationsRouter.get('/', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);
    const list = await db.query.userNotifications.findMany({
      where: eq(schema.userNotifications.userId, user.id),
      orderBy: [desc(schema.userNotifications.createdAt)],
    });
    return ok(c, list);
  } catch (err) { return serverError(c, err); }
});

// DELETE /notifications (Clear all)
notificationsRouter.delete('/', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);
    await db.delete(schema.userNotifications).where(eq(schema.userNotifications.userId, user.id));
    return ok(c, { cleared: true });
  } catch (err) { return serverError(c, err); }
});

// PATCH /notifications/:id/read
notificationsRouter.patch('/:id/read', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);
    const id = c.req.param('id');
    await db.update(schema.userNotifications)
      .set({ isRead: true })
      .where(and(eq(schema.userNotifications.id, id), eq(schema.userNotifications.userId, user.id)));
    return ok(c, { id, read: true });
  } catch (err) { return serverError(c, err); }
});

// POST /notifications/send (Broadcast or direct)
notificationsRouter.post('/send', async (c) => {
  try {
    const db = getDb(c.env);
    const { userId, title, message, type, link } = await c.req.json();
    const id = generateId('ntf');
    
    await db.insert(schema.userNotifications).values({
      id,
      userId,
      title,
      message,
      type: type || 'system',
      link: link || null,
      createdAt: new Date(),
    });
    
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

export default notificationsRouter;
