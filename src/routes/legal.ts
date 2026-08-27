import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess, requireFeatureAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';

const legalRouter = new Hono<{ Bindings: Env }>();
legalRouter.use('*', authMiddleware);
legalRouter.use('*', requireAppAccess('legal'));

/* ── LEGAL TEMPLATES ── */
legalRouter.get('/templates', requireFeatureAccess('legal', 'templates', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.legalTemplates.findMany()); }
  catch (err) { return serverError(c, err); }
});
legalRouter.post('/templates', requireFeatureAccess('legal', 'templates', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('tmpl');
    await db.insert(schema.legalTemplates).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'legal_templates', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/templates/:id', requireFeatureAccess('legal', 'templates', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.legalTemplates.findFirst({ where: eq(schema.legalTemplates.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
legalRouter.patch('/templates/:id', requireFeatureAccess('legal', 'templates', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    await db.update(schema.legalTemplates).set(body).where(eq(schema.legalTemplates.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'legal_templates', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.delete('/templates/:id', requireFeatureAccess('legal', 'templates', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.legalTemplates).where(eq(schema.legalTemplates.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'legal_templates', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── PARTIES & STAKEHOLDERS ── */
legalRouter.get('/parties', requireFeatureAccess('legal', 'parties', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.partiesStakeholders.findMany()); }
  catch (err) { return serverError(c, err); }
});
legalRouter.post('/parties', requireFeatureAccess('legal', 'parties', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('party');
    await db.insert(schema.partiesStakeholders).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'parties_stakeholders', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/parties/:id', requireFeatureAccess('legal', 'parties', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.partiesStakeholders.findFirst({ where: eq(schema.partiesStakeholders.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
legalRouter.patch('/parties/:id', requireFeatureAccess('legal', 'parties', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.partiesStakeholders).set(body).where(eq(schema.partiesStakeholders.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'parties_stakeholders', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.delete('/parties/:id', requireFeatureAccess('legal', 'parties', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.partiesStakeholders).where(eq(schema.partiesStakeholders.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'parties_stakeholders', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── ACTIVE AGREEMENTS ── */
legalRouter.get('/agreements', requireFeatureAccess('legal', 'agreements', 'view'), async (c) => {
  try {
    const { status } = c.req.query();
    const rows = await getDb(c.env).query.activeAgreements.findMany({
      where: status ? eq(schema.activeAgreements.status, status) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
legalRouter.post('/agreements', requireFeatureAccess('legal', 'agreements', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const { agreementName, contractType, effectiveDate, expiryDate, autoRenewal, paymentTerms, status, signedDoc, committeeId, templateId, clientId } = await c.req.json();
    const id = generateId('agmt');
    await db.insert(schema.activeAgreements).values({
      id, agreementName, contractType, effectiveDate, expiryDate, 
      autoRenewal: !!autoRenewal, paymentTerms, status, signedDoc, 
      committeeId, templateId, clientId, createdAt: new Date()
    });
    await logAudit(c.env, user.id, 'CREATE', 'active_agreements', id, { agreementName, contractType, effectiveDate, expiryDate, autoRenewal, paymentTerms, status, signedDoc, committeeId, templateId, clientId });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/agreements/:id', requireFeatureAccess('legal', 'agreements', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.activeAgreements.findFirst({ where: eq(schema.activeAgreements.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
legalRouter.patch('/agreements/:id', requireFeatureAccess('legal', 'agreements', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.activeAgreements).set(body).where(eq(schema.activeAgreements.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'active_agreements', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.delete('/agreements/:id', requireFeatureAccess('legal', 'agreements', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.activeAgreements).where(eq(schema.activeAgreements.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'active_agreements', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── AGREEMENT PARTIES ── */
legalRouter.post('/agreements/:id/parties', requireFeatureAccess('legal', 'agreements', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const agreementId = c.req.param('id');
    const body = await c.req.json<{ partyId: string; partyRole?: string }>();
    await db.insert(schema.agreementParties).values({ agreementId, ...body });
    await logAudit(c.env, user.id, 'CREATE', 'agreement_parties', agreementId, body);
    return created(c, { agreementId, partyId: body.partyId });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/agreements/:id/parties', requireFeatureAccess('legal', 'agreements', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env).query.agreementParties.findMany({
      where: eq(schema.agreementParties.agreementId, c.req.param('id')),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/* ── COMPLIANCE OBLIGATIONS ── */
legalRouter.get('/compliance', requireFeatureAccess('legal', 'compliance', 'view'), async (c) => {
  try {
    const { status } = c.req.query();
    const rows = await getDb(c.env).query.complianceObligations.findMany({
      where: status ? eq(schema.complianceObligations.status, status) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
legalRouter.post('/compliance', requireFeatureAccess('legal', 'compliance', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('obl');
    await db.insert(schema.complianceObligations).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'compliance_obligations', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/compliance/:id', requireFeatureAccess('legal', 'compliance', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.complianceObligations.findFirst({ where: eq(schema.complianceObligations.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
legalRouter.patch('/compliance/:id', requireFeatureAccess('legal', 'compliance', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.complianceObligations).set(body).where(eq(schema.complianceObligations.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'compliance_obligations', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.delete('/compliance/:id', requireFeatureAccess('legal', 'compliance', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.complianceObligations).where(eq(schema.complianceObligations.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'compliance_obligations', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── LEGAL REQUESTS ── */
legalRouter.get('/requests', requireFeatureAccess('legal', 'requests', 'view'), async (c) => {
  try {
    const { status, priority } = c.req.query();
    const rows = await getDb(c.env).query.legalRequests.findMany({
      where: and(
        status ? eq(schema.legalRequests.status, status) : undefined,
        priority ? eq(schema.legalRequests.priority, priority) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
legalRouter.post('/requests', requireFeatureAccess('legal', 'requests', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('lreq');
    await db.insert(schema.legalRequests).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'legal_requests', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/requests/:id', requireFeatureAccess('legal', 'requests', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.legalRequests.findFirst({ where: eq(schema.legalRequests.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
legalRouter.patch('/requests/:id', requireFeatureAccess('legal', 'requests', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.legalRequests).set(body).where(eq(schema.legalRequests.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'legal_requests', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.delete('/requests/:id', requireFeatureAccess('legal', 'requests', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.legalRequests).where(eq(schema.legalRequests.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'legal_requests', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── INTELLECTUAL PROPERTY ── */
legalRouter.get('/ip', requireFeatureAccess('legal', 'ip', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.intellectualProperty.findMany()); }
  catch (err) { return serverError(c, err); }
});
legalRouter.post('/ip', requireFeatureAccess('legal', 'ip', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('ip');
    await db.insert(schema.intellectualProperty).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'intellectual_property', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/ip/:id', requireFeatureAccess('legal', 'ip', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.intellectualProperty.findFirst({ where: eq(schema.intellectualProperty.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
legalRouter.patch('/ip/:id', requireFeatureAccess('legal', 'ip', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.intellectualProperty).set(body).where(eq(schema.intellectualProperty.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'intellectual_property', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.delete('/ip/:id', requireFeatureAccess('legal', 'ip', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.intellectualProperty).where(eq(schema.intellectualProperty.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'intellectual_property', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── LEGAL SOPS ── */
legalRouter.get('/sops', requireFeatureAccess('legal', 'sops', 'view'), async (c) => {
  try { return ok(c, await getDb(c.env).query.legalSops.findMany()); }
  catch (err) { return serverError(c, err); }
});
legalRouter.post('/sops', requireFeatureAccess('legal', 'sops', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('sop');
    await db.insert(schema.legalSops).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'legal_sops', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.get('/sops/:id', requireFeatureAccess('legal', 'sops', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.legalSops.findFirst({ where: eq(schema.legalSops.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
legalRouter.patch('/sops/:id', requireFeatureAccess('legal', 'sops', 'edit'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.legalSops).set(body).where(eq(schema.legalSops.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'legal_sops', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
legalRouter.delete('/sops/:id', requireFeatureAccess('legal', 'sops', 'delete'), async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.legalSops).where(eq(schema.legalSops.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'legal_sops', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default legalRouter;
