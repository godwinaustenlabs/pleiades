import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { actorEmployeeId, checkFeaturePermission } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';
import { postToSlack } from '../utils/slack';
import { notifyTaskAssigned } from '../email/task-notify';
import { workspaceTasks } from '../tasks/workspace';
import { deleteTasks } from '../tasks/delete';
import {
  createSeries, updateSeries, stopSeries, present, project, workspaceSeries, parseRule,
  type SeriesTemplate, type RuleInput,
} from '../tasks/recurring';
import { describeRule, nextOccurrence, occurrencesBetween, type Rule } from '../tasks/recurrence';
import { workspaceRefs } from '../tasks/workspace';
import { isIsoDate, localDate, DAY_MS } from '../time/clock';

const tasksRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
tasksRouter.use('*', authMiddleware);

/** Departments that carry a `tasks` feature in the permission model. */
const TASK_DEPARTMENTS = ['hr', 'finance', 'legal', 'ops', 'acquisition', 'tech', 'crm', 'dashboard'];

/**
 * The departments whose tasks this caller may view. Grants are cached per
 * request, so this costs at most one database read regardless of list length.
 */
async function viewableTaskDepartments(c: any): Promise<string[]> {
  const allowed: string[] = [];
  for (const dept of TASK_DEPARTMENTS) {
    if (await checkFeaturePermission(c, dept, 'tasks', 'view')) allowed.push(dept);
  }
  return allowed;
}

/**
 * Sanitizes input body to ensure FK fields are null instead of empty strings
 */
function sanitizeTaskBody(body: any) {
  const fields = ['appointmentId', 'committeeId', 'creatorId'];
  const sanitized = { ...body };
  fields.forEach(f => {
    if (sanitized[f] === '') sanitized[f] = null;
  });
  // Which series a task belongs to, and which occurrence it is, are written only
  // by src/tasks/recurring.ts. A client setting them could forge an occurrence
  // and block the real one through the unique index.
  delete sanitized.recurrenceId;
  delete sanitized.occurrenceAt;
  return sanitized;
}

/**
 * Tells newly assigned people about a task, on Slack and by email.
 *
 * Email as well as Slack, not instead: Slack only reaches people with a slack_id on
 * file. Email goes through waitUntil so a slow provider does not hold up the
 * response — the outbox row is written first, and the cron sweeps what does not go.
 */
async function announceAssignment(
  c: any,
  task: { id: string; title: string; department: string; dueDate?: string | null },
  assigneeIds: string[],
) {
  const db = getDb(c.env);
  try {
    for (const empId of assigneeIds) {
      const assignee = await db.query.employees.findFirst({
        where: eq(schema.employees.id, empId),
        columns: { slackId: true },
      });
      if (assignee?.slackId) {
        await postToSlack(c.env, assignee.slackId, `You have been assigned a new task: ${task.title}`);
      }
    }
  } catch (err) {
    console.error('[Slack Notification Error]', err);
  }
  c.executionCtx.waitUntil(notifyTaskAssigned(c.env, task, assigneeIds));
}

/** A series' template fields, from a request body. */
function templateFrom(body: any): Partial<SeriesTemplate> {
  const t: Partial<SeriesTemplate> = {};
  if (typeof body.title === 'string') t.title = body.title;
  if (body.description !== undefined) t.description = body.description || null;
  if (body.priority !== undefined) t.priority = body.priority || null;
  if (body.taskType !== undefined) t.taskType = body.taskType || null;
  if (body.committeeId !== undefined) t.committeeId = body.committeeId || null;
  if (body.appointmentId !== undefined) t.appointmentId = body.appointmentId || null;
  if (Array.isArray(body.assigneeIds)) t.assigneeIds = body.assigneeIds.filter((x: unknown) => typeof x === 'string' && x);
  return t;
}

// ── REPEATING SERIES ── (registered before the `/:id` routes)

// POST /tasks/recurrences/preview — what a rule means, before saving it.
tasksRouter.post('/recurrences/preview', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const parsed = parseRule((body as any).recurrence ?? body);
    if ('error' in parsed) return badRequest(c, parsed.error);
    const next = occurrencesBetween(parsed.rule, Date.now(), Date.now() + 800 * DAY_MS, 5);
    return ok(c, {
      summary: describeRule(parsed.rule),
      next: next.map((at) => ({ occurrenceAt: at, date: localDate(at, parsed.rule.timezone) })),
    });
  } catch (err) { return serverError(c, err); }
});

// GET /tasks/recurrences/upcoming?from=YYYY-MM-DD&to=YYYY-MM-DD
// The caller's workspace series, projected — occurrences not yet created as tasks.
tasksRouter.get('/recurrences/upcoming', async (c) => {
  try {
    const db = getDb(c.env);
    const today = new Date().toISOString().slice(0, 10);
    const fromQ = c.req.query('from');
    const toQ = c.req.query('to');
    const from = isIsoDate(fromQ) ? fromQ : today;
    const to = isIsoDate(toQ) ? toQ : new Date(Date.parse(`${from}T00:00:00Z`) + 42 * DAY_MS).toISOString().slice(0, 10);
    const fromMs = Date.parse(`${from}T00:00:00Z`) - DAY_MS; // a day either side covers every zone
    const toMs = Date.parse(`${to}T00:00:00Z`) + 2 * DAY_MS;
    if (toMs < fromMs || toMs - fromMs > 100 * DAY_MS) return badRequest(c, 'window must be 1 to 93 days');

    const employeeId = await actorEmployeeId(c);
    if (!employeeId) return ok(c, []);
    const rows = await workspaceSeries(db, employeeId, await workspaceRefs(db, employeeId));
    return ok(c, project(rows, fromMs, toMs).filter((o) => o.date >= from && o.date <= to));
  } catch (err) { return serverError(c, err); }
});

// GET /tasks/recurrences/:id
tasksRouter.get('/recurrences/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.taskRecurrences.findFirst({
      where: eq(schema.taskRecurrences.id, c.req.param('id')),
    });
    if (!row) return notFound(c, 'Series not found');
    if (!(await checkFeaturePermission(c, row.department.toLowerCase(), 'tasks', 'view'))) {
      return c.json({ success: false, error: 'Permission denied: cannot view tasks in this department' }, 403);
    }
    return ok(c, present(row));
  } catch (err) { return serverError(c, err); }
});

// PATCH /tasks/recurrences/:id — changes future occurrences; past ones stay as they are.
tasksRouter.patch('/recurrences/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const row = await db.query.taskRecurrences.findFirst({ where: eq(schema.taskRecurrences.id, c.req.param('id')) });
    if (!row) return notFound(c, 'Series not found');
    if (!(await checkFeaturePermission(c, row.department.toLowerCase(), 'tasks', 'edit'))) {
      return c.json({ success: false, error: 'Permission denied: cannot edit tasks in this department' }, 403);
    }
    if (!row.isActive) return badRequest(c, 'This series has been stopped');

    const body = sanitizeTaskBody(await c.req.json());
    const changes: Partial<SeriesTemplate> & { rule?: Rule } = templateFrom(body);
    if (changes.title !== undefined && !changes.title.trim()) return badRequest(c, 'title is required');
    if (body.recurrence !== undefined) {
      const parsed = parseRule(body.recurrence as RuleInput);
      if ('error' in parsed) return badRequest(c, parsed.error);
      changes.rule = parsed.rule;
    }

    const result = await updateSeries(c.env, db, row, changes, Date.now());
    await logAudit(c.env, user.id, 'UPDATE', 'task_recurrences', row.id, body);
    return ok(c, { ...present(result.row), replacedOccurrences: result.removed, taskIds: result.taskIds });
  } catch (err) { return serverError(c, err); }
});

// POST /tasks/recurrences/:id/stop — no more occurrences; upcoming untouched ones go.
tasksRouter.post('/recurrences/:id/stop', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const row = await db.query.taskRecurrences.findFirst({ where: eq(schema.taskRecurrences.id, c.req.param('id')) });
    if (!row) return notFound(c, 'Series not found');
    if (!(await checkFeaturePermission(c, row.department.toLowerCase(), 'tasks', 'edit'))) {
      return c.json({ success: false, error: 'Permission denied: cannot edit tasks in this department' }, 403);
    }
    const removed = await stopSeries(c.env, db, row, Date.now());
    await logAudit(c.env, user.id, 'UPDATE', 'task_recurrences', row.id, { stopped: true, removedOccurrences: removed });
    return ok(c, { id: row.id, stopped: true, removedOccurrences: removed });
  } catch (err) { return serverError(c, err); }
});

// GET /tasks?dept=...&userId=...&committeeId=...&appointmentId=...&status=...
// GET /tasks?scope=workspace — the caller's own workspace board
tasksRouter.get('/', async (c) => {
  try {
    const db = getDb(c.env);

    /*
     * The workspace board shows exactly what the workspace calendar shows, from the
     * same function. No department check: every task here is one the caller is
     * assigned to, or sits on a post or committee they hold — which is what puts it
     * on their calendar already. Editing and deleting are still checked per task.
     */
    if (c.req.query('scope') === 'workspace') {
      const tasks = await workspaceTasks(db, await actorEmployeeId(c));
      return ok(c, tasks.sort((a, b) => (a.boardPosition ?? 0) - (b.boardPosition ?? 0)));
    }

    const user = c.get('user');
    const dept = c.req.query('dept');
    const userId = c.req.query('userId'); // This is employeeId now
    const committeeId = c.req.query('committeeId');
    const appointmentId = c.req.query('appointmentId');
    const status = c.req.query('status');

    // If a department is specified, check view permission for that department's tasks
    if (dept) {
      const canView = await checkFeaturePermission(c, dept.toLowerCase(), 'tasks', 'view');
      if (!canView) {
        return c.json({ success: false, error: `Permission denied: cannot view tasks for ${dept}` }, 403);
      }
    }

    // With no `dept` filter this endpoint used to return EVERY task in the
    // company to any authenticated caller — the branch here was empty, with a
    // comment acknowledging the check had been skipped. Callers are now limited
    // to departments they can view tasks in, plus tasks assigned to them.
    let visibleDepartments: string[] | null = null;
    if (!dept && user.type !== 'agent' && !user.isSuperadmin) {
      visibleDepartments = await viewableTaskDepartments(c);
    }

    let conditions = [];
    if (dept) conditions.push(eq(schema.universalTasks.department, dept));
    // Note: userId filtering via task_assignments is done post-fetch below
    if (committeeId) conditions.push(eq(schema.universalTasks.committeeId, committeeId));
    if (appointmentId) conditions.push(eq(schema.universalTasks.appointmentId, appointmentId));
    if (status) conditions.push(eq(schema.universalTasks.status, status));

    let tasks = await db.query.universalTasks.findMany({
      where: conditions.length > 0 ? (conditions.length > 1 ? and(...conditions) : conditions[0]) : undefined,
      orderBy: (t, { asc }) => [asc(t.boardPosition), desc(t.createdAt)],
      with: {
        assignments: true
      }
    });

    // Restrict an unscoped listing to what this caller may actually see.
    if (visibleDepartments) {
      const allowed = new Set(visibleDepartments);
      tasks = tasks.filter((t) =>
        allowed.has((t.department || '').toLowerCase()) ||
        (!!user.employeeId && t.assignments?.some((a: any) => a.employeeId === user.employeeId)),
      );
    }

    // Filter by userId (employeeId) via assignments if specified
    if (userId) {
      tasks = tasks.filter(t => t.assignments?.some((a: any) => a.employeeId === userId));
    }

    return ok(c, tasks);
  } catch (err) {
    return serverError(c, err);
  }
});

// POST /tasks
tasksRouter.post('/', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const rawBody = await c.req.json();
    const body = sanitizeTaskBody(rawBody);

    // Validate required fields
    if (!body.title?.trim()) {
      return c.json({ success: false, error: 'title is required' }, 400);
    }
    if (!body.department?.trim()) {
      return c.json({ success: false, error: 'department is required' }, 400);
    }

    const dept = body.department.toLowerCase();

    // Permission Check: tasks feature in the department
    const canEdit = await checkFeaturePermission(c, dept, 'tasks', 'edit');
    if (!canEdit) {
      return c.json({ success: false, error: `Permission denied: cannot create tasks for ${dept}` }, 403);
    }

    /*
     * A repeating task. The body is the same task plus a `recurrence` rule; what is
     * stored is a series, and its occurrences are created as ordinary tasks — the
     * first of them now, if it falls inside the lead window. Assignees hear about
     * the series once, here, and never per occurrence (see src/tasks/recurring.ts).
     */
    if (body.recurrence !== undefined && body.recurrence !== null) {
      const parsed = parseRule(body.recurrence as RuleInput);
      if ('error' in parsed) return badRequest(c, parsed.error);
      const template = { ...templateFrom(body), title: body.title, department: body.department } as SeriesTemplate;
      template.assigneeIds = template.assigneeIds ?? [];
      const { row, taskIds } = await createSeries(db, template, parsed.rule, user.id, Date.now());
      const summary = describeRule(parsed.rule);
      if (template.assigneeIds.length > 0) {
        const first = nextOccurrence(parsed.rule, Number.NEGATIVE_INFINITY);
        await announceAssignment(c, {
          id: taskIds[0] ?? row.id,
          title: `${row.title} (repeats: ${summary})`,
          department: row.department,
          dueDate: first === null ? null : localDate(first, parsed.rule.timezone),
        }, template.assigneeIds);
      }
      await logAudit(c.env, user.id, 'CREATE', 'task_recurrences', row.id, body);
      return created(c, { id: taskIds[0] ?? null, recurrenceId: row.id, summary, taskIds });
    }

    const id = generateId('task');

    const { assigneeIds: _assigneeIds, recurrence: _recurrence, ...taskBody } = body;
    await db.insert(schema.universalTasks).values({
      ...taskBody,
      id,
      department: body.department.trim(),
      creatorId: user.id,
      status: body.status || 'todo',
      boardPosition: body.boardPosition ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (Array.isArray(body.assigneeIds) && body.assigneeIds.length > 0) {
      const assignmentsToInsert = body.assigneeIds.filter((empId: string) => empId).map((empId: string) => ({
        id: generateId('tassign'),
        taskId: id,
        employeeId: empId,
        assignedAt: new Date()
      }));
      if (assignmentsToInsert.length > 0) {
        await db.insert(schema.taskAssignments).values(assignmentsToInsert);
      }
      await announceAssignment(c, { id, title: body.title, department: body.department, dueDate: body.dueDate ?? null }, body.assigneeIds);
    }

    await logAudit(c.env, user.id, 'CREATE', 'universal_tasks', id, body);
    
    return created(c, { id });
  } catch (err) {
    return serverError(c, err);
  }
});

// PATCH /tasks/:id
tasksRouter.patch('/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const rawBody = await c.req.json();
    const body = sanitizeTaskBody(rawBody);

    // Fetch task to find department
    const task = await db.query.universalTasks.findFirst({
      where: eq(schema.universalTasks.id, id)
    });
    if (!task) return notFound(c, 'Task not found');

    // Permission Check
    const canEdit = await checkFeaturePermission(c, task.department.toLowerCase(), 'tasks', 'edit');
    if (!canEdit) {
      return c.json({ success: false, error: 'Permission denied: cannot edit tasks in this department' }, 403);
    }

    delete body.id; delete body.createdAt; delete body.updatedAt; delete body.completedAt;
    // Who created a task is a record, not an editable field.
    delete body.creatorId;
    // Moving a task into another department needs edit rights THERE too; holding
    // them here was enough to drop a task onto a board you cannot otherwise touch.
    if (typeof body.department === 'string' && body.department.trim().toLowerCase() !== task.department.toLowerCase()) {
      if (!(await checkFeaturePermission(c, body.department.trim().toLowerCase(), 'tasks', 'edit'))) {
        return c.json({ success: false, error: 'Permission denied: cannot move tasks into that department' }, 403);
      }
      body.department = body.department.trim();
    }
    const assigneeIds = body.assigneeIds;
    delete body.assigneeIds;

    const updates: any = { ...body, updatedAt: new Date() };
    if (body.status === 'completed') {
      updates.completedAt = new Date();
    }

    await db.update(schema.universalTasks)
      .set(updates)
      .where(eq(schema.universalTasks.id, id));

    // Update Assignments
    if (assigneeIds !== undefined) {
      // Read the current set BEFORE deleting it. This handler rewrites every
      // assignment row on every edit, so "who is assigned now" and "who was just
      // assigned" are different questions, and only the second one should
      // produce an email. Renaming a task must not notify the whole team.
      //
      // Not the guarantee, though: that is the `task_assigned:<task>:<employee>`
      // idempotency key in task-notify.ts, which is enforced by a UNIQUE column
      // and holds even if this diff is wrong. This is the second lock, and it is
      // what keeps a ten-person task from doing thirty queries per edit to
      // discover there is nothing to send.
      const previous = await db.query.taskAssignments.findMany({
        where: eq(schema.taskAssignments.taskId, id),
        columns: { employeeId: true },
      });
      const before = new Set(previous.map((a) => a.employeeId));

      await db.delete(schema.taskAssignments).where(eq(schema.taskAssignments.taskId, id));
      if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
        const assignmentsToInsert = assigneeIds.filter((empId: string) => empId).map((empId: string) => ({
          id: generateId('tassign'),
          taskId: id,
          employeeId: empId,
          assignedAt: new Date()
        }));
        if (assignmentsToInsert.length > 0) {
          await db.insert(schema.taskAssignments).values(assignmentsToInsert);
        }

        const added = assignmentsToInsert
          .map((a) => a.employeeId)
          .filter((empId: string) => !before.has(empId));

        if (added.length > 0) {
          // The task row was just updated, so re-read the fields the template
          // needs rather than trusting the patch body to carry them.
          const task = await db.query.universalTasks.findFirst({
            where: eq(schema.universalTasks.id, id),
            columns: { title: true, department: true, dueDate: true },
          });
          if (task) {
            c.executionCtx.waitUntil(notifyTaskAssigned(
              c.env,
              { id, title: task.title, department: task.department, dueDate: task.dueDate },
              added,
            ));
          }
        }
      }
    }

    await logAudit(c.env, user.id, 'UPDATE', 'universal_tasks', id, body);
    return ok(c, { id });
  } catch (err) {
    return serverError(c, err);
  }
});

// POST /tasks/reorder — batch reorder for drag-and-drop
tasksRouter.post('/reorder', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const { tasks } = await c.req.json<{ tasks: { id: string; status: string; boardPosition: number; department: string }[] }>();

    if (!tasks || !Array.isArray(tasks)) {
      return c.json({ success: false, error: 'tasks array required' }, 400);
    }

    // Since reorder is bulk, we check permission for the first department found in tasks
    // In a mixed list, this is simplified but usually TaskBoard is per-dept
    if (tasks.length > 0) {
      const dept = tasks[0].department?.toLowerCase() || 'tech';
      const canEdit = await checkFeaturePermission(c, dept, 'tasks', 'edit');
      if (!canEdit) {
        return c.json({ success: false, error: 'Permission denied: cannot reorder tasks' }, 403);
      }
    }

    for (const t of tasks) {
      const updates: any = { boardPosition: t.boardPosition, updatedAt: new Date() };
      if (t.status) {
        updates.status = t.status;
        if (t.status === 'completed') updates.completedAt = new Date();
      }
      await db.update(schema.universalTasks)
        .set(updates)
        .where(eq(schema.universalTasks.id, t.id));
    }

    return ok(c, { reordered: tasks.length });
  } catch (err) {
    return serverError(c, err);
  }
});

// DELETE /tasks/:id
tasksRouter.delete('/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');

    // Fetch task to find department
    const task = await db.query.universalTasks.findFirst({
      where: eq(schema.universalTasks.id, id)
    });
    if (!task) return notFound(c, 'Task not found');

    // Permission Check
    const canDelete = await checkFeaturePermission(c, task.department.toLowerCase(), 'tasks', 'delete');
    if (!canDelete) {
      return c.json({ success: false, error: 'Permission denied: cannot delete tasks' }, 403);
    }

    // Time released, assignments and attachments removed, one batch — see
    // src/tasks/delete.ts. Deleting one occurrence of a series deletes only that
    // occurrence: the series has already moved past it and will not re-create it.
    await deleteTasks(c.env, db, [id]);
    await logAudit(c.env, user.id, 'DELETE', 'universal_tasks', id);
    return ok(c, { id, deleted: true });
  } catch (err) {
    return serverError(c, err);
  }
});

// ── ATTACHMENTS ──

// GET /tasks/:id/attachments
tasksRouter.get('/:id/attachments', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const rows = await db.query.taskAttachments.findMany({
      where: eq(schema.taskAttachments.taskId, id),
      orderBy: [desc(schema.taskAttachments.createdAt)],
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

// POST /tasks/:id/attachments
tasksRouter.post('/:id/attachments', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const id = generateId('tatt');

    await db.insert(schema.taskAttachments).values({
      ...body,
      id,
      taskId,
      uploadedById: user.id,
      createdAt: new Date(),
    });

    await logAudit(c.env, user.id, 'CREATE', 'task_attachments', id, { taskId });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

export default tasksRouter;
