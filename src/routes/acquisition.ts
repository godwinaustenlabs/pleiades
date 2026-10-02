import { Hono } from 'hono';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';

/**
 * Domains that are never a company, so `companyName` stays empty rather than
 * claiming somebody works at Gmail.
 *
 * Not exhaustive and does not need to be: the cost of a miss is one lead with
 * its domain in the company column, which is visibly wrong and trivially fixed,
 * against the cost of a false company name on every consumer address.
 */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com',
  'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'yandex.com',
  'zoho.com', 'mail.com',
]);

const acquisitionRouter = new Hono<{ Bindings: Env }>();
acquisitionRouter.use('*', authMiddleware);
acquisitionRouter.use('*', requireAppAccess('acquisition'));

/* ── USERS ── */
acquisitionRouter.get('/users', requireFeatureAccess('acquisition', 'tasks', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    // Grants are per user, so ask directly which users hold acquisition.
    const perms = await db.query.userAppPermissions.findMany({
      where: eq(schema.userAppPermissions.appName, 'acquisition'),
    });
    const permittedUserIds = new Set(perms.filter((p) => p.canView).map((p) => p.userId));

    const allUsers = await db.query.usersLogins.findMany({
      with: { employee: true },
      columns: { passwordHash: false }
    });

    const acquisitionUsers = allUsers.filter(u => u.isSuperadmin || permittedUserIds.has(u.id));
    const result = acquisitionUsers.map(u => ({
      id: u.id,
      email: u.email,
      name: u.employee?.name || u.username || u.email,
    }));
    
    return ok(c, result);
  } catch (err) { return serverError(c, err); }
});

/* ── CAMPAIGNS ── */
acquisitionRouter.get('/campaigns', requireFeatureAccess('acquisition', 'campaigns', 'view'), async (c) => {
  try {
    const { status } = c.req.query();
    const rows = await getDb(c.env).query.campaigns.findMany({
      where: status ? eq(schema.campaigns.status, status) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/campaigns', requireFeatureAccess('acquisition', 'campaigns', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('camp');
    await db.insert(schema.campaigns).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'campaigns', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/campaigns/:id', requireFeatureAccess('acquisition', 'campaigns', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.campaigns.findFirst({ where: eq(schema.campaigns.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/campaigns/:id', requireFeatureAccess('acquisition', 'campaigns', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.campaigns).set(body).where(eq(schema.campaigns.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'campaigns', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/campaigns/:id', requireFeatureAccess('acquisition', 'campaigns', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'campaigns', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CONTACTS & LEADS ── */
acquisitionRouter.get('/contacts', requireFeatureAccess('acquisition', 'contacts', 'view'), async (c) => {
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
acquisitionRouter.post('/contacts', requireFeatureAccess('acquisition', 'contacts', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('lead');
    await db.insert(schema.contactsLeads).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'contacts_leads', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
/**
 * POST /acquisition/contacts/intake
 *
 * One captured email from the marketing site's lead magnet, turned into a lead.
 *
 * ## Why this is not `POST /contacts`
 *
 * It is called by another service rather than by a person in a form, and that
 * changes three things:
 *
 *  - **The payload is narrow.** `POST /contacts` spreads the whole body into the
 *    insert, which is fine for an operator who already holds the grant and wrong
 *    for an external caller — it would let the site set `leadScore`,
 *    `contactOwner` or `pipelineStage` to anything. This takes an email, an
 *    optional name, and a source label, and derives the rest here.
 *  - **It has to be idempotent.** A visitor who downloads the guide twice, or a
 *    retry after a timeout, must not produce two leads. Matched on email.
 *  - **It records WHERE the lead came from**, as a `leads_activity` row as well
 *    as `leadSource`, because "came in through the playbook" is the fact that
 *    makes the lead worth calling and it is lost if it only lives in a log line.
 *
 * ## Authorization
 *
 * Nothing new: the site presents `x-api-key`, which `authMiddleware` resolves to
 * the `api_keys` row and the user it acts as, and this route is then gated like
 * any other on `acquisition/contacts` edit. That key names a login holding that
 * one grant and nothing else, so a leaked website key can create leads and
 * cannot read a payslip.
 *
 * Deliberately NOT a second unauthenticated write. `POST /api/webhooks/resend`
 * is the only one of those in the system and its signature is the whole
 * authorization; adding another trust domain for a form submission would be a
 * much larger change than the feature is worth.
 */
acquisitionRouter.post('/contacts/intake', requireFeatureAccess('acquisition', 'contacts', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json().catch(() => ({}));

    const email = String(body?.email ?? '').trim().toLowerCase();
    // Deliberately loose. This is already-validated input arriving from a form
    // that rejected what the browser would not accept, and the cost of being
    // stricter here is dropping a real lead over an address shape we had not
    // thought of. One `@`, something either side, no whitespace.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return badRequest(c, 'A valid email is required.');
    }

    const at = email.lastIndexOf('@');
    const domain = email.slice(at + 1);

    /**
     * `source` says which magnet, and defaults to saying at least that much.
     *
     * Capped and stripped of newlines because it is rendered in a grid and
     * exported to CSV, where an embedded newline becomes a broken row.
     */
    const source = String(body?.source ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
      || 'Website — lead magnet';

    const existing = await db.query.contactsLeads.findFirst({
      where: eq(schema.contactsLeads.email, email),
    });

    if (existing) {
      /**
       * Already a lead. Record the fresh download and leave the lead alone.
       *
       * Overwriting would be worse than doing nothing: somebody may have since
       * set an owner, a stage or a real name, and a second PDF download is not a
       * reason to reset any of that. The repeat interest is the useful part, and
       * it goes on the activity trail.
       */
      const activityId = generateId('act');
      await db.insert(schema.leadsActivity).values({
        id: activityId,
        contactId: existing.id,
        activityType: 'lead_magnet_download',
        notes: `Downloaded again — ${source}`,
        automationTrigger: true,
        timestamp: new Date(),
        createdAt: new Date(),
      });
      await logAudit(c.env, user.id, 'CREATE', 'leads_activity', activityId, { email, source, repeat: true });
      return ok(c, { id: existing.id, created: false, repeat: true });
    }

    const id = generateId('lead');
    await db.insert(schema.contactsLeads).values({
      id,
      /**
       * `fullName` is NOT NULL and we do not know their name, so it holds the
       * ADDRESS rather than a name derived from it.
       *
       * `john.smith@acme.com` becoming "John Smith" is a guess that looks like a
       * fact, and it would be wrong for every `info@`, `hello@` and
       * `firstname.lastname` that is not a person's name. The address is the only
       * thing the visitor actually told us; whoever calls them can put a real
       * name in afterwards.
       */
      fullName: body?.name ? String(body.name).trim().slice(0, 120) : email,
      // The domain is a fact about the address, not an inferred company name, so
      // it is only set when it is plausibly one — a free mail provider is not.
      companyName: FREE_MAIL_DOMAINS.has(domain) ? null : domain,
      email,
      leadSource: source,
      // Every intake lands at the top of the funnel. Anything else would be the
      // site deciding how warm its own leads are.
      pipelineStage: 'new',
      createdAt: new Date(),
    });

    const activityId = generateId('act');
    await db.insert(schema.leadsActivity).values({
      id: activityId,
      contactId: id,
      activityType: 'lead_magnet_download',
      notes: `Captured from ${source}`,
      automationTrigger: true,
      timestamp: new Date(),
      createdAt: new Date(),
    });

    await logAudit(c.env, user.id, 'CREATE', 'contacts_leads', id, { email, source, via: 'intake' });
    return created(c, { id, created: true });
  } catch (err) { return serverError(c, err); }
});

acquisitionRouter.get('/contacts/:id', requireFeatureAccess('acquisition', 'contacts', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.contactsLeads.findFirst({ where: eq(schema.contactsLeads.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/contacts/:id', requireFeatureAccess('acquisition', 'contacts', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.contactsLeads).set(body).where(eq(schema.contactsLeads.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'contacts_leads', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/contacts/:id', requireFeatureAccess('acquisition', 'contacts', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    // Delete associated activities first to avoid foreign key constraint failure
    await db.delete(schema.leadsActivity).where(eq(schema.leadsActivity.contactId, id));
    await db.delete(schema.contactsLeads).where(eq(schema.contactsLeads.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'contacts_leads', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── LEADS ACTIVITY ── */
acquisitionRouter.get('/activity', requireFeatureAccess('acquisition', 'activity', 'view'), async (c) => {
  try {
    const { contact_id } = c.req.query();
    const rows = await getDb(c.env).query.leadsActivity.findMany({
      where: contact_id ? eq(schema.leadsActivity.contactId, contact_id) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/activity', requireFeatureAccess('acquisition', 'activity', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('act');
    await db.insert(schema.leadsActivity).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'leads_activity', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/activity/:id', requireFeatureAccess('acquisition', 'activity', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.leadsActivity.findFirst({ where: eq(schema.leadsActivity.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/activity/:id', requireFeatureAccess('acquisition', 'activity', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.leadsActivity).set(body).where(eq(schema.leadsActivity.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'leads_activity', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/activity/:id', requireFeatureAccess('acquisition', 'activity', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.leadsActivity).where(eq(schema.leadsActivity.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'leads_activity', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── FUNNELS & PIPELINES ── */
acquisitionRouter.get('/funnels', requireFeatureAccess('acquisition', 'funnels', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.funnelsPipelines.findMany()); }
  catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/funnels', requireFeatureAccess('acquisition', 'funnels', 'edit'), async (c) => {
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
acquisitionRouter.get('/funnels/:id', requireFeatureAccess('acquisition', 'funnels', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.funnelsPipelines.findFirst({ where: eq(schema.funnelsPipelines.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/funnels/:id', requireFeatureAccess('acquisition', 'funnels', 'edit'), async (c) => {
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
acquisitionRouter.delete('/funnels/:id', requireFeatureAccess('acquisition', 'funnels', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.funnelsPipelines).where(eq(schema.funnelsPipelines.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'funnels_pipelines', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CONTENT CALENDAR ── */
acquisitionRouter.get('/content', requireFeatureAccess('acquisition', 'content', 'view'), async (c) => {
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
acquisitionRouter.post('/content', requireFeatureAccess('acquisition', 'content', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('cnt');
    await db.insert(schema.contentCalendar).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'content_calendar', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/content/:id', requireFeatureAccess('acquisition', 'content', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.contentCalendar.findFirst({ where: eq(schema.contentCalendar.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/content/:id', requireFeatureAccess('acquisition', 'content', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.contentCalendar).set(body).where(eq(schema.contentCalendar.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'content_calendar', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/content/:id', requireFeatureAccess('acquisition', 'content', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.contentCalendar).where(eq(schema.contentCalendar.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'content_calendar', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── SPRINTS ── */
acquisitionRouter.get('/sprints', requireFeatureAccess('acquisition', 'sprints', 'view'), async (c) => {
  try {
    const { status } = c.req.query();
    const rows = await getDb(c.env).query.sprints.findMany({
      where: status ? eq(schema.sprints.status, status) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/sprints', requireFeatureAccess('acquisition', 'sprints', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('spr');
    await db.insert(schema.sprints).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'sprints', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/sprints/:id', requireFeatureAccess('acquisition', 'sprints', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.sprints.findFirst({ where: eq(schema.sprints.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/sprints/:id', requireFeatureAccess('acquisition', 'sprints', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.sprints).set(body).where(eq(schema.sprints.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'sprints', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/sprints/:id', requireFeatureAccess('acquisition', 'sprints', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.sprints).where(eq(schema.sprints.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'sprints', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── ACQ TASKS ── */
acquisitionRouter.get('/tasks', requireFeatureAccess('acquisition', 'tasks', 'view'), async (c) => {
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
acquisitionRouter.post('/tasks', requireFeatureAccess('acquisition', 'tasks', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('at');
    await db.insert(schema.acqTasks).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'acq_tasks', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/tasks/:id', requireFeatureAccess('acquisition', 'tasks', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.acqTasks.findFirst({ where: eq(schema.acqTasks.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/tasks/:id', requireFeatureAccess('acquisition', 'tasks', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.acqTasks).set(body).where(eq(schema.acqTasks.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'acq_tasks', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/tasks/:id', requireFeatureAccess('acquisition', 'tasks', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.acqTasks).where(eq(schema.acqTasks.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'acq_tasks', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── OUTREACH LOGS ── */
acquisitionRouter.get('/outreach', requireFeatureAccess('acquisition', 'outreach', 'view'), async (c) => {
  try {
    const { date, start_date, end_date } = c.req.query();
    
    if (start_date && end_date) {
      const rows = await getDb(c.env).query.outreachLogs.findMany({
        where: and(
          gte(schema.outreachLogs.date, start_date),
          lte(schema.outreachLogs.date, end_date)
        ),
        orderBy: (fields, { desc }) => [desc(fields.date)]
      });
      return ok(c, rows);
    }

    const rows = await getDb(c.env).query.outreachLogs.findMany({
      where: date ? eq(schema.outreachLogs.date, date) : undefined,
      orderBy: (fields, { desc }) => [desc(fields.createdAt)]
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/outreach', requireFeatureAccess('acquisition', 'outreach', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('out');
    await db.insert(schema.outreachLogs).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'outreach_logs', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.get('/outreach/:id', requireFeatureAccess('acquisition', 'outreach', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.outreachLogs.findFirst({ where: eq(schema.outreachLogs.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/outreach/:id', requireFeatureAccess('acquisition', 'outreach', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.outreachLogs).set(body).where(eq(schema.outreachLogs.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'outreach_logs', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/outreach/:id', requireFeatureAccess('acquisition', 'outreach', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.outreachLogs).where(eq(schema.outreachLogs.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'outreach_logs', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── DEAL PIPELINES ── */
acquisitionRouter.get('/deal-pipelines', requireFeatureAccess('acquisition', 'deals', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.dealPipelines.findMany({
    with: { dealStages: { orderBy: (stages, { asc }) => [asc(stages.orderIndex)] } }
  })); }
  catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/deal-pipelines', requireFeatureAccess('acquisition', 'deals', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('dpip');
    await db.insert(schema.dealPipelines).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'deal_pipelines', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/deal-pipelines/:id', requireFeatureAccess('acquisition', 'deals', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.dealPipelines).set(body).where(eq(schema.dealPipelines.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'deal_pipelines', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/deal-pipelines/:id', requireFeatureAccess('acquisition', 'deals', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    // Also delete stages and deals first
    await db.delete(schema.deals).where(eq(schema.deals.pipelineId, id));
    await db.delete(schema.dealStages).where(eq(schema.dealStages.pipelineId, id));
    await db.delete(schema.dealPipelines).where(eq(schema.dealPipelines.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'deal_pipelines', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── DEAL STAGES ── */
acquisitionRouter.get('/deal-stages', requireFeatureAccess('acquisition', 'deals', 'view'), async (c) => {
  try { 
    const { pipeline_id } = c.req.query();
    const rows = await getDb(c.env).query.dealStages.findMany({
      where: pipeline_id ? eq(schema.dealStages.pipelineId, pipeline_id) : undefined,
      orderBy: (fields, { asc }) => [asc(fields.orderIndex)]
    });
    return ok(c, rows);
  }
  catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/deal-stages', requireFeatureAccess('acquisition', 'deals', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('dstg');
    await db.insert(schema.dealStages).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'deal_stages', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/deal-stages/:id', requireFeatureAccess('acquisition', 'deals', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.dealStages).set(body).where(eq(schema.dealStages.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'deal_stages', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/deal-stages/:id', requireFeatureAccess('acquisition', 'deals', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.deals).where(eq(schema.deals.stageId, id));
    await db.delete(schema.dealStages).where(eq(schema.dealStages.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'deal_stages', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── DEALS ── */
acquisitionRouter.get('/deals', requireFeatureAccess('acquisition', 'deals', 'view'), async (c) => {
  try { 
    const { pipeline_id } = c.req.query();
    const rows = await getDb(c.env).query.deals.findMany({
      where: pipeline_id ? eq(schema.deals.pipelineId, pipeline_id) : undefined,
      with: { contact: true }
    });
    return ok(c, rows);
  }
  catch (err) { return serverError(c, err); }
});
acquisitionRouter.post('/deals', requireFeatureAccess('acquisition', 'deals', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('deal');
    await db.insert(schema.deals).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'deals', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.patch('/deals/:id', requireFeatureAccess('acquisition', 'deals', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.deals).set(body).where(eq(schema.deals.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'deals', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
acquisitionRouter.delete('/deals/:id', requireFeatureAccess('acquisition', 'deals', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.deals).where(eq(schema.deals.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'deals', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default acquisitionRouter;
