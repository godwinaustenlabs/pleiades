import { Hono } from 'hono';
import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { generateId } from '../utils/id';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';

const dashboardRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
dashboardRouter.use('*', authMiddleware);

/* ── GET /dashboard/me — Aggregated user dashboard ── */
dashboardRouter.get('/me', async (c) => {
  try {
    const user = c.get('user');
    const db = getDb(c.env);

    // Get all tasks assigned to user via task_assignments junction table
    const myAssignments = user.employeeId
      ? await db.query.taskAssignments.findMany({
          where: eq(schema.taskAssignments.employeeId, user.employeeId),
        })
      : [];
    const myTaskIds = myAssignments.map((a: any) => a.taskId);
    const tasks = myTaskIds.length > 0
      ? await db.query.universalTasks.findMany({
          where: inArray(schema.universalTasks.id, myTaskIds),
          orderBy: [desc(schema.universalTasks.createdAt)],
          with: { assignments: true },
        })
      : [];

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
    const inProgressTasks = tasks.filter((t: any) => t.status === 'in_progress').length;
    const todoTasks = tasks.filter((t: any) => t.status === 'todo').length;
    const blockedTasks = tasks.filter((t: any) => t.status === 'blocked').length;

    // Get employee record for efficiency score
    let efficiencyScore = null;
    let employeeRecord = null;
    if (user.employeeId) {
      employeeRecord = await db.query.employees.findFirst({
        where: eq(schema.employees.id, user.employeeId),
      });
      efficiencyScore = employeeRecord?.efficiencyScore ?? null;
    }

    // Get active appointments
    const appointments = await db.query.appointments.findMany({
      where: and(
        or(
          user.employeeId ? eq(schema.appointments.employeeId, user.employeeId) : undefined,
          eq(schema.appointments.accountId, user.id)
        ),
        eq(schema.appointments.isActive, true)
      ),
    });

    const appointmentIds = appointments.map(a => a.id);

    // Get committee memberships
    const committees = user.employeeId
      ? await db.query.committeeMembers.findMany({
          where: eq(schema.committeeMembers.employeeId, user.employeeId),
          with: { committee: true },
        })
      : [];
    
    const committeeIds = committees.map(c => c.committeeId);

    // Get more tasks (committee and appointment specific)
    const extraTasks = (appointmentIds.length > 0 || committeeIds.length > 0)
      ? await db.query.universalTasks.findMany({
          where: or(
            appointmentIds.length > 0 ? inArray(schema.universalTasks.appointmentId, appointmentIds) : undefined,
            committeeIds.length > 0 ? inArray(schema.universalTasks.committeeId, committeeIds) : undefined
          ),
          orderBy: [desc(schema.universalTasks.createdAt)],
          with: { assignments: true },
        })
      : [];

    // Merge and deduplicate tasks
    const allTasksMap = new Map();
    [...tasks, ...extraTasks].forEach(t => allTasksMap.set(t.id, t));
    const allTasks = Array.from(allTasksMap.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
        roleId: user.roleId, 
        roleName: user.roleName, 
        employeeId: user.employeeId,
        avatarUrl: employeeRecord?.profilePhoto || null
      },
      employee: employeeRecord || null,
      stats: { 
        totalTasks: allTasks.length, 
        completedTasks: allTasks.filter(t => t.status === 'completed').length, 
        inProgressTasks: allTasks.filter(t => t.status === 'in_progress').length, 
        todoTasks: allTasks.filter(t => t.status === 'todo').length, 
        blockedTasks: allTasks.filter(t => t.status === 'blocked').length, 
        efficiencyScore 
      },
      tasks: allTasks.slice(0, 50),
      appointments,
      committees: committees.map((cm: any) => ({ ...cm, committeeName: cm.committee?.committeeName })),
      preferences: dashState?.preferences ? JSON.parse(dashState.preferences) : {},
      calendarToken: (await db.query.calendarFeeds.findFirst({ where: eq(schema.calendarFeeds.userId, user.id) }))?.token || null,
    });
  } catch (err) { return serverError(c, err); }
});

/* ── ATTENDANCE SELF-SERVICE ── */
dashboardRouter.get('/attendance/today', async (c) => {
  try {
    const user = c.get('user');
    if (!user.employeeId) return ok(c, null); // No employee record
    const today = new Date().toISOString().split('T')[0];
    const record = await getDb(c.env).query.attendance.findFirst({
      where: and(eq(schema.attendance.employeeId, user.employeeId), eq(schema.attendance.date, today))
    });
    return ok(c, record || null);
  } catch (err) { return serverError(c, err); }
});

dashboardRouter.post('/attendance/checkin', async (c) => {
  try {
    const user = c.get('user');
    if (!user.employeeId) return badRequest(c, 'User has no employee profile');
    
    const db = getDb(c.env);
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString('en-US', { hour12: false }); // "14:30:00"
    
    // Ensure no double check-in
    const existing = await db.query.attendance.findFirst({
      where: and(eq(schema.attendance.employeeId, user.employeeId), eq(schema.attendance.date, today))
    });
    
    if (existing) return badRequest(c, 'Already checked in today');
    
    const id = generateId('att');
    await db.insert(schema.attendance).values({
      id,
      employeeId: user.employeeId,
      date: today,
      checkIn: now,
      status: 'Present',
      createdAt: new Date(),
    });
    return created(c, { id, checkIn: now });
  } catch (err) { return serverError(c, err); }
});

dashboardRouter.post('/attendance/checkout', async (c) => {
  try {
    const user = c.get('user');
    if (!user.employeeId) return badRequest(c, 'User has no employee profile');
    
    const db = getDb(c.env);
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    const existing = await db.query.attendance.findFirst({
      where: and(eq(schema.attendance.employeeId, user.employeeId), eq(schema.attendance.date, today))
    });
    
    if (!existing || !existing.checkIn) return badRequest(c, 'Not checked in today');
    if (existing.checkOut) return badRequest(c, 'Already checked out today');
    
    // Calculate total hours
    let totalHours = null;
    try {
      const start = new Date(`1970-01-01T${existing.checkIn}`);
      const end = new Date(`1970-01-01T${now}`);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60); // In hours
      }
    } catch {}

    await db.update(schema.attendance).set({
      checkOut: now,
      totalHours: totalHours !== null ? Number(totalHours.toFixed(2)) : undefined,
    }).where(eq(schema.attendance.id, existing.id));
    
    return ok(c, { checkOut: now, totalHours });
  } catch (err) { return serverError(c, err); }
});

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

