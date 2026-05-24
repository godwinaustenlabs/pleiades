import { Hono } from 'hono';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess, APP_FEATURES, checkFeaturePermission } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';

const crmRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
crmRouter.use('*', authMiddleware);
crmRouter.use('*', requireAppAccess('crm'));

/**
 * GET /crm/my-committees
 * Returns only the committees the current user is a member of.
 */
crmRouter.get('/my-committees', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);

    const memberships = await db.query.committeeMembers.findMany({
      where: eq(schema.committeeMembers.employeeId, user.employeeId!),
      with: {
        committee: true,
      },
    });

    const committees = memberships.map((m) => m.committee).filter(Boolean);
    return ok(c, committees);
  } catch (err) { return serverError(c, err); }
});

crmRouter.post('/provision', requireAppAccess('ops'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const { committeeId, employeeIds } = await c.req.json<{ committeeId: string; employeeIds: string[] }>();

    if (!committeeId || !employeeIds) return badRequest(c, 'committeeId and employeeIds required');

    for (const empId of employeeIds) {
      await db.insert(schema.committeeMembers).values({
        committeeId,
        employeeId: empId,
        roleInCommittee: 'Member',
        joinedAt: new Date().toISOString(),
      }).onConflictDoNothing();
    }

    await logAudit(c.env, user.id, 'PROVISION', 'committee_members', committeeId, { employeeIds });
    return ok(c, { provisioned: employeeIds.length });
  } catch (err) { return serverError(c, err); }
});

crmRouter.delete('/deprovision/:committeeId', requireAppAccess('ops'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const committeeId = c.req.param('committeeId');

    if (!committeeId) return badRequest(c, 'committeeId required');

    // 1. Delete memberships
    await db.delete(schema.committeeMembers).where(eq(schema.committeeMembers.committeeId, committeeId));
    
    // 2. Delete tickets (cascade would be better, but we'll do it manually if needed)
    // Actually, we'll just remove the committee from CRM context by deleting memberships
    // If the user wants to delete EVERYTHING associated with it:
    await db.delete(schema.crmTickets).where(eq(schema.crmTickets.committeeId, committeeId));
    await db.delete(schema.crmDocuments).where(eq(schema.crmDocuments.committeeId, committeeId));
    await db.delete(schema.crmPlannerEvents).where(eq(schema.crmPlannerEvents.committeeId, committeeId));

    await logAudit(c.env, user.id, 'DEPROVISION', 'committees', committeeId, { action: 'full_crm_cleanup' });
    return ok(c, { deprovisioned: true });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TICKETS
   ═══════════════════════════════════════════════════════════════ */

crmRouter.get('/committees/:id/tickets', requireFeatureAccess('crm', 'tickets', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const committeeId = c.req.param('id');
    const { status, priority } = c.req.query();
    const rows = await db.query.crmTickets.findMany({
      where: and(
        eq(schema.crmTickets.committeeId, committeeId!),
        status ? eq(schema.crmTickets.status, status) : undefined,
        priority ? eq(schema.crmTickets.priority, priority) : undefined,
      ),
      orderBy: [desc(schema.crmTickets.createdAt)],
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

crmRouter.post('/committees/:id/tickets', requireFeatureAccess('crm', 'tickets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const committeeId = c.req.param('id');
    const body = await c.req.json();
    const id = generateId('tkt');
    const now = new Date();
    await db.insert(schema.crmTickets).values({
      ...body, id, committeeId,
      raisedByType: 'employee', raisedById: user.id,
      status: body.status || 'open',
      createdAt: now, updatedAt: now,
    });
    await logAudit(c.env, user.id, 'CREATE', 'crm_tickets', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

crmRouter.get('/tickets/:id', requireFeatureAccess('crm', 'tickets', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.crmTickets.findFirst({
      where: eq(schema.crmTickets.id, c.req.param('id')!),
    });
    if (!row) return notFound(c);
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

crmRouter.patch('/tickets/:id', requireFeatureAccess('crm', 'tickets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    const updates: any = { ...body, updatedAt: new Date() };
    if (body.status === 'resolved') updates.resolvedAt = new Date();
    await db.update(schema.crmTickets).set(updates).where(eq(schema.crmTickets.id, id!));
    await logAudit(c.env, user.id, 'UPDATE', 'crm_tickets', id!, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

crmRouter.delete('/tickets/:id', requireFeatureAccess('crm', 'tickets', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    
    // Delete child notes first
    await db.delete(schema.crmTicketNotes).where(eq(schema.crmTicketNotes.ticketId, id!));
    // Delete the ticket
    await db.delete(schema.crmTickets).where(eq(schema.crmTickets.id, id!));
    
    await logAudit(c.env, user.id, 'DELETE', 'crm_tickets', id!);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   DOCUMENTS
   ═══════════════════════════════════════════════════════════════ */

crmRouter.get('/committees/:id/documents', requireFeatureAccess('crm', 'documents', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.crmDocuments.findMany({
      where: eq(schema.crmDocuments.committeeId, c.req.param('id')!),
      orderBy: [desc(schema.crmDocuments.createdAt)],
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

crmRouter.post('/committees/:id/documents', requireFeatureAccess('crm', 'documents', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const committeeId = c.req.param('id');
    const body = await c.req.json();
    const id = generateId('cdoc');
    await db.insert(schema.crmDocuments).values({
      ...body, id, committeeId,
      uploadedById: user.id,
      createdAt: new Date(),
    });
    await logAudit(c.env, user.id, 'CREATE', 'crm_documents', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

// R2 presigned upload logic - gated by documents edit
crmRouter.post('/committees/:id/documents/upload', requireFeatureAccess('crm', 'documents', 'edit'), async (c) => {
  try {
    const committeeId = c.req.param('id');
    const { filename } = await c.req.json<{ filename: string }>();
    if (!filename) return badRequest(c, 'filename required');
    const r2Key = `crm/${committeeId}/${Date.now()}_${filename}`;
    return ok(c, { r2Key, uploadUrl: `/api/assets/upload/${r2Key}` });
  } catch (err) { return serverError(c, err); }
});

crmRouter.patch('/documents/:id', requireFeatureAccess('crm', 'documents', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.crmDocuments).set(body).where(eq(schema.crmDocuments.id, id!));
    await logAudit(c.env, user.id, 'UPDATE', 'crm_documents', id!, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

crmRouter.delete('/documents/:id', requireFeatureAccess('crm', 'documents', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    await db.delete(schema.crmDocuments).where(eq(schema.crmDocuments.id, id!));
    await logAudit(c.env, user.id, 'DELETE', 'crm_documents', id!);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   PLANNER EVENTS
   ═══════════════════════════════════════════════════════════════ */

crmRouter.get('/committees/:id/planner', requireFeatureAccess('crm', 'planner', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.crmPlannerEvents.findMany({
      where: eq(schema.crmPlannerEvents.committeeId, c.req.param('id')!),
      orderBy: [desc(schema.crmPlannerEvents.createdAt)],
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

crmRouter.post('/committees/:id/planner', requireFeatureAccess('crm', 'planner', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const committeeId = c.req.param('id');
    const body = await c.req.json();
    const id = generateId('evt');
    const now = new Date();
    await db.insert(schema.crmPlannerEvents).values({
      ...body, id, committeeId,
      createdById: user.id,
      createdAt: now, updatedAt: now,
    });
    await logAudit(c.env, user.id, 'CREATE', 'crm_planner_events', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

crmRouter.patch('/planner/:id', requireFeatureAccess('crm', 'planner', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json();
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.crmPlannerEvents).set({ ...body, updatedAt: new Date() }).where(eq(schema.crmPlannerEvents.id, id!));
    await logAudit(c.env, user.id, 'UPDATE', 'crm_planner_events', id!, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

crmRouter.delete('/planner/:id', requireFeatureAccess('crm', 'planner', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    await db.delete(schema.crmPlannerEvents).where(eq(schema.crmPlannerEvents.id, id!));
    await logAudit(c.env, user.id, 'DELETE', 'crm_planner_events', id!);
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   MESSAGING & NOTES
   ═══════════════════════════════════════════════════════════════ */

crmRouter.get('/tickets/:id/notes', requireFeatureAccess('crm', 'tickets', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.crmTicketNotes.findMany({
      where: eq(schema.crmTicketNotes.ticketId, c.req.param('id')!),
      orderBy: [desc(schema.crmTicketNotes.createdAt)],
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

crmRouter.post('/tickets/:id/notes', requireFeatureAccess('crm', 'tickets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const ticketId = c.req.param('id');
    const { content } = await c.req.json<{ content: string }>();
    if (!content) return badRequest(c, 'content required');

    const id = generateId('tkn');
    await db.insert(schema.crmTicketNotes).values({
      id,
      ticketId: ticketId!,
      content,
      authorId: user.id,
      createdAt: new Date(),
    });

    await logAudit(c.env, user.id, 'CREATE', 'crm_ticket_notes', id, { ticketId });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

export default crmRouter;
