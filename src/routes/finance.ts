import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';

const financeRouter = new Hono<{ Bindings: Env }>();
financeRouter.use('*', authMiddleware);
financeRouter.use('*', requireAppAccess('finance'));

/* ── ACCOUNTS ── */
financeRouter.get('/accounts', async (c) => {
  try { return ok(c, await getDb(c.env).query.accounts.findMany()); }
  catch (err) { return serverError(c, err); }
});
financeRouter.post('/accounts', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('acc');
    await db.insert(schema.accounts).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'accounts', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/accounts/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.accounts.findFirst({ where: eq(schema.accounts.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/accounts/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.accounts).set(body).where(eq(schema.accounts.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'accounts', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/accounts/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'accounts', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CHANNELS ── */
financeRouter.get('/channels', async (c) => {
  try { return ok(c, await getDb(c.env).query.channels.findMany()); }
  catch (err) { return serverError(c, err); }
});
financeRouter.post('/channels', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('ch');
    await db.insert(schema.channels).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'channels', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/channels/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.channels.findFirst({ where: eq(schema.channels.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/channels/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.channels).set(body).where(eq(schema.channels.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'channels', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/channels/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.channels).where(eq(schema.channels.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'channels', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── FUND REQUESTS ── */
financeRouter.get('/fund-requests', async (c) => {
  try {
    const { status, committee_id } = c.req.query();
    const rows = await getDb(c.env).query.fundRequests.findMany({
      where: and(
        status ? eq(schema.fundRequests.approvalStatus, status) : undefined,
        committee_id ? eq(schema.fundRequests.committeeId, committee_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
financeRouter.post('/fund-requests', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('fr');
    await db.insert(schema.fundRequests).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'fund_requests', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/fund-requests/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.fundRequests.findFirst({ where: eq(schema.fundRequests.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/fund-requests/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.fundRequests).set(body).where(eq(schema.fundRequests.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'fund_requests', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/fund-requests/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.fundRequests).where(eq(schema.fundRequests.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'fund_requests', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── INVOICES ── */
financeRouter.get('/invoices', async (c) => {
  try {
    const { status, client_id } = c.req.query();
    const rows = await getDb(c.env).query.invoices.findMany({
      where: and(
        status ? eq(schema.invoices.status, status) : undefined,
        client_id ? eq(schema.invoices.clientId, client_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
financeRouter.post('/invoices', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('inv');
    await db.insert(schema.invoices).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'invoices', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/invoices/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.invoices.findFirst({ where: eq(schema.invoices.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/invoices/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.invoices).set(body).where(eq(schema.invoices.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'invoices', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/invoices/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.invoices).where(eq(schema.invoices.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'invoices', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── TRANSACTIONS ── */
financeRouter.get('/transactions', async (c) => {
  try {
    const { account_id, client_id } = c.req.query();
    const rows = await getDb(c.env).query.transactions.findMany({
      where: and(
        account_id ? eq(schema.transactions.accountId, account_id) : undefined,
        client_id ? eq(schema.transactions.clientId, client_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
financeRouter.post('/transactions', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('txn');
    await db.insert(schema.transactions).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'transactions', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/transactions/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.transactions.findFirst({ where: eq(schema.transactions.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/transactions/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.transactions).set(body).where(eq(schema.transactions.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'transactions', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/transactions/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'transactions', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── P&L REPORTS ── */
financeRouter.get('/pl-reports', async (c) => {
  try { return ok(c, await getDb(c.env).query.plReports.findMany()); }
  catch (err) { return serverError(c, err); }
});
financeRouter.post('/pl-reports', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('pl');
    await db.insert(schema.plReports).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'pl_reports', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/pl-reports/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.plReports.findFirst({ where: eq(schema.plReports.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/pl-reports/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.plReports).set(body).where(eq(schema.plReports.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'pl_reports', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/pl-reports/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.plReports).where(eq(schema.plReports.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'pl_reports', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default financeRouter;
