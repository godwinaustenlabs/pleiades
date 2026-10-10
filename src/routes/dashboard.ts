import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { actorEmployeeId, requireAppAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';
import { logAudit } from '../utils/audit';
import * as time from '../time/store';
import { TimeError } from '../time/store';
import { isIsoDate } from '../time/clock';
import { workspaceTasks } from '../tasks/workspace';

const dashboardRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
dashboardRouter.use('*', authMiddleware);
dashboardRouter.use('*', requireAppAccess('dashboard'));

/* ── GET /dashboard/me — Aggregated user dashboard ── */
dashboardRouter.get('/me', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);

    /**
     * The employee this login belongs to, read from the database.
     *
     * Not `user.employeeId`, which is the token's copy and can be a week stale — so
     * somebody newly linked to an employee record saw an empty workspace until their
     * session rolled over, and everything below (tasks, posts, committees, the
     * avatar) keyed off the wrong person if they had been relinked.
     */
    const employeeId = await actorEmployeeId(c);

    let employeeRecord = null;
    if (employeeId) {
      employeeRecord = await db.query.employees.findFirst({
        where: eq(schema.employees.id, employeeId),
      });
    }

    /**
     * Every active appointment this person holds — all of them, in one workspace.
     *
     * Matched on employee id alone. The `account_id = user.id` branch that used to
     * sit beside it dated from logins being per appointment, which is exactly what
     * made somebody with two posts see one of them here and have to sign into
     * another account for the other. Migration 0047 removed the column.
     */
    const appointments = employeeId
      ? await db.query.appointments.findMany({
          where: and(
            eq(schema.appointments.employeeId, employeeId),
            eq(schema.appointments.isActive, true),
          ),
        })
      : [];

    // Get committee memberships
    const committees = employeeId
      ? await db.query.committeeMembers.findMany({
          where: eq(schema.committeeMembers.employeeId, employeeId),
          with: { committee: true },
        })
      : [];

    // Assigned, plus every task on a post held or a committee sat on — the same
    // set the workspace Kanban shows (src/tasks/workspace.ts).
    const allTasks = await workspaceTasks(db, employeeId);

    // Get dashboard state
    const dashState = await db.query.userDashboardState.findFirst({
      where: eq(schema.userDashboardState.userId, user.id),
    });

    // Update last accessed
    if (dashState) {
      await db.update(schema.userDashboardState).set({ lastAccessed: new Date(), updatedAt: new Date() }).where(eq(schema.userDashboardState.userId, user.id));
    } else {
      const now = new Date();
      await db.insert(schema.userDashboardState).values({ userId: user.id, lastAccessed: now, createdAt: now, updatedAt: now });
    }

    return ok(c, {
      user: { 
        id: user.id,  
        employeeId: employeeId,
        avatarUrl: employeeRecord?.profilePhoto || null
      },
      employee: employeeRecord || null,
      stats: { 
        totalTasks: allTasks.length, 
        completedTasks: allTasks.filter(t => t.status === 'completed').length, 
        inProgressTasks: allTasks.filter(t => t.status === 'in_progress').length, 
        todoTasks: allTasks.filter(t => t.status === 'todo').length, 
        blockedTasks: allTasks.filter(t => t.status === 'blocked').length,
      },
      tasks: allTasks.slice(0, 50),
      appointments,
      committees: committees.map((cm: any) => ({ ...cm, committeeName: cm.committee?.committeeName })),
      preferences: dashState?.preferences ? JSON.parse(dashState.preferences) : {},
      calendarToken: (await db.query.calendarFeeds.findFirst({ where: eq(schema.calendarFeeds.userId, user.id) }))?.token || null,
    });
  } catch (err) { return serverError(c, err); }
});

/**
 * ── TIME (self-service) ──
 *
 * The play/pause log. Time is per EMPLOYEE, not per post: somebody holding two
 * appointments logs once, as themselves. The employee is resolved from the database
 * via `actorEmployeeId` rather than read off the token, because a stale or relinked
 * claim would file time against the wrong person — a record that is wrong and looks
 * right.
 *
 * Wording is deliberate throughout, here and in the UI: start / pause / done for
 * now. Pay is per task and nobody owes hours, so there is no clock-in, no shift and
 * no "late". See docs/attendance-design.md.
 */
async function timeRoute(c: any, fn: (employeeId: string, db: D1Database, now: number) => Promise<Response>) {
  try {
    const employeeId = await actorEmployeeId(c);
    // A login with no employee record (an admin account, a contractor) has no time
    // to show: reads answer null so the workspace simply hides the widget, writes refuse.
    if (!employeeId) {
      return c.req.method === 'GET' ? ok(c, null) : badRequest(c, 'Your login is not linked to an employee record');
    }
    return await fn(employeeId, c.env.DB, Date.now());
  } catch (err) {
    if (err instanceof TimeError) {
      // A conflict carries the current state, so a second tab corrects itself
      // from the refusal instead of needing another round trip.
      if (err.status === 409) {
        const employeeId = await actorEmployeeId(c);
        const state = employeeId ? await time.getState(c.env.DB, employeeId, Date.now()) : null;
        return c.json({ success: false, error: err.message, data: state }, 409);
      }
      return c.json({ success: false, error: err.message }, err.status);
    }
    return serverError(c, err);
  }
}

dashboardRouter.get('/time/state', (c) => timeRoute(c, async (employeeId, db, now) => ok(c, {
  ...(await time.getState(db, employeeId, now)),
  autoClosed: await time.recentAutoClosed(db, employeeId, now),
})));

for (const action of ['start', 'pause', 'resume', 'switch', 'done'] as const) {
  dashboardRouter.post(`/time/${action}`, (c) => timeRoute(c, async (employeeId, db, now) => {
    const body = await c.req.json().catch(() => ({}));
    const state = await time.transition(db, employeeId, action, { taskId: body?.taskId }, now);
    await logAudit(c.env, c.get('user').id, action === 'start' ? 'CREATE' : 'UPDATE', 'time_entries',
      state.openEntry?.id ?? employeeId, { action, taskId: state.openEntry?.taskId ?? null });
    return ok(c, state);
  }));
}

dashboardRouter.get('/time/tasks', (c) => timeRoute(c, async (employeeId, db) => ok(c, await time.loggableTasks(db, employeeId))));

dashboardRouter.get('/time/days', (c) => timeRoute(c, async (employeeId, db, now) => {
  const tz = await time.employeeTimezone(db, employeeId);
  const range = time.defaultRange(now, tz);
  const from = isIsoDate(c.req.query('from')) ? c.req.query('from')! : range.from;
  const to = isIsoDate(c.req.query('to')) ? c.req.query('to')! : range.to;
  return ok(c, { timezone: tz, from, to, days: await time.listDays(db, employeeId, from, to) });
}));

dashboardRouter.get('/time/days/:date', (c) => timeRoute(c, async (employeeId, db, now) => {
  const date = c.req.param('date');
  if (!isIsoDate(date)) return badRequest(c, 'date must be YYYY-MM-DD');
  const day = await time.dayByDate(db, employeeId, date);
  if (!day) return ok(c, null);
  return ok(c, await time.dayDetail(db, day, now));
}));

dashboardRouter.get('/time/missed', (c) => timeRoute(c, async (employeeId, db, now) =>
  ok(c, await time.missedDays(db, c.get('user').id, employeeId, now))));

/* Own entries. Self-service covers the last 14 days; older is a head's or HR's job. */
dashboardRouter.post('/time/entries', (c) => timeRoute(c, async (employeeId, db, now) => {
  const body = await c.req.json();
  const entry = await time.addManual(db, employeeId, body, now, { beyondWindow: false });
  await logAudit(c.env, c.get('user').id, 'CREATE', 'time_entries', entry.id, body);
  return created(c, entry);
}));

dashboardRouter.patch('/time/entries/:id', (c) => timeRoute(c, async (employeeId, db, now) => {
  const entry = await time.getEntry(db, c.req.param('id'));
  if (!entry || entry.employeeId !== employeeId) return notFound(c);
  const body = await c.req.json();
  const updated = await time.editEntry(db, entry, body, now, { beyondWindow: false });
  await logAudit(c.env, c.get('user').id, 'UPDATE', 'time_entries', entry.id, { before: entry, change: body });
  return ok(c, updated);
}));

dashboardRouter.delete('/time/entries/:id', (c) => timeRoute(c, async (employeeId, db, now) => {
  const entry = await time.getEntry(db, c.req.param('id'));
  if (!entry || entry.employeeId !== employeeId) return notFound(c);
  await time.deleteEntry(db, entry, now, { beyondWindow: false });
  await logAudit(c.env, c.get('user').id, 'DELETE', 'time_entries', entry.id, { before: entry });
  return ok(c, { id: entry.id, deleted: true });
}));

/* ── NOTES ── */
dashboardRouter.get('/notes', async (c) => {
  try {
    const user = c.get('user' as any);
    const notes = await getDb(c.env).query.userNotes.findMany({
      where: eq(schema.userNotes.userId, user.id),
      orderBy: [desc(schema.userNotes.updatedAt)],
    });
    return ok(c, notes);
  } catch (err) { return serverError(c, err); }
});

dashboardRouter.post('/notes', async (c) => {
  try {
    const user = c.get('user' as any);
    const db = getDb(c.env);
    const body = await c.req.json<{ title: string; content?: string; color?: string; pinned?: boolean }>();
    if (!body.title) return badRequest(c, 'title required');
    const id = generateId('note');
    const now = new Date();
    await db.insert(schema.userNotes).values({
      id, userId: user.id, title: body.title,
      content: body.content || '', color: body.color || null,
      pinned: body.pinned || false,
      createdAt: now, updatedAt: now,
    });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

dashboardRouter.patch('/notes/:id', async (c) => {
  try {
    const user = c.get('user' as any);
    const db = getDb(c.env);
    const id = c.req.param('id');
    const body = await c.req.json();
    // Verify ownership
    const note = await db.query.userNotes.findFirst({
      where: and(eq(schema.userNotes.id, id), eq(schema.userNotes.userId, user.id)),
    });
    if (!note) return notFound(c);
    await db.update(schema.userNotes).set({ ...body, updatedAt: new Date() }).where(eq(schema.userNotes.id, id));
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

dashboardRouter.delete('/notes/:id', async (c) => {
  try {
    const user = c.get('user' as any);
    const db = getDb(c.env);
    const id = c.req.param('id');
    const note = await db.query.userNotes.findFirst({
      where: and(eq(schema.userNotes.id, id), eq(schema.userNotes.userId, user.id)),
    });
    if (!note) return notFound(c);
    await db.delete(schema.userNotes).where(eq(schema.userNotes.id, id));
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── PREFERENCES ── */
dashboardRouter.get('/preferences', async (c) => {
  try {
    const user = c.get('user' as any);
    const state = await getDb(c.env).query.userDashboardState.findFirst({
      where: eq(schema.userDashboardState.userId, user.id),
    });
    return ok(c, state?.preferences ? JSON.parse(state.preferences) : {});
  } catch (err) { return serverError(c, err); }
});

dashboardRouter.patch('/preferences', async (c) => {
  try {
    const user = c.get('user' as any);
    const db = getDb(c.env);
    const body = await c.req.json();
    const existing = await db.query.userDashboardState.findFirst({
      where: eq(schema.userDashboardState.userId, user.id),
    });
    const prefs = JSON.stringify(body);
    if (existing) {
      await db.update(schema.userDashboardState).set({ preferences: prefs, updatedAt: new Date() }).where(eq(schema.userDashboardState.userId, user.id));
    } else {
      const now = new Date();
      await db.insert(schema.userDashboardState).values({ userId: user.id, preferences: prefs, createdAt: now, updatedAt: now });
    }
    return ok(c, { updated: true });
  } catch (err) { return serverError(c, err); }
});

/* ── CALENDAR SYNC ── */
dashboardRouter.get('/calendar/token', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);
    
    let feed = await db.query.calendarFeeds.findFirst({
      where: eq(schema.calendarFeeds.userId, user.id),
    });

    if (!feed) {
      const id = generateId('cal');
      const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      const now = new Date();
      await db.insert(schema.calendarFeeds).values({
        id, userId: user.id, token, createdAt: now, updatedAt: now
      });
      feed = { id, userId: user.id, token, createdAt: now, updatedAt: now };
    }

    return ok(c, { token: feed.token });
  } catch (err) { return serverError(c, err); }
});

dashboardRouter.post('/calendar/token/reset', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const existing = await db.query.calendarFeeds.findFirst({
      where: eq(schema.calendarFeeds.userId, user.id),
    });

    if (existing) {
      await db.update(schema.calendarFeeds)
        .set({ token, updatedAt: new Date() })
        .where(eq(schema.calendarFeeds.userId, user.id));
    } else {
      await db.insert(schema.calendarFeeds).values({
        id: generateId('cal'),
        userId: user.id,
        token,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return ok(c, { token });
  } catch (err) { 
    console.error('Calendar token reset error:', err);
    return serverError(c, err); 
  }
});

export default dashboardRouter;

