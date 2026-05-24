import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';

const acquisitionRouter = new Hono<{ Bindings: Env }>();
acquisitionRouter.use('*', authMiddleware);
acquisitionRouter.use('*', requireAppAccess('acquisition'));

/* ── CAMPAIGNS ── */
acquisitionRouter.get('/campaigns', async (c) => {
  try {
    const { status } = c.req.query();
    const rows = await getDb(c.env).query.campaigns.findMany({
      where: status ? eq(schema.campaigns.status, status) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/campaigns', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('camp');
    await db.insert(schema.campaigns).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'campaigns', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/campaigns/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.campaigns.findFirst({ where: eq(schema.campaigns.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/campaigns/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.campaigns).set(body).where(eq(schema.campaigns.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'campaigns', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/campaigns/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'campaigns', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CONTACTS & LEADS ── */
acquisitionRouter.get('/contacts', async (c) => {
  try {
    const { stage, owner } = c.req.query();
    const rows = await getDb(c.env).query.contactsLeads.findMany({
      where: and(
        stage ? eq(schema.contactsLeads.pipelineStage, stage) : undefined,
        owner ? eq(schema.contactsLeads.contactOwner, owner) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/contacts', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('lead');
    await db.insert(schema.contactsLeads).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'contacts_leads', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/contacts/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.contactsLeads.findFirst({ where: eq(schema.contactsLeads.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/contacts/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.contactsLeads).set(body).where(eq(schema.contactsLeads.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'contacts_leads', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/contacts/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.contactsLeads).where(eq(schema.contactsLeads.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'contacts_leads', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── LEADS ACTIVITY ── */
acquisitionRouter.get('/activity', async (c) => {
  try {
    const { contact_id } = c.req.query();
    const rows = await getDb(c.env).query.leadsActivity.findMany({
      where: contact_id ? eq(schema.leadsActivity.contactId, contact_id) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/activity', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('act');
    await db.insert(schema.leadsActivity).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'leads_activity', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/activity/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.leadsActivity.findFirst({ where: eq(schema.leadsActivity.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/activity/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.leadsActivity).set(body).where(eq(schema.leadsActivity.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'leads_activity', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/activity/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.leadsActivity).where(eq(schema.leadsActivity.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'leads_activity', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── FUNNELS & PIPELINES ── */
acquisitionRouter.get('/funnels', async (c) => {
  try { return ok(c, await getDb(c.env).query.funnelsPipelines.findMany()); }
  catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/funnels', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('fun');
    if (typeof body.stages === 'string') {
      try { body.stages = JSON.parse(body.stages); } catch {}
    }
    await db.insert(schema.funnelsPipelines).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'funnels_pipelines', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/funnels/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.funnelsPipelines.findFirst({ where: eq(schema.funnelsPipelines.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/funnels/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    if (typeof body.stages === 'string') {
      try { body.stages = JSON.parse(body.stages); } catch {}
    }
    await db.update(schema.funnelsPipelines).set(body).where(eq(schema.funnelsPipelines.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'funnels_pipelines', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/funnels/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.funnelsPipelines).where(eq(schema.funnelsPipelines.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'funnels_pipelines', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CONTENT CALENDAR ── */
acquisitionRouter.get('/content', async (c) => {
  try {
    const { status, campaign_id } = c.req.query();
    const rows = await getDb(c.env).query.contentCalendar.findMany({
      where: and(
        status ? eq(schema.contentCalendar.status, status) : undefined,
        campaign_id ? eq(schema.contentCalendar.campaignId, campaign_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/content', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('cnt');
    await db.insert(schema.contentCalendar).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'content_calendar', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/content/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.contentCalendar.findFirst({ where: eq(schema.contentCalendar.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/content/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.contentCalendar).set(body).where(eq(schema.contentCalendar.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'content_calendar', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/content/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.contentCalendar).where(eq(schema.contentCalendar.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'content_calendar', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── SPRINTS ── */
acquisitionRouter.get('/sprints', async (c) => {
  try {
    const { status } = c.req.query();
    const rows = await getDb(c.env).query.sprints.findMany({
      where: status ? eq(schema.sprints.status, status) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/sprints', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('spr');
    await db.insert(schema.sprints).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'sprints', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/sprints/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.sprints.findFirst({ where: eq(schema.sprints.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/sprints/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.sprints).set(body).where(eq(schema.sprints.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'sprints', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/sprints/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.sprints).where(eq(schema.sprints.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'sprints', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── ACQ TASKS ── */
acquisitionRouter.get('/tasks', async (c) => {
  try {
    const { sprint_id, status, assignee } = c.req.query();
    const rows = await getDb(c.env).query.acqTasks.findMany({
      where: and(
        sprint_id ? eq(schema.acqTasks.sprintId, sprint_id) : undefined,
        status ? eq(schema.acqTasks.status, status) : undefined,
        assignee ? eq(schema.acqTasks.assignee, assignee) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/tasks', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('at');
    await db.insert(schema.acqTasks).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'acq_tasks', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/tasks/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.acqTasks.findFirst({ where: eq(schema.acqTasks.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/tasks/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.acqTasks).set(body).where(eq(schema.acqTasks.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'acq_tasks', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/tasks/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.acqTasks).where(eq(schema.acqTasks.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'acq_tasks', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default acquisitionRouter;
