import { Hono } from 'hono';
import { eq, or, and } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../utils/id';
import { ok, created, serverError } from '../utils/response';

const messagesRouter = new Hono<{ Bindings: Env }>();
messagesRouter.use('*', authMiddleware);

messagesRouter.get('/', async (c) => {
  try {
    const { app } = c.req.query();
    const rows = await getDb(c.env).query.appMessages.findMany({
      where: app ? or(eq(schema.appMessages.targetApp, app), eq(schema.appMessages.targetApp, 'all')) : undefined,
      orderBy: (m, { desc }) => [desc(m.createdAt)]
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

messagesRouter.post('/', async (c) => {
  try {
    const user = c.get('user' as any);
    const body = await c.req.json();
    const id = generateId('msg');
    await getDb(c.env).insert(schema.appMessages).values({
      ...body,
      id,
      senderId: user.id,
      createdAt: new Date()
    });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

messagesRouter.patch('/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id');
    await getDb(c.env).update(schema.appMessages)
      .set({ isResolved: true })
      .where(eq(schema.appMessages.id, id));
    return ok(c, { id, resolved: true });
  } catch (err) { return serverError(c, err); }
});

messagesRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await getDb(c.env).delete(schema.appMessages)
      .where(eq(schema.appMessages.id, id));
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default messagesRouter;
