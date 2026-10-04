import { Hono } from 'hono';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { actorEmployeeId, checkFeaturePermission, requireFeatureAccess } from '../middleware/rbac';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, forbidden, serverError } from '../utils/response';
import * as time from '../time/store';
import { TimeError } from '../time/store';
import { isIsoDate } from '../time/clock';
import { canReadTimeOf, canEditOldTimeOf, canSeeTaskContributors } from '../time/access';

/**
 * Time across people: what a manager, a department head or HR reads, and the
 * per-task contribution panel. Your OWN time is `/api/dashboard/time/*`.
 *
 * Top level rather than under `/api/hr`, for the same reason `appointments` is: a
 * department head or a reporting manager reads their people's time without holding
 * any HR grant, and `requireAppAccess('hr')` on that router would lock them out.
 * Access is therefore decided per request by `src/time/access.ts`, never by the
 * route shape, and the organisation-wide routes are gated on `hr/attendance`.
 *
 * No route here returns a list of people ranked or compared by hours. The report is
 * aggregates; per-person time is read one person at a time.
 */
const timeRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
timeRouter.use('*', authMiddleware);

function fail(c: any, err: unknown) {
  if (err instanceof TimeError) return c.json({ success: false, error: err.message }, err.status);
  return serverError(c, err);
}

/** A change to somebody else's time, or to your own beyond 14 days, must say why. */
function reasonOf(body: any): string | null {
  const r = typeof body?.reason === 'string' ? body.reason.trim() : '';
  return r.length >= 3 ? r.slice(0, 500) : null;
}

/* ── Who the caller may read ── */
timeRouter.get('/people', async (c) => {
  try {
    const me = await actorEmployeeId(c);
    const all = await checkFeaturePermission(c, 'hr', 'attendance', 'view');
    const { results } = await c.env.DB
      .prepare(`SELECT e.employee_id, e.name, e.designation, e.sector_id, s.sector_name,
                  (e.employee_id = ?1) AS is_self,
                  (e.reporting_manager_id = ?1) AS is_report,
                  (s.head_employee_id = ?1) AS in_my_department
                FROM employees e LEFT JOIN sectors s ON s.sector_id = e.sector_id
                WHERE ?2 = 1 OR e.employee_id = ?1 OR e.reporting_manager_id = ?1 OR s.head_employee_id = ?1
                ORDER BY e.name`)
      .bind(me ?? '', all ? 1 : 0)
      .all<Record<string, unknown>>();
    return ok(c, results.map((r) => ({
      id: r.employee_id, name: r.name, designation: r.designation ?? null,
      sectorName: r.sector_name ?? null,
      relation: r.is_self ? 'self' : r.in_my_department ? 'department' : r.is_report ? 'report' : 'hr',
    })));
  } catch (err) { return fail(c, err); }
});

/* ── One person's days ── */
timeRouter.get('/people/:employeeId/days', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    if (!(await canReadTimeOf(c, employeeId))) return forbidden(c, 'You cannot see this person\'s time');
    const db = c.env.DB;
    const tz = await time.employeeTimezone(db, employeeId);
    const range = time.defaultRange(Date.now(), tz);
    const from = isIsoDate(c.req.query('from')) ? c.req.query('from')! : range.from;
    const to = isIsoDate(c.req.query('to')) ? c.req.query('to')! : range.to;
    return ok(c, {
      timezone: tz, from, to,
      days: await time.listDays(db, employeeId, from, to),
      // Whether the caller may change this person's entries (a head or HR). Decided
      // here because only the server knows who heads which department.
      canEdit: await canEditOldTimeOf(c, employeeId),
    });
  } catch (err) { return fail(c, err); }
});

timeRouter.get('/people/:employeeId/days/:date', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    if (!(await canReadTimeOf(c, employeeId))) return forbidden(c, 'You cannot see this person\'s time');
    const date = c.req.param('date');
    if (!isIsoDate(date)) return badRequest(c, 'date must be YYYY-MM-DD');
    const day = await time.dayByDate(c.env.DB, employeeId, date);
    return ok(c, day ? await time.dayDetail(c.env.DB, day, Date.now()) : null);
  } catch (err) { return fail(c, err); }
});

/* ── Changing somebody's time after the fact: a department head or HR, with a reason ── */
timeRouter.post('/people/:employeeId/entries', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    if (!(await canEditOldTimeOf(c, employeeId))) return forbidden(c, 'Only their department head or HR can add time for somebody');
    const body = await c.req.json();
    const reason = reasonOf(body);
    if (!reason) return badRequest(c, 'Say why this is being added');
    const entry = await time.addManual(c.env.DB, employeeId, body, Date.now(), { beyondWindow: true });
    await logAudit(c.env, c.get('user').id, 'CREATE', 'time_entries', entry.id, { ...body, onBehalfOf: employeeId, reason });
    return created(c, entry);
  } catch (err) { return fail(c, err); }
});

timeRouter.patch('/entries/:id', async (c) => {
  try {
    const entry = await time.getEntry(c.env.DB, c.req.param('id'));
    if (!entry) return notFound(c);
    if (!(await canEditOldTimeOf(c, entry.employeeId))) return forbidden(c, 'Only their department head or HR can change this');
    const body = await c.req.json();
    const reason = reasonOf(body);
    if (!reason) return badRequest(c, 'Say why this is being changed');
    const updated = await time.editEntry(c.env.DB, entry, body, Date.now(), { beyondWindow: true });
    await logAudit(c.env, c.get('user').id, 'UPDATE', 'time_entries', entry.id, { before: entry, change: body, reason });
    return ok(c, updated);
  } catch (err) { return fail(c, err); }
});

timeRouter.delete('/entries/:id', async (c) => {
  try {
    const entry = await time.getEntry(c.env.DB, c.req.param('id'));
    if (!entry) return notFound(c);
    if (!(await canEditOldTimeOf(c, entry.employeeId))) return forbidden(c, 'Only their department head or HR can remove this');
    const reason = reasonOf({ reason: c.req.query('reason') });
    if (!reason) return badRequest(c, 'Say why this is being removed (?reason=)');
    await time.deleteEntry(c.env.DB, entry, Date.now(), { beyondWindow: true });
    await logAudit(c.env, c.get('user').id, 'DELETE', 'time_entries', entry.id, { before: entry, reason });
    return ok(c, { id: entry.id, deleted: true });
  } catch (err) { return fail(c, err); }
});

/* ── One task: the total, and who contributed how much ── */
timeRouter.get('/tasks/:taskId', async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const user = c.get('user');
    const task = await c.env.DB
      .prepare('SELECT task_id, department, creator_id FROM universal_tasks WHERE task_id = ?')
      .bind(taskId)
      .first<Record<string, unknown>>();
    if (!task) return notFound(c, 'Task not found');

    // The same visibility as GET /api/tasks: the department's tasks feature, or being assigned.
    const me = await actorEmployeeId(c);
    const assigned = me
      ? !!(await c.env.DB.prepare('SELECT 1 FROM task_assignments WHERE task_id = ? AND employee_id = ?').bind(taskId, me).first())
      : false;
    const canSee = user.isSuperadmin || assigned
      || (await checkFeaturePermission(c, String(task.department || '').toLowerCase(), 'tasks', 'view'))
      || (await canSeeTaskContributors(c, taskId, (task.creator_id as string) ?? null));
    if (!canSee) return forbidden(c, 'You cannot see this task');

    const t = await time.taskTime(c.env.DB, taskId);
    const withPeople = await canSeeTaskContributors(c, taskId, (task.creator_id as string) ?? null);
    return ok(c, withPeople
      ? t
      : { totalMs: t.totalMs, contributorCount: t.contributors.length, runningNow: t.runningNow, contributors: null });
  } catch (err) { return fail(c, err); }
});

/* ── Organisation reports (aggregates only) ── */
timeRouter.get('/report', requireFeatureAccess('hr', 'attendance', 'view'), async (c) => {
  try {
    const groups = ['department', 'task_type', 'task', 'week'] as const;
    const g = c.req.query('group') as (typeof groups)[number];
    const range = time.defaultRange(Date.now(), 'Asia/Karachi');
    return ok(c, await time.report(c.env.DB, {
      from: isIsoDate(c.req.query('from')) ? c.req.query('from')! : range.from,
      to: isIsoDate(c.req.query('to')) ? c.req.query('to')! : range.to,
      group: groups.includes(g) ? g : 'department',
      department: c.req.query('department') || undefined,
      includeAutoClosed: c.req.query('include_auto_closed') === '1',
    }));
  } catch (err) { return fail(c, err); }
});

/* A count of people with a work timer running. Never names. */
timeRouter.get('/now', requireFeatureAccess('hr', 'attendance', 'view'), async (c) => {
  try { return ok(c, { loggingNow: await time.loggingNow(c.env.DB) }); }
  catch (err) { return fail(c, err); }
});

export default timeRouter;
