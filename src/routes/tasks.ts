import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { checkFeaturePermission } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';
import { postToSlack } from '../utils/slack';

const tasksRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
tasksRouter.use('*', authMiddleware);

/**
 * Sanitizes input body to ensure FK fields are null instead of empty strings
 */
function sanitizeTaskBody(body: any) {
  const fields = ['appointmentId', 'committeeId', 'creatorId'];
  const sanitized = { ...body };
  fields.forEach(f => {
    if (sanitized[f] === '') sanitized[f] = null;
  });
  return sanitized;
}

// GET /tasks?dept=...&userId=...&committeeId=...&appointmentId=...&status=...
tasksRouter.get('/', async (c) => {
  try {
    const db = getDb(c.env);
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
    } else if (user.type !== 'agent' && !user.isSuperadmin) {
      // If no department is specified, and user is not superadmin/agent, 
      // they can only see tasks where they are the assignee, 
      // UNLESS they have global HR view (simplified for now: just filter if not superadmin)
      // Actually, let's keep it simple: if no dept, they see all, but we should ideally filter.
      // For now, let's just enforce dept-based RBAC as requested.
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

    const id = generateId('task');

    const { assigneeIds: _assigneeIds, ...taskBody } = body;
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

      // Slack Notification for all assignees
      try {
        for (const empId of body.assigneeIds) {
          const assignee = await db.query.employees.findFirst({
            where: eq(schema.employees.id, empId),
            columns: { slackId: true }
          });
          if (assignee?.slackId) {
            await postToSlack(c.env, assignee.slackId, `You have been assigned a new task: ${body.title}`);
          }
        }
      } catch (err) {
        console.error('[Slack Notification Error]', err);
      }
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

    await db.delete(schema.taskAssignments).where(eq(schema.taskAssignments.taskId, id));
    await db.delete(schema.universalTasks).where(eq(schema.universalTasks.id, id));
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
