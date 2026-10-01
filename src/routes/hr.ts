import { Hono } from 'hono';
import { eq, and, or } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess, listGrants } from '../middleware/rbac';
import { appointmentImpact, deleteAppointment } from '../deletion/impact';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';
import { hashPassword } from '../utils/password';

const hrRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
hrRouter.use('*', authMiddleware);
hrRouter.use('*', requireAppAccess('hr'));

/**
 * Appointments live here; what an appointment GRANTS does not.
 *
 * This router used to write `user_app_permissions` directly, from a
 * `permissions` array on the provisioning body, while gated on
 * `hr/appointments` edit. That is an escalation: anybody able to edit an
 * appointment could grant themselves every feature in the system. The same hole
 * was closed once before by deleting `PUT /api/permissions/user/:id` for exactly
 * this reason, and reopening it on the appointment table would have been the
 * same mistake with a new column name.
 *
 * Access is edited through `PUT /api/admin/appointments/:id/permissions`, gated
 * on `admin/permissions` edit. Assigning somebody to a post and deciding what
 * that post may reach are two different authorities, and now two different
 * grants.
 */

/* ── SECTORS ── */
hrRouter.get('/sectors', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.sectors.findMany()); }
  catch (err) { return serverError(c, err); }
});

hrRouter.post('/sectors', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('sec');
    await db.insert(schema.sectors).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'sectors', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.get('/sectors/:id', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.sectors.findFirst({ where: eq(schema.sectors.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/sectors/:id', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.sectors).set(body).where(eq(schema.sectors.id, id!));
    await logAudit(c.env, user.id, 'UPDATE', 'sectors', id!, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.delete('/sectors/:id', requireFeatureAccess('hr', 'employees', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    await db.delete(schema.sectors).where(eq(schema.sectors.id, id!));
    await logAudit(c.env, user.id, 'DELETE', 'sectors', id!);
    return ok(c, { id, deleted: true });
  } catch (err: any) { 
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return serverError(c, new Error('Cannot delete sector: it has associated employees or projects.'));
    }
    return serverError(c, err); 
  }
});

/* ── APPOINTMENTS ── */
/**
 * Gone from here. They live in `src/routes/appointments.ts`, at
 * `/api/admin/appointments`, gated on `admin/appointments`.
 *
 * An appointment is an access control, not an HR record: since 0047, assigning one
 * hands the holder every grant it carries, its mailbox and its committee seat.
 * Behind `hr/appointments` that meant whoever ran the payroll could confer any
 * access a post carried. Migration 0050 moved the grant.
 *
 * HR still READS the list — the directory shows somebody's post — which is why
 * `GET /api/admin/appointments` admits `hr/employees` view alongside the admin
 * grants rather than being gated on `admin/appointments` alone.
 */

/**
 * POST /hr/employees/:id/account
 *
 * The person's ONE login. Creates it, or updates the existing one — matched
 * through `users_logins.employee_id`, which is unique since migration 0047, so
 * "the account for this employee" is a question with one answer.
 *
 * This replaces the account half of `/appointments/provision`. That route found
 * an account by the email on the request and created one per posting, which is
 * what produced two logins for one person.
 *
 * Two guards, both because `hr/employees` edit is a much weaker permission than
 * the one that should be needed to take over an account:
 *
 *   - a superadmin's login is never written here. It is the same rule as
 *     src/email/password-reset.ts and PATCH /admin/users/:id: a superadmin's
 *     credentials are a direct database operation, or the escalation path to
 *     superadmin is one HR grant long.
 *   - a login already belonging to a DIFFERENT employee is never rewritten. An
 *     email collision is reported, not resolved by reassignment — otherwise
 *     provisioning a new starter with a colleague's address would hand over the
 *     colleague's account.
 */
hrRouter.post('/employees/:id/account', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user');
    const employeeId = c.req.param('id')!;
    const body = await c.req.json();

    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.id, employeeId),
      columns: { id: true, name: true },
    });
    if (!employee) return notFound(c, 'That employee does not exist.');

    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
    const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const existing = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.employeeId, employeeId),
    });

    if (email || username) {
      const clash = await db.query.usersLogins.findFirst({
        where: or(
          email ? eq(schema.usersLogins.email, email) : undefined,
          username ? eq(schema.usersLogins.username, username) : undefined,
        ),
      });
      if (clash && clash.id !== existing?.id) {
        return badRequest(c, clash.email === email
          ? `${email} is already the sign-in address of another account.`
          : `The username "${username}" is already taken.`);
      }
    }

    if (existing) {
      if (existing.isSuperadmin) {
        return c.json({
          success: false,
          error: "This employee's account is a superadmin. Its credentials are changed by direct database access only.",
        }, 403);
      }

      const patch: Record<string, unknown> = {};
      if (email) patch.email = email;
      if (username) patch.username = username;
      if (typeof body.name === 'string' && body.name) patch.name = body.name;
      if (body.isActive !== undefined) patch.isActive = body.isActive === true;
      if (password) {
        if (password.length < 8) return badRequest(c, 'Password must be at least 8 characters');
        patch.passwordHash = await hashPassword(password);
        patch.passwordUpdatedAt = new Date();
        patch.failedAttempts = 0;
        patch.lockedUntil = null;
      }
      if (Object.keys(patch).length === 0) {
        return badRequest(c, 'Nothing to change. Send email, username, name, password or isActive.');
      }

      await db.update(schema.usersLogins).set(patch).where(eq(schema.usersLogins.id, existing.id));
      await logAudit(c.env, actor.id, 'UPDATE', 'users_logins', existing.id, {
        employeeId,
        ...(email ? { email } : {}),
        ...(username ? { username } : {}),
        ...(password ? { passwordChanged: true } : {}),
      });
      return ok(c, { id: existing.id, employeeId, created: false });
    }

    if (!email || !username) return badRequest(c, 'email and username are required for a new account.');
    if (!password) return badRequest(c, 'A password is required for a new account.');
    if (password.length < 8) return badRequest(c, 'Password must be at least 8 characters');

    const id = generateId('usr');
    const now = new Date();
    // The actor is verified to exist before being written as the creator: this is
    // a foreign key, and an agent acting as a deleted user would fail the insert
    // for a reason that has nothing to do with the account being created.
    const creator = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, actor.id),
      columns: { id: true },
    });

    await db.insert(schema.usersLogins).values({
      id,
      employeeId,
      email,
      username,
      name: (typeof body.name === 'string' && body.name) || employee.name,
      passwordHash: await hashPassword(password),
      isActive: true,
      // Never derived from a request field. The old provisioning route read
      // `roleOrTitle === 'CEO'` off the body and granted superadmin from it.
      isSuperadmin: false,
      failedAttempts: 0,
      createdAt: now,
      createdByUserId: creator?.id ?? null,
    });

    if (creator?.id) {
      await db.insert(schema.userOwnership).values({
        userId: id,
        ownerUserId: creator.id,
        assignedAt: now,
        assignedByUserId: creator.id,
      }).onConflictDoNothing();
    }

    await logAudit(c.env, actor.id, 'CREATE', 'users_logins', id, { employeeId, email });
    return created(c, { id, employeeId, created: true });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed: users_logins.employee_id')) {
      return badRequest(c, 'This employee already has an account. There is one login per person.');
    }
    return serverError(c, err);
  }
});

/* ── PAYROLL RECORDS ── */
hrRouter.get('/payroll', requireFeatureAccess('hr', 'payroll', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const { employee_id, month } = c.req.query();
    const rows = await db.query.payrollRecords.findMany({
      where: and(
        employee_id ? eq(schema.payrollRecords.employeeId, employee_id) : undefined,
        month ? eq(schema.payrollRecords.payrollMonth, month) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

hrRouter.post('/payroll', requireFeatureAccess('hr', 'payroll', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('pay');
    await db.insert(schema.payrollRecords).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'payroll_records', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.get('/payroll/:id', requireFeatureAccess('hr', 'payroll', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.payrollRecords.findFirst({ where: eq(schema.payrollRecords.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/payroll/:id', requireFeatureAccess('hr', 'payroll', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.payrollRecords).set(body).where(eq(schema.payrollRecords.id, id!));
    await logAudit(c.env, user.id, 'UPDATE', 'payroll_records', id!, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.delete('/payroll/:id', requireFeatureAccess('hr', 'payroll', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    await db.delete(schema.payrollRecords).where(eq(schema.payrollRecords.id, id!));
    await logAudit(c.env, user.id, 'DELETE', 'payroll_records', id!);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── LEGAL TRACKER (HR copy) ── */
hrRouter.get('/legal-tracker', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const { employee_id } = c.req.query();
    const rows = await db.query.legalTracker.findMany({
      where: employee_id ? eq(schema.legalTracker.employeeId, employee_id) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

hrRouter.post('/legal-tracker', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('lt');
    await db.insert(schema.legalTracker).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'legal_tracker', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.get('/legal-tracker/:id', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.legalTracker.findFirst({ where: eq(schema.legalTracker.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/legal-tracker/:id', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.legalTracker).set(body).where(eq(schema.legalTracker.id, id!));
    await logAudit(c.env, user.id, 'UPDATE', 'legal_tracker', id!, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.delete('/legal-tracker/:id', requireFeatureAccess('hr', 'employees', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    await db.delete(schema.legalTracker).where(eq(schema.legalTracker.id, id!));
    await logAudit(c.env, user.id, 'DELETE', 'legal_tracker', id!);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── PERMISSIONS (read-only; grants live on the role) ── */
hrRouter.get('/employees/:id/permissions', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try {
    // Effective grants for the account, derived from its role. Previously read
    // per-user rows from user_app_permissions.
    return ok(c, await listGrants(c, c.req.param('id')!));
  } catch (err) { return serverError(c, err); }
});

/* ── ATTENDANCE ── */
hrRouter.get('/attendance', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.attendance.findMany({ where: c.req.query('employee_id') ? eq(schema.attendance.employeeId, c.req.query('employee_id')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});
hrRouter.post('/attendance', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const body = await c.req.json(); const id = generateId('att');
    await db.insert(schema.attendance).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'attendance', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── LEAVE REQUESTS ── */
hrRouter.get('/leave-requests', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.leaveRequests.findMany({ where: c.req.query('employee_id') ? eq(schema.leaveRequests.employeeId, c.req.query('employee_id')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});
hrRouter.post('/leave-requests', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const body = await c.req.json(); const id = generateId('lr');
    await db.insert(schema.leaveRequests).values({ ...body, id, status: 'Pending', createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'leave_requests', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
hrRouter.patch('/leave-requests/:id/approve', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const id = c.req.param('id'); const body = await c.req.json();
    await db.update(schema.leaveRequests).set({ status: body.status, approvedBy: user.employeeId }).where(eq(schema.leaveRequests.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'leave_requests', id, { status: body.status });
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── LEAVE BALANCES ── */
hrRouter.get('/leave-balances', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.leaveBalances.findMany({ where: c.req.query('employee_id') ? eq(schema.leaveBalances.employeeId, c.req.query('employee_id')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});

/* ── EMPLOYEE DOCUMENTS ── */
hrRouter.get('/documents', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.employeeDocuments.findMany({ where: c.req.query('employee_id') ? eq(schema.employeeDocuments.employeeId, c.req.query('employee_id')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});
hrRouter.post('/documents', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const body = await c.req.json(); const id = generateId('doc');
    await db.insert(schema.employeeDocuments).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'employee_documents', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
hrRouter.delete('/documents/:id', requireFeatureAccess('hr', 'employees', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const id = c.req.param('id');
    await db.delete(schema.employeeDocuments).where(eq(schema.employeeDocuments.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'employee_documents', id);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── SALARY STRUCTURES ── */
hrRouter.get('/salary-structures', requireFeatureAccess('hr', 'payroll', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.salaryStructures.findMany({ where: c.req.query('employee_id') ? eq(schema.salaryStructures.employeeId, c.req.query('employee_id')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});
hrRouter.post('/salary-structures', requireFeatureAccess('hr', 'payroll', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const body = await c.req.json(); const id = generateId('ss');
    await db.insert(schema.salaryStructures).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'salary_structures', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── LOANS ── */
hrRouter.get('/loans', requireFeatureAccess('hr', 'payroll', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.loans.findMany({ where: c.req.query('employee_id') ? eq(schema.loans.employeeId, c.req.query('employee_id')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});
hrRouter.post('/loans', requireFeatureAccess('hr', 'payroll', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const body = await c.req.json(); const id = generateId('ln');
    await db.insert(schema.loans).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'loans', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── ASSETS ── */
hrRouter.get('/assets', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.assets.findMany({ where: c.req.query('assigned_to') ? eq(schema.assets.assignedTo, c.req.query('assigned_to')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});
hrRouter.post('/assets', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const body = await c.req.json(); const id = generateId('ast');
    await db.insert(schema.assets).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'assets', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
hrRouter.patch('/assets/:id', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const id = c.req.param('id'); const body = await c.req.json();
    await db.update(schema.assets).set(body).where(eq(schema.assets.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'assets', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── PERFORMANCE REVIEWS ── */
hrRouter.get('/performance', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.performanceReviews.findMany({ where: c.req.query('employee_id') ? eq(schema.performanceReviews.employeeId, c.req.query('employee_id')!) : undefined })); }
  catch (err) { return serverError(c, err); }
});
hrRouter.post('/performance', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user'); const body = await c.req.json(); const id = generateId('perf');
    await db.insert(schema.performanceReviews).values({ ...body, id, reviewerId: user.employeeId, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'performance_reviews', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

/* ── SALARY SCHEMA (Active structure + components) ── */

/** GET active structure + all its components for one employee */
hrRouter.get('/salary-structures/:employeeId/active', requireFeatureAccess('hr', 'payroll', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const { employeeId } = c.req.param();
    const structure = await db.query.salaryStructures.findFirst({
      where: and(eq(schema.salaryStructures.employeeId, employeeId), eq(schema.salaryStructures.active, true)),
    });
    if (!structure) return ok(c, null);
    const components = await db.query.salaryComponents.findMany({
      where: eq(schema.salaryComponents.structureId, structure.id),
    });
    return ok(c, { ...structure, components });
  } catch (err) { return serverError(c, err); }
});

/**
 * POST /salary-structures/:employeeId/setup
 * Body: { baseSalary, effectiveDate, components: [{ componentName, componentType, amountType, value }] }
 * Deactivates old structure, creates new one with components.
 */
hrRouter.post('/salary-structures/:employeeId/setup', requireFeatureAccess('hr', 'payroll', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const { employeeId } = c.req.param();
    const body = await c.req.json<{ baseSalary: number; effectiveDate: string; components: any[] }>();

    // Deactivate previous active structure
    await db.update(schema.salaryStructures)
      .set({ active: false })
      .where(and(eq(schema.salaryStructures.employeeId, employeeId), eq(schema.salaryStructures.active, true)));

    // Create new structure
    const structureId = generateId('ss');
    await db.insert(schema.salaryStructures).values({
      id: structureId,
      employeeId,
      baseSalary: body.baseSalary,
      effectiveDate: body.effectiveDate,
      active: true,
      createdAt: new Date(),
    });

    // Insert components
    if (body.components?.length > 0) {
      for (const comp of body.components) {
        await db.insert(schema.salaryComponents).values({
          id: generateId('sc'),
          structureId,
          componentName: comp.componentName,
          componentType: comp.componentType, // Earning | Deduction
          amountType: comp.amountType,       // Fixed | Percentage
          value: comp.value,
          createdAt: new Date(),
        });
      }
    }

    // Sync employee base salary
    await db.update(schema.employees)
      .set({ baseSalary: body.baseSalary, updatedAt: new Date() })
      .where(eq(schema.employees.id, employeeId));

    await logAudit(c.env, user.id, 'CREATE', 'salary_structures', structureId, { employeeId, baseSalary: body.baseSalary });
    return created(c, { structureId });
  } catch (err) { return serverError(c, err); }
});

/**
 * GET /salary-structures/:employeeId/calculate
 * Returns: { baseSalary, earnings[], deductions[], grossSalary, totalDeductions, netPay }
 */
hrRouter.get('/salary-structures/:employeeId/calculate', requireFeatureAccess('hr', 'payroll', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const { employeeId } = c.req.param();

    const employee = await db.query.employees.findFirst({ where: eq(schema.employees.id, employeeId) });
    if (!employee) return notFound(c);

    const structure = await db.query.salaryStructures.findFirst({
      where: and(eq(schema.salaryStructures.employeeId, employeeId), eq(schema.salaryStructures.active, true)),
    });

    const baseSalary = structure?.baseSalary ?? employee.baseSalary ?? 0;
    const components = structure
      ? await db.query.salaryComponents.findMany({ where: eq(schema.salaryComponents.structureId, structure.id) })
      : [];

    const activeLoans = await db.query.loans.findMany({
      where: and(eq(schema.loans.employeeId, employeeId), eq(schema.loans.status, 'Active')),
    });

    const earnings: { name: string; amount: number }[] = [];
    const deductions: { name: string; amount: number }[] = [];

    for (const comp of components) {
      const amount = comp.amountType === 'Percentage'
        ? parseFloat(((comp.value / 100) * baseSalary).toFixed(2))
        : comp.value;
      if (comp.componentType === 'Earning') earnings.push({ name: comp.componentName, amount });
      else deductions.push({ name: comp.componentName, amount });
    }

    for (const loan of activeLoans) {
      deductions.push({ name: 'Loan Repayment', amount: loan.monthlyInstallment });
    }

    const grossSalary = parseFloat((baseSalary + earnings.reduce((s, e) => s + e.amount, 0)).toFixed(2));
    const totalDeductions = parseFloat(deductions.reduce((s, d) => s + d.amount, 0).toFixed(2));
    const netPay = parseFloat((grossSalary - totalDeductions).toFixed(2));

    return ok(c, {
      employeeId,
      employeeName: employee.name,
      baseSalary,
      earnings,
      deductions,
      grossSalary,
      totalDeductions,
      netPay,
      structureId: structure?.id ?? null,
    });
  } catch (err) { return serverError(c, err); }
});

/**
 * POST /payroll/generate
 * Body: { month: 'YYYY-MM' }
 * Calculates and inserts payroll records for ALL active employees.
 */
hrRouter.post('/payroll/generate', requireFeatureAccess('hr', 'payroll', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const { month } = await c.req.json<{ month: string }>();
    if (!month) return serverError(c, new Error('month is required (YYYY-MM)'));

    const activeEmployees = await db.query.employees.findMany({
      where: eq(schema.employees.employmentStatus, 'active'),
    });

    const results: { employeeId: string; name: string; netPay: number; status: string }[] = [];

    for (const emp of activeEmployees) {
      try {
        const structure = await db.query.salaryStructures.findFirst({
          where: and(eq(schema.salaryStructures.employeeId, emp.id), eq(schema.salaryStructures.active, true)),
        });
        const baseSalary = structure?.baseSalary ?? emp.baseSalary ?? 0;
        const components = structure
          ? await db.query.salaryComponents.findMany({ where: eq(schema.salaryComponents.structureId, structure.id) })
          : [];
        const activeLoans = await db.query.loans.findMany({
          where: and(eq(schema.loans.employeeId, emp.id), eq(schema.loans.status, 'Active')),
        });

        const earnings: { name: string; amount: number }[] = [];
        const deductions: { name: string; amount: number }[] = [];

        for (const comp of components) {
          const amount = comp.amountType === 'Percentage'
            ? parseFloat(((comp.value / 100) * baseSalary).toFixed(2))
            : comp.value;
          if (comp.componentType === 'Earning') earnings.push({ name: comp.componentName, amount });
          else deductions.push({ name: comp.componentName, amount });
        }
        for (const loan of activeLoans) {
          deductions.push({ name: 'Loan Repayment', amount: loan.monthlyInstallment });
        }

        const grossSalary = parseFloat((baseSalary + earnings.reduce((s, e) => s + e.amount, 0)).toFixed(2));
        const totalDeductions = parseFloat(deductions.reduce((s, d) => s + d.amount, 0).toFixed(2));
        const withholdingTax = deductions.find(d => d.name.toLowerCase().includes('tax'))?.amount ?? 0;
        const netPay = parseFloat((grossSalary - totalDeductions).toFixed(2));

        const payrollId = generateId('pay');
        await db.insert(schema.payrollRecords).values({
          id: payrollId,
          employeeId: emp.id,
          payrollMonth: month,
          grossSalary,
          withholdingTax,
          otherDeductions: parseFloat((totalDeductions - withholdingTax).toFixed(2)),
          bonuses: 0,
          netPay,
          disbursementStatus: 'pending',
          allowancesBreakdown: JSON.stringify(earnings),
          deductionsBreakdown: JSON.stringify(deductions),
          createdAt: new Date(),
        });

        await logAudit(c.env, user.id, 'CREATE', 'payroll_records', payrollId, { employeeId: emp.id, month, netPay });
        results.push({ employeeId: emp.id, name: emp.name, netPay, status: 'generated' });
      } catch (empErr: any) {
        results.push({ employeeId: emp.id, name: emp.name, netPay: 0, status: `error: ${empErr.message}` });
      }
    }

    return ok(c, { month, processed: results.length, results });
  } catch (err) { return serverError(c, err); }
});

/* ── COMPANY DOCUMENTS / SOPs ── */
hrRouter.get('/company-documents', requireFeatureAccess('hr', 'employees', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const rows = await db.query.companyDocuments.findMany({
      where: eq(schema.companyDocuments.department, 'hr'),
      orderBy: (docs, { desc }) => [desc(docs.createdAt)],
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

hrRouter.post('/company-documents', requireFeatureAccess('hr', 'employees', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('cdoc');
    await db.insert(schema.companyDocuments).values({
      ...body, id, department: 'hr', createdAt: new Date(),
    });
    await logAudit(c.env, user.id, 'CREATE', 'company_documents', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.delete('/company-documents/:id', requireFeatureAccess('hr', 'employees', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    await db.delete(schema.companyDocuments).where(and(
      eq(schema.companyDocuments.id, id!),
      eq(schema.companyDocuments.department, 'hr'),
    ));
    await logAudit(c.env, user.id, 'DELETE', 'company_documents', id!);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default hrRouter;
