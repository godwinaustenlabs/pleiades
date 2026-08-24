import { Hono } from 'hono';
import { eq, and, or } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess, listGrants, APP_FEATURES } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';
import { chunk } from '../utils/batch';
import { hashPassword } from '../utils/password';

const hrRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
hrRouter.use('*', authMiddleware);
hrRouter.use('*', requireAppAccess('hr'));

/**
 * Writes a provisioned account's permissions.
 *
 * A new account starts with nothing: omit `permissions` and it can reach no
 * module at all until someone grants it something. That is deliberate — the
 * failure mode of the old default was an account quietly carrying whatever the
 * default role happened to hold.
 *
 * A grant naming an app/feature outside APP_FEATURES is rejected rather than
 * stored, because getPerm() could never satisfy it: the row would look like
 * access while doing nothing.
 */
type GrantInput = {
  appName: string;
  feature: string;
  canView?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

async function applyPermissions(c: any, userId: string, permissions?: GrantInput[]): Promise<number> {
  if (!Array.isArray(permissions) || permissions.length === 0) return 0;

  const unknown = permissions.filter((p) => !APP_FEATURES[p.appName]?.includes(p.feature));
  if (unknown.length > 0) {
    throw new Error(`Unknown app/feature: ${unknown.map((p) => `${p.appName}/${p.feature}`).join(', ')}`);
  }

  const db = getDb(c.env);
  await db.delete(schema.userAppPermissions).where(eq(schema.userAppPermissions.userId, userId));

  const now = new Date();
  const rows = permissions
    .filter((p) => p.canView || p.canEdit || p.canDelete)
    .map((p) => ({
      id: generateId('uap'),
      userId,
      appName: p.appName,
      feature: p.feature,
      canView: p.canView ?? false,
      canEdit: p.canEdit ?? false,
      canDelete: p.canDelete ?? false,
      createdAt: now,
      updatedAt: now,
    }));
  for (const batch of chunk(rows, 5)) {
    if (batch.length > 0) await db.insert(schema.userAppPermissions).values(batch as any);
  }
  return rows.length;
}

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
hrRouter.get('/appointments', requireFeatureAccess('hr', 'appointments', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const { employee_id } = c.req.query();
    const rows = await db.query.appointments.findMany({
      where: employee_id ? eq(schema.appointments.employeeId, employee_id) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

hrRouter.post('/appointments', requireFeatureAccess('hr', 'appointments', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('appt');
    await db.insert(schema.appointments).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'appointments', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.post('/appointments/provision', requireFeatureAccess('hr', 'appointments', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user');
    const body = await c.req.json();
    
    // 1. Find or Create Account
    let userRecord;
    const email = body.email?.toLowerCase()?.trim();
    const username = body.username?.toLowerCase()?.trim();

    if (body.id) {
      const appt = await db.query.appointments.findFirst({ where: eq(schema.appointments.id, body.id) });
      if (appt?.accountId) {
        userRecord = await db.query.usersLogins.findFirst({ where: eq(schema.usersLogins.id, appt.accountId) });
      }
    }

    if (!userRecord && (email || username)) {
      userRecord = await db.query.usersLogins.findFirst({
        where: or(
          email ? eq(schema.usersLogins.email, email) : undefined,
          username ? eq(schema.usersLogins.username, username) : undefined
        )
      });
    }

    let accountId: string;
    if (userRecord) {
      accountId = userRecord.id;
      const updateData: any = {
        employeeId: (body.employeeId || userRecord.employeeId || null),
        isActive: true,
      };
      // Ensure we never pass empty strings to FK columns
      if (updateData.employeeId === "") updateData.employeeId = null;

      if (email) updateData.email = email;
      if (username) updateData.username = username;
      if (body.name) updateData.name = body.name;
      if (body.password) {
        updateData.passwordHash = await hashPassword(body.password);
        updateData.passwordUpdatedAt = new Date();
      }
      // NOTE: superadmin is deliberately NOT settable here. This previously read
      // `body.roleOrTitle === 'CEO'` — a free-text field on the request — and
      // granted superadmin from it, contradicting the schema's own rule that
      // is_superadmin is only ever set by direct database access. Widen a
      // user's access by granting them features instead.

      try {
        await db.update(schema.usersLogins).set(updateData).where(eq(schema.usersLogins.id, accountId));
      } catch (err: any) {
        throw new Error(`[DB_ERROR] users_logins UPDATE failed: ${err.message}`);
      }
      await logAudit(c.env, actor.id, 'UPDATE', 'users_logins', accountId, { email, note: 're-provisioned' });
    } else {
      if (!body.password) return c.json({ success: false, error: 'Password is required for new accounts' }, 400);
      if (!email || !username) return c.json({ success: false, error: 'Email and Username are required for new accounts' }, 400);
      
      accountId = generateId('usr');
      const passwordHash = await hashPassword(body.password);
      
      // Verify if actor exists to avoid FK failure on createdByUserId
      let creatorId = null;
      if (actor?.id) {
        const creator = await db.query.usersLogins.findFirst({ where: eq(schema.usersLogins.id, actor.id) });
        if (creator) creatorId = actor.id;
      }

      try {
        await db.insert(schema.usersLogins).values({
          id: accountId,
          email,
          username,
          name: body.name || username,
          passwordHash,
          employeeId: body.employeeId || null,
          isActive: true,
          // Never derived from request input — see the note on the update path above.
          isSuperadmin: false,
          failedAttempts: 0,
          createdAt: new Date(),
          createdByUserId: creatorId,
        });
      } catch (err: any) {
        throw new Error(`[DB_ERROR] users_logins INSERT failed: ${err.message}`);
      }
      
      if (creatorId) {
        await logAudit(c.env, creatorId, 'CREATE', 'users_logins', accountId, { email });
        try {
          await db.insert(schema.userOwnership).values({
            userId: accountId,
            ownerUserId: creatorId,
            assignedAt: new Date(),
            assignedByUserId: creatorId,
          });
        } catch (err: any) {
          console.error('[WARNING] user_ownership INSERT failed (non-blocking):', err.message);
        }
      }
    }

    // 2. Create or Update Appointment
    const appointmentId = body.id || generateId('appt');
    const appointmentValues = {
      employeeId: body.employeeId || null,
      accountId: accountId,
      committeeId: body.committeeId || null,
      roleOrTitle: body.roleOrTitle,
      appointmentDate: body.appointmentDate,
      termType: body.termType || 'permanent',
      isActive: true,
    };

    if (body.id) {
      try {
        await db.update(schema.appointments).set(appointmentValues).where(eq(schema.appointments.id, body.id));
      } catch (err: any) {
        throw new Error(`[DB_ERROR] appointments UPDATE failed: ${err.message}`);
      }
      if (actor?.id) await logAudit(c.env, actor.id, 'UPDATE', 'appointments', body.id, appointmentValues);
    } else {
      try {
        await db.insert(schema.appointments).values({ ...appointmentValues, id: appointmentId, createdAt: new Date() });
      } catch (err: any) {
        throw new Error(`[DB_ERROR] appointments INSERT failed: ${err.message}`);
      }
      if (actor?.id) await logAudit(c.env, actor.id, 'CREATE', 'appointments', appointmentId, { employeeId: body.employeeId, accountId });
    }

    // 3. Access: exactly the grants the caller asked for, and nothing implied.
    // This once auto-granted every permission in the system whenever
    // body.roleOrTitle happened to be the string 'CEO' — a free-text field on
    // the request deciding superadmin-equivalent access.
    if (accountId) await applyPermissions(c, accountId, body.permissions);

    // 4. Auto-grant CRM member access if committee is assigned
    if (body.committeeId && body.employeeId) {
      const existingMember = await db.query.committeeMembers.findFirst({
        where: and(eq(schema.committeeMembers.committeeId, body.committeeId), eq(schema.committeeMembers.employeeId, body.employeeId)),
      });
      if (!existingMember) {
        await db.insert(schema.committeeMembers).values({
          committeeId: body.committeeId,
          employeeId: body.employeeId,
          roleInCommittee: body.roleOrTitle,
          joinedAt: body.appointmentDate || new Date().toISOString(),
        });
      }
      
      // CRM access follows from committee membership — see the committee rule in
      // src/middleware/rbac.ts — so no per-user grants are written here.
    }

    // 5. Dashboard access comes from the assigned role.

    return ok(c, { success: true, accountId, appointmentId });
  } catch (err: any) {
    const errorBody = await (async () => {
      try { return await c.req.json(); } catch { return {}; }
    })();
    console.error('[ERROR] Provisioning failed, body:', JSON.stringify(errorBody, null, 2));
    console.error('[ERROR] Error details:', err);
    
    const msg = err.message || 'Internal server error';
    if (msg.includes('FOREIGN KEY constraint failed')) {
      return c.json({ success: false, error: 'Database constraint violation: invalid employee, committee, or account ID.' }, 400);
    }
    if (msg.includes('UNIQUE constraint failed')) {
      return c.json({ success: false, error: 'Database constraint violation: email, username, or appointment already exists.' }, 400);
    }
    
    return c.json({ success: false, error: msg }, 500);
  }
});

hrRouter.get('/appointments/:id', requireFeatureAccess('hr', 'appointments', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.appointments.findFirst({ where: eq(schema.appointments.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/appointments/:id', requireFeatureAccess('hr', 'appointments', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.appointments).set(body).where(eq(schema.appointments.id, id!));
    await logAudit(c.env, user.id, 'UPDATE', 'appointments', id!, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

hrRouter.delete('/appointments/:id', requireFeatureAccess('hr', 'appointments', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id')!;

    // 1. Find appointment to get accountId
    const appointment = await db.query.appointments.findFirst({
      where: eq(schema.appointments.id, id)
    });

    // 2. Deactivate linked account if it exists
    if (appointment?.accountId) {
      await db.update(schema.usersLogins)
        .set({ isActive: false })
        .where(eq(schema.usersLogins.id, appointment.accountId));
      await logAudit(c.env, user.id, 'UPDATE', 'users_logins', appointment.accountId, { action: 'deactivate_via_appointment_delete', appointmentId: id });
    }

    // 3. Delete appointment
    await db.delete(schema.appointments).where(eq(schema.appointments.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'appointments', id);
    return ok(c, { id, deleted: true });
  } catch (err: any) { 
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return serverError(c, new Error('Cannot delete appointment: it is referenced by other records.'));
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
