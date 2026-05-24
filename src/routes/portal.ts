import { Hono } from 'hono';
import { eq, and, or } from 'drizzle-orm';
import { sign, verify } from 'hono/jwt';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { generateId } from '../utils/id';
import { ok, badRequest, notFound, serverError } from '../utils/response';

const portalRouter = new Hono<{ Bindings: Env; Variables: { client: { id: string; clientId: string; name: string; type: string } } }>();

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function clientAuth(c: any, next: any) {
  const h = c.req.header('Authorization');
  if (!h?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const p = await verify(h.split(' ')[1], c.env.JWT_SECRET, 'HS256');
    if (p.type !== 'client') return c.json({ error: 'Invalid token' }, 401);
    c.set('client', { id: p.id, clientId: p.clientId, name: p.name, type: 'client' });
    return await next();
  } catch { return c.json({ error: 'Invalid token' }, 401); }
}

portalRouter.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return badRequest(c, 'email and password required');
    const db = getDb(c.env);
    const cl = await db.query.clientLogins.findFirst({
      where: eq(schema.clientLogins.email, email.toLowerCase().trim()),
      with: { client: true },
    });
    if (!cl) return c.json({ error: 'Invalid credentials' }, 401);
    if (!cl.isActive) return c.json({ error: 'Account deactivated' }, 401);
    if (cl.lockedUntil && new Date(cl.lockedUntil) > new Date()) {
      return c.json({ error: 'Account locked. Try later.' }, 429);
    }
    const hash = await sha256hex(password);
    if (cl.passwordHash !== hash) {
      const att = (cl.failedAttempts ?? 0) + 1;
      await db.update(schema.clientLogins).set({
        failedAttempts: att,
        lockedUntil: att >= 5 ? new Date(Date.now() + 900000) : null,
      }).where(eq(schema.clientLogins.id, cl.id));
      return c.json({ error: 'Invalid credentials' }, 401);
    }
    await db.update(schema.clientLogins).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.clientLogins.id, cl.id));
    const now = Math.floor(Date.now() / 1000);
    const token = await sign({ id: cl.id, clientId: cl.clientId, name: cl.name || (cl as any).client?.clientName, type: 'client', iat: now, exp: now + 28800 }, c.env.JWT_SECRET, 'HS256');
    return ok(c, { token, expiresIn: 28800, client: { id: cl.id, clientId: cl.clientId, email: cl.email, name: cl.name, companyName: (cl as any).client?.clientName } });
  } catch (err) { return serverError(c, err); }
});

portalRouter.get('/whoami', clientAuth, (c) => ok(c, c.get('client')));

portalRouter.get('/committees', clientAuth, async (c) => {
  try {
    const client = c.get('client');
    const db = getDb(c.env);
    const comms = await db.query.committees.findMany({ 
      where: eq(schema.committees.clientId, client.clientId),
      with: { lab: true }
    });
    return ok(c, comms);
  } catch (err) { return serverError(c, err); }
});

portalRouter.get('/tickets', clientAuth, async (c) => {
  try {
    const client = c.get('client');
    const db = getDb(c.env);
    const comms = await db.query.committees.findMany({ where: eq(schema.committees.clientId, client.clientId) });
    const all: any[] = [];
    for (const cm of comms) {
      const t = await db.query.crmTickets.findMany({ where: eq(schema.crmTickets.committeeId, cm.id) });
      all.push(...t);
    }
    return ok(c, all);
  } catch (err) { return serverError(c, err); }
});

portalRouter.post('/tickets', clientAuth, async (c) => {
  try {
    const client = c.get('client');
    const db = getDb(c.env);
    const body = await c.req.json<{ title: string; description?: string; priority?: string; category?: string; committeeId: string }>();
    if (!body.title || !body.committeeId) return badRequest(c, 'title and committeeId required');
    const comm = await db.query.committees.findFirst({ where: and(eq(schema.committees.id, body.committeeId), eq(schema.committees.clientId, client.clientId)) });
    if (!comm) return c.json({ error: 'Access denied' }, 403);
    const id = generateId('tkt');
    const now = new Date();
    await db.insert(schema.crmTickets).values({ id, title: body.title, description: body.description || null, priority: body.priority || 'medium', category: body.category || 'support', status: 'open', raisedByType: 'client', raisedById: client.id, committeeId: body.committeeId, createdAt: now, updatedAt: now });
    return ok(c, { id, status: 'open' }, 201);
  } catch (err) { return serverError(c, err); }
});

portalRouter.get('/tickets/:id', clientAuth, async (c) => {
  try {
    const client = c.get('client');
    const db = getDb(c.env);
    const t = await db.query.crmTickets.findFirst({ where: eq(schema.crmTickets.id, c.req.param('id')) });
    if (!t) return notFound(c);
    const comm = await db.query.committees.findFirst({ where: and(eq(schema.committees.id, t.committeeId), eq(schema.committees.clientId, client.clientId)) });
    if (!comm) return c.json({ error: 'Access denied' }, 403);
    return ok(c, t);
  } catch (err) { return serverError(c, err); }
});

portalRouter.delete('/tickets/:id', clientAuth, async (c) => {
  try {
    const client = c.get('client');
    const db = getDb(c.env);
    const id = c.req.param('id');
    const t = await db.query.crmTickets.findFirst({ where: eq(schema.crmTickets.id, id) });
    if (!t) return notFound(c);
    
    // Check if ticket belongs to a committee owned by this client
    const comm = await db.query.committees.findFirst({ where: and(eq(schema.committees.id, t.committeeId), eq(schema.committees.clientId, client.clientId)) });
    if (!comm) return c.json({ error: 'Access denied' }, 403);

    // Delete related notes
    await db.delete(schema.crmTicketNotes).where(eq(schema.crmTicketNotes.ticketId, id));
    // Delete ticket
    await db.delete(schema.crmTickets).where(eq(schema.crmTickets.id, id));
    
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default portalRouter;
