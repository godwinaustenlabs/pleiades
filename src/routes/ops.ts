import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';

const opsRouter = new Hono<{ Bindings: Env }>();
opsRouter.use('*', authMiddleware);
opsRouter.use('*', requireAppAccess('ops'));

/* ── LABS ── */
opsRouter.get('/labs', requireFeatureAccess('ops', 'labs', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.labs.findMany()); }
  catch (err) { return serverError(c, err); }
});
opsRouter.post('/labs', requireFeatureAccess('ops', 'labs', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('lab');
    await db.insert(schema.labs).values({ ...body, id, createdAt: new Date(), updatedAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'labs', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
opsRouter.patch('/labs/:id', requireFeatureAccess('ops', 'labs', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.labs).set({ ...body, updatedAt: new Date() }).where(eq(schema.labs.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'labs', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── COMMITTEES ── */
opsRouter.get('/committees', requireFeatureAccess('ops', 'committees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.committees.findMany()); }
  catch (err) { return serverError(c, err); }
});
opsRouter.post('/committees', requireFeatureAccess('ops', 'committees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('com');
    await db.insert(schema.committees).values({ ...body, id, createdAt: new Date(), updatedAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'committees', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── MONTHLY REPORTS ── */
opsRouter.get('/reports', requireFeatureAccess('ops', 'reports', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.monthlyReports.findMany()); }
  catch (err) { return serverError(c, err); }
});
opsRouter.post('/reports', requireFeatureAccess('ops', 'reports', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('rpt');
    await db.insert(schema.monthlyReports).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'monthly_reports', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── OPS DOCS ── */
opsRouter.get('/docs', requireFeatureAccess('ops', 'docs', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.coreDocs.findMany()); }
  catch (err) { return serverError(c, err); }
});

export default opsRouter;
