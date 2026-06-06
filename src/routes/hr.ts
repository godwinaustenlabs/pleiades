import { Hono } from 'hono';
import { eq, and, or } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { requireAppAccess, APP_FEATURES } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';
import { chunk } from '../utils/batch';

const hrRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
hrRouter.use('*', authMiddleware);
hrRouter.use('*', requireAppAccess('hr'));

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ── SECTORS ── */
hrRouter.get('/sectors', async (c) => {
  try { return ok(c, await getDb(c.env).query.sectors.findMany()); }
  catch (err) { return serverError(c, err); }
});

hrRouter.post('/sectors', async (c) => {
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

hrRouter.get('/sectors/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.sectors.findFirst({ where: eq(schema.sectors.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/sectors/:id', async (c) => {
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

hrRouter.delete('/sectors/:id', async (c) => {
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
hrRouter.get('/appointments', async (c) => {
  try {
    const db = getDb(c.env);
    const { employee_id } = c.req.query();
    const rows = await db.query.appointments.findMany({
      where: employee_id ? eq(schema.appointments.employeeId, employee_id) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

hrRouter.post('/appointments', async (c) => {
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

hrRouter.post('/appointments/provision', async (c) => {
  try {
    const db = getDb(c.env);
    const actor = c.get('user');
    const body = await c.req.json();
    console.log('[DEBUG] Provisioning appointment, body:', JSON.stringify(body, null, 2));
    
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
        updateData.passwordHash = await sha256hex(body.password);
        updateData.passwordUpdatedAt = new Date();
      }
      // If provisioned as CEO, grant superadmin status
      if (body.roleOrTitle?.toUpperCase() === 'CEO') {
        updateData.isSuperadmin = true;
      }
      
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
      const passwordHash = await sha256hex(body.password);
      
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
          roleId: 'role_emp', // Fixed: confirmed 'role_emp' (underscored) exists in remote DB
          employeeId: body.employeeId || null,
          isActive: true,
          isSuperadmin: body.roleOrTitle?.toUpperCase() === 'CEO',
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

    // 3. Setup Granular Permissions
    // body.permissions should be an array of { appName, feature, canView, canEdit, canDelete }
    if (body.permissions && Array.isArray(body.permissions)) {
      // Clear existing permissions for this user before reapplying
      await db.delete(schema.userAppPermissions).where(eq(schema.userAppPermissions.userId, accountId));
      
      const permInserts = body.permissions.map((p: any) => ({
        id: generateId('perm'),
        userId: accountId,
        appName: p.appName,
        feature: p.feature,
        canView: p.canView ?? false,
        canEdit: p.canEdit ?? false,
        canDelete: p.canDelete ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      
      if (permInserts.length > 0) {
        // Batch inserts to avoid "too many SQL variables" error (limit is often 999 or lower in D1)
        const batches = chunk(permInserts, 5);
        for (const b of batches) {
          await db.insert(schema.userAppPermissions).values(b as any);
        }
      }
    } else if (body.roleOrTitle?.toUpperCase() === 'CEO') {
      // Auto-grant ALL permissions for CEO
      await db.delete(schema.userAppPermissions).where(eq(schema.userAppPermissions.userId, accountId));
      const allPerms: any[] = [];
      for (const [app, features] of Object.entries(APP_FEATURES)) {
        for (const feature of features) {
          allPerms.push({
            id: generateId('perm'),
            userId: accountId,
            appName: app,
            feature: feature,
            canView: true,
            canEdit: true,
            canDelete: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
      // Batch inserts to avoid "too many SQL variables" error
      const batches = chunk(allPerms, 5);
      for (const b of batches) {
        await db.insert(schema.userAppPermissions).values(b as any);
      }
    }

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
      
      // Ensure they have 'view' access to 'tickets' and 'tasks' in CRM
      const crmFeatures = ['tickets', 'tasks', 'documents', 'planner'];
      for (const f of crmFeatures) {
        const existing = await db.query.userAppPermissions.findFirst({
          where: and(
            eq(schema.userAppPermissions.userId, accountId),
            eq(schema.userAppPermissions.appName, 'crm'),
            eq(schema.userAppPermissions.feature, f)
          )
        });
        if (!existing) {
          await db.insert(schema.userAppPermissions).values({
            id: generateId('perm'), userId: accountId, appName: 'crm', feature: f, canView: true, canEdit: false, canDelete: false, createdAt: new Date(), updatedAt: new Date(),
          });
        }
      }
    }

    // 5. Ensure basic dashboard access
    const dashFeatures = ['overview', 'notes'];
    for (const f of dashFeatures) {
      const existing = await db.query.userAppPermissions.findFirst({
        where: and(
          eq(schema.userAppPermissions.userId, accountId),
          eq(schema.userAppPermissions.appName, 'dashboard'),
          eq(schema.userAppPermissions.feature, f)
        )
      });
      if (!existing) {
        await db.insert(schema.userAppPermissions).values({
          id: generateId('perm'), userId: accountId, appName: 'dashboard', feature: f, canView: true, canEdit: true, canDelete: true, createdAt: new Date(), updatedAt: new Date(),
        });
      }
    }

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

hrRouter.get('/appointments/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.appointments.findFirst({ where: eq(schema.appointments.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/appointments/:id', async (c) => {
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

hrRouter.delete('/appointments/:id', async (c) => {
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
hrRouter.get('/payroll', async (c) => {
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

hrRouter.post('/payroll', async (c) => {
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

hrRouter.get('/payroll/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.payrollRecords.findFirst({ where: eq(schema.payrollRecords.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/payroll/:id', async (c) => {
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

hrRouter.delete('/payroll/:id', async (c) => {
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
hrRouter.get('/legal-tracker', async (c) => {
  try {
    const db = getDb(c.env);
    const { employee_id } = c.req.query();
    const rows = await db.query.legalTracker.findMany({
      where: employee_id ? eq(schema.legalTracker.employeeId, employee_id) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

hrRouter.post('/legal-tracker', async (c) => {
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

hrRouter.get('/legal-tracker/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.legalTracker.findFirst({ where: eq(schema.legalTracker.id, c.req.param('id')!) });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

hrRouter.patch('/legal-tracker/:id', async (c) => {
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

hrRouter.delete('/legal-tracker/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    await db.delete(schema.legalTracker).where(eq(schema.legalTracker.id, id!));
    await logAudit(c.env, user.id, 'DELETE', 'legal_tracker', id!);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── PERMISSIONS MANAGEMENT (Legacy Access removed) ── */
hrRouter.get('/employees/:id/permissions', async (c) => {
  try {
    const db = getDb(c.env);
    const userId = c.req.param('id');
    const rows = await db.query.userAppPermissions.findMany({
      where: eq(schema.userAppPermissions.userId, userId!),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

export default hrRouter;
