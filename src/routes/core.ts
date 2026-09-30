import { Hono } from 'hono';
import { eq, and, like } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess, checkFeaturePermission } from '../middleware/rbac';
import { employeeImpact, deleteEmployee } from '../deletion/impact';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

import { UserPayload } from '../middleware/auth';
import { hashPassword } from '../utils/password';

const coreRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
coreRouter.use('*', authMiddleware);
// This router was previously gated on nothing but authentication, so ANY logged-in
// user could create and delete employees, labs and clients. Reads stay open to
// every role (the UI depends on them); writes are gated per feature below.
coreRouter.use('*', requireAppAccess('core'));

/* ── EMPLOYEES ── */
/**
 * Fields that must not be exposed on the general directory.
 *
 * `core/employees` is held by nearly every role because the UI needs a staff
 * directory, but the underlying row also carries national ID, bank and tax
 * details and salary. Those belong to HR, so they are stripped unless the caller
 * can actually administer employee records.
 */
const SENSITIVE_EMPLOYEE_FIELDS = [
  'cnic', 'bankDetails', 'taxInformation', 'baseSalary',
  'dob', 'address', 'contactInfo', 'emergencyContact',
] as const;

function stripSensitiveEmployeeFields<T extends Record<string, any>>(row: T): Partial<T> {
  const out: Record<string, any> = { ...row };
  for (const f of SENSITIVE_EMPLOYEE_FIELDS) delete out[f];
  return out as Partial<T>;
}

coreRouter.get('/employees', async (c) => {
  try {
    const db = getDb(c.env);
    const { department, status, slack_id } = c.req.query();
    const rows = await db.query.employees.findMany({
      where: and(
        department ? like(schema.employees.department, `%${department}%`) : undefined,
        status ? eq(schema.employees.employmentStatus, status) : undefined,
        slack_id ? eq(schema.employees.slackId, slack_id) : undefined
      ),
    });

    const canSeeSensitive = await checkFeaturePermission(c, 'hr', 'employees', 'view');
    return ok(c, canSeeSensitive ? rows : rows.map(stripSensitiveEmployeeFields));
  } catch (err) { return serverError(c, err); }
});

coreRouter.post('/employees', requireFeatureAccess('core', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('emp');
    const now = new Date();
    
    // Sanitize body: only keep valid employee columns
    const { name, slackId, department, role, email, phone, employmentStatus, hireDate, baseSalary, efficiencyScore, profilePhoto, sectorId, cnic, dob, gender, address, contactInfo, emergencyContact, designation, reportingManagerId, employmentType, confirmationDate, contractStartDate, contractEndDate, bankDetails, taxInformation, assignedOffice, notes } = body;
    const cleanBody = { name, slackId, department, role, email, phone, employmentStatus, hireDate, baseSalary, efficiencyScore, profilePhoto, sectorId, cnic, dob, gender, address, contactInfo, emergencyContact, designation, reportingManagerId, employmentType, confirmationDate, contractStartDate, contractEndDate, bankDetails, taxInformation, assignedOffice, notes };

    await db.insert(schema.employees).values({ ...cleanBody, id, createdAt: now, updatedAt: now });
    await logAudit(c.env, user.id, 'CREATE', 'employees', id, cleanBody);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.get('/employees/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const row = await db.query.employees.findFirst({ where: eq(schema.employees.id, c.req.param('id')) });
    if (!row) return notFound(c);

    // HR staff see everything; so does a user looking at their own record.
    const canSeeSensitive =
      (await checkFeaturePermission(c, 'hr', 'employees', 'view')) || user.employeeId === row.id;
    return ok(c, canSeeSensitive ? row : stripSensitiveEmployeeFields(row));
  } catch (err) { return serverError(c, err); }
});

coreRouter.patch('/employees/:id', requireFeatureAccess('core', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = c.req.param('id');
    
    // Sanitize body: only keep valid employee columns
    const { name, slackId, department, role, email, phone, employmentStatus, hireDate, baseSalary, efficiencyScore, profilePhoto, sectorId, cnic, dob, gender, address, contactInfo, emergencyContact, designation, reportingManagerId, employmentType, confirmationDate, contractStartDate, contractEndDate, bankDetails, taxInformation, assignedOffice, notes } = body;
    const cleanBody: any = {};
    const fields = ['name', 'slackId', 'department', 'role', 'email', 'phone', 'employmentStatus', 'hireDate', 'baseSalary', 'efficiencyScore', 'profilePhoto', 'sectorId', 'cnic', 'dob', 'gender', 'address', 'contactInfo', 'emergencyContact', 'designation', 'reportingManagerId', 'employmentType', 'confirmationDate', 'contractStartDate', 'contractEndDate', 'bankDetails', 'taxInformation', 'assignedOffice', 'notes'];
    fields.forEach(f => { if (body[f] !== undefined) cleanBody[f] = body[f]; });

    await db.update(schema.employees).set({ ...cleanBody, updatedAt: new Date() }).where(eq(schema.employees.id, id));
    
    await logAudit(c.env, user.id, 'UPDATE', 'employees', id, cleanBody);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

/**
 * GET /employees/:id/impact
 *
 * What removing this person would take with it, and what it would merely let go of.
 * Read-only; this is what the confirmation wizard renders.
 *
 * The distinction the report exists to make is between the three fates. Their
 * attendance and payslips are deleted because those records describe nothing but
 * this person. The laptop in their drawer is RELEASED — an asset is not destroyed
 * because its holder left, it goes back in the pool. The review they wrote of a
 * colleague is KEPT, with their name cleared off it, because it is the colleague's
 * history and not theirs.
 *
 * Their personal documents are the one irreversible part — a CNIC scan, a signed
 * contract — so the report carries download links for every one of them, and the
 * wizard offers them before the confirm button.
 */
coreRouter.get('/employees/:id/impact', requireFeatureAccess('core', 'employees', 'delete'), async (c) => {
  try {
    const actor = c.get('user');
    const impact = await employeeImpact(c.env, c.req.param('id'), {
      id: actor.id,
      // Checked here rather than inside the report, so the report stays a pure
      // description and the permission question has one owner.
      canDeleteLogins: actor.isSuperadmin || (await checkFeaturePermission(c, 'admin', 'users', 'delete')),
    });
    if (!impact) return notFound(c, 'Employee not found');
    return ok(c, impact);
  } catch (err) { return serverError(c, err); }
});

/**
 * DELETE /employees/:id           refuses while anything depends on them
 * DELETE /employees/:id?cascade=1 removes them and everything in the impact report
 *
 * The cascade is the only thing in this system that deletes a login, and that is
 * deliberate: a login belongs to the PERSON, so it goes when the person does and not
 * when one of their posts ends. It therefore requires `admin/users` delete ON TOP OF
 * `core/employees` delete — otherwise the weaker grant would quietly become the
 * ability to delete accounts. The impact report states that as a blocker rather than
 * letting the request get as far as a 403.
 *
 * Three refusals that are not warnings, all enforced here as well as reported: a
 * superadmin's account, your own record, and a missing `admin/users` grant.
 */
coreRouter.delete('/employees/:id', requireFeatureAccess('core', 'employees', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user');
    const id = c.req.param('id');
    const cascade = c.req.query('cascade') === '1' || c.req.query('cascade') === 'true';

    const canDeleteLogins = actor.isSuperadmin || (await checkFeaturePermission(c, 'admin', 'users', 'delete'));
    const impact = await employeeImpact(c.env, id, { id: actor.id, canDeleteLogins });
    if (!impact) return notFound(c);

    if (impact.blockers.length > 0) {
      return c.json({ success: false, error: impact.blockers.join(' '), data: { impact } }, 403);
    }

    if (!cascade) {
      const holding = impact.items.filter((i) => (i.fate === 'delete' || i.fate === 'detach') && i.count > 0);
      if (holding.length > 0) {
        return c.json({
          success: false,
          error: `${impact.label} still has ${holding.map((i) => `${i.count} ${i.label.toLowerCase()}`).join(', ')}. Review it at GET /api/core/employees/${id}/impact — it includes download links for their documents — then repeat this request with ?cascade=1.`,
          data: { impact },
        }, 409);
      }
    }

    const result = await deleteEmployee(c.env, id);
    if (!result) return notFound(c);

    await logAudit(c.env, actor.id, 'DELETE', 'employees', id, {
      name: impact.label,
      cascade,
      ...result.summary,
      filesRemoved: result.filesRemoved,
    });
    return ok(c, { id, deleted: true, ...result });
  } catch (err: any) {
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return badRequest(c, 'Cannot delete employee: something still references them that the impact report does not know about. Please report this — the report and the cascade are meant to agree.');
    }
    return serverError(c, err);
  }
});

/* ── LABS ── */
coreRouter.get('/labs', async (c) => {
  try { return ok(c, await getDb(c.env).query.labs.findMany()); }
  catch (err) { return serverError(c, err); }
});

coreRouter.post('/labs', requireFeatureAccess('core', 'labs', 'edit'), async (c) => {
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

coreRouter.patch('/labs/:id', requireFeatureAccess('core', 'labs', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.labs).set({ ...body, updatedAt: new Date() }).where(eq(schema.labs.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'labs', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/labs/:id', requireFeatureAccess('core', 'labs', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.labs).where(eq(schema.labs.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'labs', id);
    return ok(c, { id, deleted: true });
  } catch (err: any) { 
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return badRequest(c, 'Cannot delete lab: it has associated committees or employees.');
    }
    return serverError(c, err); 
  }
});

/* ── CLIENTS ── */
coreRouter.get('/clients', async (c) => {
  try { return ok(c, await getDb(c.env).query.clients.findMany()); }
  catch (err) { return serverError(c, err); }
});

coreRouter.post('/clients', requireFeatureAccess('core', 'clients', 'edit'), async (c) => {
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

coreRouter.patch('/clients/:id', requireFeatureAccess('core', 'clients', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    
    // Sanitize body: remove system fields that shouldn't be updated directly
    const { id: _id, createdAt: _ca, updatedAt: _ua, ...cleanBody } = body;
    
    await db.update(schema.clients).set({ ...cleanBody, updatedAt: new Date() }).where(eq(schema.clients.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'clients', id, cleanBody);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/clients/:id', requireFeatureAccess('core', 'clients', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.clients).where(eq(schema.clients.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'clients', id);
    return ok(c, { id, deleted: true });
  } catch (err: any) { 
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return badRequest(c, 'Cannot delete client: they have active contracts, committees, or docs.');
    }
    return serverError(c, err); 
  }
});

/* ── CLIENT PORTAL LOGIN PROVISIONING ── */
coreRouter.post('/clients/:id/provision-login', requireFeatureAccess('core', 'clients', 'edit'), async (c) => {
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

    const passwordHash = await hashPassword(password);
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
      where: all === 'false' ? eq(schema.committees.activeStatus, true) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

coreRouter.post('/committees', requireFeatureAccess('core', 'committees', 'edit'), async (c) => {
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

coreRouter.patch('/committees/:id', requireFeatureAccess('core', 'committees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.committees).set({ ...body, updatedAt: new Date() }).where(eq(schema.committees.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'committees', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/committees/:id', requireFeatureAccess('core', 'committees', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    await db.delete(schema.committees).where(eq(schema.committees.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'committees', id);
    return ok(c, { id, deleted: true });
  } catch (err: any) { 
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return badRequest(c, 'Cannot delete committee: it has active members, tickets, or reports.');
    }
    return serverError(c, err); 
  }
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

coreRouter.post('/committees/:id/members', requireFeatureAccess('core', 'committees', 'edit'), async (c) => {
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

coreRouter.delete('/committees/:id/members/:employeeId', requireFeatureAccess('core', 'committees', 'delete'), async (c) => {
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

coreRouter.post('/monthly-reports', requireFeatureAccess('core', 'docs', 'edit'), async (c) => {
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

coreRouter.patch('/monthly-reports/:id', requireFeatureAccess('core', 'docs', 'edit'), async (c) => {
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

coreRouter.post('/docs', requireFeatureAccess('core', 'docs', 'edit'), async (c) => {
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

coreRouter.patch('/docs/:id', requireFeatureAccess('core', 'docs', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.coreDocs).set(body).where(eq(schema.coreDocs.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'core_docs', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

coreRouter.delete('/docs/:id', requireFeatureAccess('core', 'docs', 'delete'), async (c) => {
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
coreRouter.post('/employee-lab', requireFeatureAccess('core', 'employees', 'edit'), async (c) => {
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
