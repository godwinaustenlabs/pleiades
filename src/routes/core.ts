import { Hono } from 'hono';
import { eq, and, like } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

import { UserPayload } from '../middleware/auth';

const coreRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
coreRouter.use('*', authMiddleware);

/* ── EMPLOYEES ── */
coreRouter.get('/employees', async (c) => {
  try {
    const db = getDb(c.env);
    const { department, status } = c.req.query();
    const rows = await db.query.employees.findMany({
      where: and(
        department ? like(schema.employees.department, `%${department}%`) : undefined,
        status ? eq(schema.employees.employmentStatus, status) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

coreRouter.post('/employees', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('emp');
    const now = new Date();
    
    // Sanitize body: only keep valid employee columns
    const { name, slackId, department, role, employmentStatus, hireDate, baseSalary, efficiencyScore, profilePhoto, sectorId } = body;
    const cleanBody = { name, slackId, department, role, employmentStatus, hireDate, baseSalary, efficiencyScore, profilePhoto, sectorId };

    await db.insert(schema.employees).values({ ...cleanBody, id, createdAt: now, updatedAt: now });
    await logAudit(c.env, user.id, 'CREATE', 'employees', id, cleanBody);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/employees/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const row = await db.query.employees.findFirst({ where: eq(schema.employees.id, c.req.param('id')) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

coreRouter.patch('/employees/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = c.req.param('id');
    
    // Sanitize body: only keep valid employee columns
    const { name, slackId, department, role, employmentStatus, hireDate, baseSalary, efficiencyScore, profilePhoto, sectorId } = body;
    const cleanBody: any = {};
    const fields = ['name', 'slackId', 'department', 'role', 'employmentStatus', 'hireDate', 'baseSalary', 'efficiencyScore', 'profilePhoto', 'sectorId'];
    fields.forEach(f => { if (body[f] !== undefined) cleanBody[f] = body[f]; });

    await db.update(schema.employees).set({ ...cleanBody, updatedAt: new Date() }).where(eq(schema.employees.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'employees', id, cleanBody);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/employees/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.employees).where(eq(schema.employees.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'employees', id);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── LABS ── */
coreRouter.get('/labs', async (c) => {
  try { return ok(c, await getDb(c.env).query.labs.findMany()); }
  catch (err) { return serverError(c, err); }
});

coreRouter.post('/labs', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json();
    const id = generateId('lab'); const now = new Date();
    await db.insert(schema.labs).values({ ...body, id, createdAt: now, updatedAt: now });
    await logAudit(c.env, user.id, 'CREATE', 'labs', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/labs/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.labs.findFirst({ where: eq(schema.labs.id, c.req.param('id')) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

coreRouter.patch('/labs/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.labs).set({ ...body, updatedAt: new Date() }).where(eq(schema.labs.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'labs', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/labs/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.labs).where(eq(schema.labs.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'labs', id);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CLIENTS ── */
coreRouter.get('/clients', async (c) => {
  try { return ok(c, await getDb(c.env).query.clients.findMany()); }
  catch (err) { return serverError(c, err); }
});

coreRouter.post('/clients', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json();
    const id = generateId('client'); const now = new Date();
    await db.insert(schema.clients).values({ ...body, id, createdAt: now, updatedAt: now });
    await logAudit(c.env, user.id, 'CREATE', 'clients', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/clients/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.clients.findFirst({ where: eq(schema.clients.id, c.req.param('id')) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

coreRouter.patch('/clients/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.clients).set({ ...body, updatedAt: new Date() }).where(eq(schema.clients.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'clients', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/clients/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.clients).where(eq(schema.clients.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'clients', id);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CLIENT PORTAL LOGIN PROVISIONING ── */
coreRouter.post('/clients/:id/provision-login', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const clientId = c.req.param('id');
    const { email, displayName, password } = await c.req.json<{ email: string; displayName?: string; password: string }>();

    if (!email?.trim()) return badRequest(c, 'email is required');
    if (!password || password.length < 6) return badRequest(c, 'password must be at least 6 characters');

    // Verify client exists
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
    if (!client) return notFound(c, 'Client not found');

    const passwordHash = await sha256hex(password);
    const now = new Date();

    // Check if login already exists for this client
    const existing = await db.query.clientLogins.findFirst({
      where: eq(schema.clientLogins.clientId, clientId),
    });

    let loginId: string;
    if (existing) {
      // Update existing login
      loginId = existing.id;
      await db.update(schema.clientLogins).set({
        email: email.toLowerCase().trim(),
        name: displayName || existing.name,
        passwordHash,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
      }).where(eq(schema.clientLogins.id, existing.id));
    } else {
      // Create new login
      loginId = generateId('clog');
      await db.insert(schema.clientLogins).values({
        id: loginId,
        clientId,
        email: email.toLowerCase().trim(),
        name: displayName || (client as any).clientName || 'Client',
        passwordHash,
        isActive: true,
        failedAttempts: 0,
        createdAt: now,
      });
    }

    await logAudit(c.env, user.id, 'CREATE', 'client_logins', loginId, { clientId, email });
    return ok(c, { loginId, email, clientId, isNew: !existing });
  } catch (err) { return serverError(c, err); }
});

/* Get portal login status for a client */
coreRouter.get('/clients/:id/portal-status', async (c) => {
  try {
    const db = getDb(c.env);
    const clientId = c.req.param('id');
    const login = await db.query.clientLogins.findFirst({
      where: eq(schema.clientLogins.clientId, clientId),
    });
    if (!login) return ok(c, { hasLogin: false });
    return ok(c, { hasLogin: true, email: login.email, isActive: login.isActive, name: login.name });
  } catch (err) { return serverError(c, err); }
});

/* ── COMMITTEES ── */
coreRouter.get('/committees', async (c) => {
  try {
    const { all } = c.req.query();
    const db = getDb(c.env);
    const rows = await db.query.committees.findMany({
      where: all === 'true' ? undefined : eq(schema.committees.activeStatus, true),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

coreRouter.post('/committees', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json();
    const id = generateId('com'); const now = new Date();
    await db.insert(schema.committees).values({ ...body, id, createdAt: now, updatedAt: now });
    await logAudit(c.env, user.id, 'CREATE', 'committees', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/committees/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.committees.findFirst({ where: eq(schema.committees.id, c.req.param('id')) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

coreRouter.patch('/committees/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.committees).set({ ...body, updatedAt: new Date() }).where(eq(schema.committees.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'committees', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/committees/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.committees).where(eq(schema.committees.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'committees', id);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── COMMITTEE MEMBERS ── */
coreRouter.get('/committees/:id/members', async (c) => {
  try {
    const rows = await getDb(c.env).query.committeeMembers.findMany({
      where: eq(schema.committeeMembers.committeeId, c.req.param('id')),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

coreRouter.post('/committees/:id/members', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json<{ employeeId: string; roleInCommittee?: string; joinedAt?: string }>();
    const committeeId = c.req.param('id');
    await db.insert(schema.committeeMembers).values({ committeeId, ...body });
    await logAudit(c.env, user.id, 'CREATE', 'committee_members', committeeId, body);
    return created(c, { committeeId, employeeId: body.employeeId });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/committees/:id/members/:employeeId', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const committeeId = c.req.param('id');
    const employeeId = c.req.param('employeeId');
    await db.delete(schema.committeeMembers).where(
      and(eq(schema.committeeMembers.committeeId, committeeId), eq(schema.committeeMembers.employeeId, employeeId))
    );
    await logAudit(c.env, user.id, 'DELETE', 'committee_members', committeeId, { employeeId });
    return ok(c, { removed: true });
  } catch (err) { return serverError(c, err); }
});

/* ── MONTHLY REPORTS ── */
coreRouter.get('/monthly-reports', async (c) => {
  try { return ok(c, await getDb(c.env).query.monthlyReports.findMany()); }
  catch (err) { return serverError(c, err); }
});

coreRouter.post('/monthly-reports', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json();
    const id = generateId('rpt');
    await db.insert(schema.monthlyReports).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'monthly_reports', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/monthly-reports/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.monthlyReports.findFirst({ where: eq(schema.monthlyReports.id, c.req.param('id')) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

coreRouter.patch('/monthly-reports/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.monthlyReports).set(body).where(eq(schema.monthlyReports.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'monthly_reports', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── CORE DOCS ── */
coreRouter.get('/docs', async (c) => {
  try { return ok(c, await getDb(c.env).query.coreDocs.findMany()); }
  catch (err) { return serverError(c, err); }
});

coreRouter.post('/docs', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json();
    const id = generateId('doc');
    await db.insert(schema.coreDocs).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'core_docs', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/docs/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.coreDocs.findFirst({ where: eq(schema.coreDocs.id, c.req.param('id')) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

coreRouter.patch('/docs/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.coreDocs).set(body).where(eq(schema.coreDocs.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'core_docs', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/docs/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.coreDocs).where(eq(schema.coreDocs.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'core_docs', id);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── EMPLOYEE-LAB ASSIGNMENTS ── */
coreRouter.post('/employee-lab', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json<{ employeeId: string; labId: string; joinedAt?: string }>();
    await db.insert(schema.employeeLab).values(body);
    await logAudit(c.env, user.id, 'CREATE', 'employee_lab', body.employeeId, body);
    return created(c, body);
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/employee-lab/:employeeId', async (c) => {
  try {
    const rows = await getDb(c.env).query.employeeLab.findMany({
      where: eq(schema.employeeLab.employeeId, c.req.param('employeeId')),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

export default coreRouter;
