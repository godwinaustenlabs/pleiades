import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';

const techRouter = new Hono<{ Bindings: Env }>();
techRouter.use('*', authMiddleware);
techRouter.use('*', requireAppAccess('tech'));

/* ── PROJECTS ── */
techRouter.get('/projects', async (c) => {
  try {
    const { status } = c.req.query();
    const rows = await getDb(c.env).query.projects.findMany({
      where: status ? eq(schema.projects.status, status) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
techRouter.post('/projects', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('proj');
    await db.insert(schema.projects).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'projects', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/projects/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.projects.findFirst({ where: eq(schema.projects.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/projects/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.projects).set(body).where(eq(schema.projects.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'projects', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/projects/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.projects).where(eq(schema.projects.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'projects', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── EPICS ── */
techRouter.get('/epics', async (c) => {
  try {
    const { project_id, status } = c.req.query();
    const rows = await getDb(c.env).query.epics.findMany({
      where: and(
        project_id ? eq(schema.epics.projectId, project_id) : undefined,
        status ? eq(schema.epics.status, status) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
techRouter.post('/epics', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('epic');
    await db.insert(schema.epics).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'epics', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/epics/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.epics.findFirst({ where: eq(schema.epics.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/epics/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.epics).set(body).where(eq(schema.epics.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'epics', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/epics/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.epics).where(eq(schema.epics.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'epics', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── STORIES ── */
techRouter.get('/stories', async (c) => {
  try {
    const { epic_id, status } = c.req.query();
    const rows = await getDb(c.env).query.stories.findMany({
      where: and(
        epic_id ? eq(schema.stories.epicId, epic_id) : undefined,
        status ? eq(schema.stories.status, status) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
techRouter.post('/stories', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('story');
    await db.insert(schema.stories).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'stories', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/stories/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.stories.findFirst({ where: eq(schema.stories.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/stories/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.stories).set(body).where(eq(schema.stories.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'stories', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/stories/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.stories).where(eq(schema.stories.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'stories', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── TASKS ── */
techRouter.get('/tasks', async (c) => {
  try {
    const { assignee, status, story_id, completed } = c.req.query();
    const rows = await getDb(c.env).query.tasks.findMany({
      where: and(
        assignee ? eq(schema.tasks.assignee, assignee) : undefined,
        status ? eq(schema.tasks.status, status) : undefined,
        story_id ? eq(schema.tasks.storyId, story_id) : undefined,
        completed !== undefined ? eq(schema.tasks.completed, completed === 'true') : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
techRouter.post('/tasks', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('task');
    await db.insert(schema.tasks).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'tasks', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/tasks/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.tasks.findFirst({ where: eq(schema.tasks.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/tasks/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.tasks).set(body).where(eq(schema.tasks.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'tasks', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/tasks/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'tasks', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── RELEASES ── */
techRouter.get('/releases', async (c) => {
  try {
    const { project_id, status } = c.req.query();
    const rows = await getDb(c.env).query.releases.findMany({
      where: and(
        project_id ? eq(schema.releases.projectId, project_id) : undefined,
        status ? eq(schema.releases.status, status) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
techRouter.post('/releases', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('rel');
    await db.insert(schema.releases).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'releases', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/releases/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.releases.findFirst({ where: eq(schema.releases.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/releases/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.releases).set(body).where(eq(schema.releases.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'releases', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/releases/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.releases).where(eq(schema.releases.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'releases', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── ENVIRONMENTS ── */
techRouter.get('/environments', async (c) => {
  try { return ok(c, await getDb(c.env).query.environments.findMany()); }
  catch (err) { return serverError(c, err); }
});
techRouter.post('/environments', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('env');
    await db.insert(schema.environments).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'environments', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/environments/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.environments.findFirst({ where: eq(schema.environments.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/environments/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.environments).set(body).where(eq(schema.environments.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'environments', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/environments/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.environments).where(eq(schema.environments.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'environments', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── DEPLOYMENTS ── */
techRouter.get('/deployments', async (c) => {
  try {
    const { project_id, env_id } = c.req.query();
    const rows = await getDb(c.env).query.deployments.findMany({
      where: and(
        project_id ? eq(schema.deployments.projectId, project_id) : undefined,
        env_id ? eq(schema.deployments.envId, env_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
techRouter.post('/deployments', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('dep');
    await db.insert(schema.deployments).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'deployments', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/deployments/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.deployments.findFirst({ where: eq(schema.deployments.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/deployments/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.deployments).set(body).where(eq(schema.deployments.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'deployments', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/deployments/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.deployments).where(eq(schema.deployments.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'deployments', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── ISSUES ── */
techRouter.get('/issues', async (c) => {
  try {
    const { project_id, severity, status } = c.req.query();
    const rows = await getDb(c.env).query.issues.findMany({
      where: and(
        project_id ? eq(schema.issues.projectId, project_id) : undefined,
        severity ? eq(schema.issues.severity, severity) : undefined,
        status ? eq(schema.issues.status, status) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
techRouter.post('/issues', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('issue');
    await db.insert(schema.issues).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'issues', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.get('/issues/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.issues.findFirst({ where: eq(schema.issues.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
techRouter.patch('/issues/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.issues).set(body).where(eq(schema.issues.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'issues', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
techRouter.delete('/issues/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.issues).where(eq(schema.issues.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'issues', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default techRouter;
