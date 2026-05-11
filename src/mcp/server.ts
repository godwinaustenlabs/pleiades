import { Hono } from 'hono';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, badRequest, notFound, serverError } from '../utils/response';

const mcpRouter = new Hono<{ Bindings: Env }>();
mcpRouter.use('*', authMiddleware);
mcpRouter.use('*', requireAppAccess('mcp_server'));

/**
 * resolveAndAuthorize
 * Helper to identify a user via Slack ID or JWT and verify feature-level access.
 */
async function resolveAndAuthorize(
  c: any, 
  slackId: string | undefined, 
  appName: string, 
  feature: string, 
  level: 'view' | 'edit' | 'delete'
): Promise<{ authorized: boolean; userId?: string; employeeId?: string; error?: string }> {
  if (!slackId) return { authorized: false, error: 'slack_id is required for MCP tool authentication' };

  const db = getDb(c.env);
  const employee = await db.query.employees.findFirst({
    where: and(eq(schema.employees.slackId, slackId), eq(schema.employees.employmentStatus, 'active')),
  });
  if (!employee) return { authorized: false, error: 'Employee not found or inactive for this Slack ID' };
  
  const employeeId = employee.id;
  const login = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.employeeId, employeeId),
  });
  if (!login) return { authorized: false, error: 'No system account linked to this Slack identity' };
  const userId = login.id;

  if (login.isSuperadmin) return { authorized: true, userId, employeeId };

  // Check granular permissions
  const perm = await db.query.userAppPermissions.findFirst({
    where: and(
      eq(schema.userAppPermissions.userId, userId),
      eq(schema.userAppPermissions.appName, appName),
      eq(schema.userAppPermissions.feature, feature)
    )
  });

  if (!perm) return { authorized: false, error: `Forbidden: No access to ${appName}/${feature}` };
  if (level === 'view' && !perm.canView) return { authorized: false, error: `Forbidden: Cannot view ${appName}/${feature}` };
  if (level === 'edit' && !perm.canEdit) return { authorized: false, error: `Forbidden: Cannot edit ${appName}/${feature}` };
  if (level === 'delete' && !perm.canDelete) return { authorized: false, error: `Forbidden: Cannot delete ${appName}/${feature}` };

  return { authorized: true, userId, employeeId };
}

/* ═══════════════════════════════════════════════════════════════
   TOOL: resolve-identity
   Resolves a Slack ID to internal employee record + routing keys.
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/resolve-identity', async (c) => {
  try {
    const { slack_id } = await c.req.json<{ slack_id: string }>();
    if (!slack_id) return badRequest(c, 'slack_id required');
    const db = getDb(c.env);
    const employee = await db.query.employees.findFirst({
      where: and(eq(schema.employees.slackId, slack_id), eq(schema.employees.employmentStatus, 'active')),
    });
    if (!employee) return notFound(c, 'Employee not found or inactive');
    return ok(c, {
      employee_id: employee.id,
      name: employee.name,

      department: employee.department,
      role: employee.role,
      sector_id: employee.sectorId,
    });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: list-employees
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/list-employees', async (c) => {
  try {
    const { slack_id, department, status, sector_id } = await c.req.json<{
      slack_id?: string; department?: string; status?: string; sector_id?: string;
    }>();

    const auth = await resolveAndAuthorize(c, slack_id, 'hr', 'employees', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    let conditions = [];
    if (department) conditions.push(eq(schema.employees.department, department));
    if (status) conditions.push(eq(schema.employees.employmentStatus, status));
    if (sector_id) conditions.push(eq(schema.employees.sectorId, sector_id));

    const rows = await db.query.employees.findMany({
      where: conditions.length > 0 ? (conditions.length > 1 ? and(...conditions) : conditions[0]) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: get-employee
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/get-employee', async (c) => {
  try {
    const { slack_id, employee_id, target_slack_id } = await c.req.json<{ slack_id?: string; employee_id?: string; target_slack_id?: string }>();
    
    const auth = await resolveAndAuthorize(c, slack_id, 'hr', 'employees', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    let where;
    if (employee_id) where = eq(schema.employees.id, employee_id);
    else if (target_slack_id) where = eq(schema.employees.slackId, target_slack_id);

    const row = await db.query.employees.findFirst({ where });
    if (!row) return notFound(c, 'Employee not found');
    return ok(c, row);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: list-universal-tasks (NEW Unified Task System)
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/list-universal-tasks', async (c) => {
  try {
    const { slack_id, assignee_id, committee_id, department, status } = await c.req.json<{
      slack_id?: string; assignee_id?: string; committee_id?: string; department?: string; status?: string;
    }>();

    const targetDept = department || 'tech';
    const auth = await resolveAndAuthorize(c, slack_id, targetDept.toLowerCase(), 'tasks', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    
    let conditions = [];
    if (assignee_id) conditions.push(eq(schema.universalTasks.assigneeId, assignee_id));
    if (committee_id) conditions.push(eq(schema.universalTasks.committeeId, committee_id));
    if (department) conditions.push(eq(schema.universalTasks.department, department));
    if (status) conditions.push(eq(schema.universalTasks.status, status));

    const rows = await db.query.universalTasks.findMany({
      where: conditions.length > 0 ? (conditions.length > 1 ? and(...conditions) : conditions[0]) : undefined,
      orderBy: [desc(schema.universalTasks.createdAt)]
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: create-universal-task
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/create-universal-task', async (c) => {
  try {
    const { slack_id, ...body } = await c.req.json<{ slack_id?: string; [k: string]: any }>();
    const title = body.title || 'Untitled Task';
    const status = body.status || 'todo';
    const department = body.department || 'Tech';

    const auth = await resolveAndAuthorize(c, slack_id, department.toLowerCase(), 'tasks', 'edit');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    const id = generateId('task');
    await db.insert(schema.universalTasks).values({
      ...body,
      id,
      title,
      status,
      department,
      creatorId: auth.userId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await logAudit(c.env, auth.userId!, 'CREATE', 'universal_tasks', id, { ...body, title, status, department });
    return ok(c, { id, created: true }, 201);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: update-universal-task
═══════════════════════════════════════════════════════════════ */
mcpRouter.patch('/update-universal-task', async (c) => {
  try {
    const { slack_id, task_id, ...fields } = await c.req.json<{ slack_id?: string; task_id: string; [k: string]: any }>();
    if (!task_id) return badRequest(c, 'task_id required');
    
    const db = getDb(c.env);
    const task = await db.query.universalTasks.findFirst({ where: eq(schema.universalTasks.id, task_id) });
    if (!task) return notFound(c, 'Task not found');

    const auth = await resolveAndAuthorize(c, slack_id, task.department.toLowerCase(), 'tasks', 'edit');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    await db.update(schema.universalTasks)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(schema.universalTasks.id, task_id));
    await logAudit(c.env, auth.userId!, 'UPDATE', 'universal_tasks', task_id, fields);
    return ok(c, { task_id, updated: true });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: get-user-dashboard (Personal metrics for agents)
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/get-user-dashboard', async (c) => {
  try {
    const { slack_id, target_user_id } = await c.req.json<{ slack_id?: string; target_user_id?: string }>();
    
    const auth = await resolveAndAuthorize(c, slack_id, 'dashboard', 'overview', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    const userToFetch = target_user_id || auth.employeeId;
    if (!userToFetch) return badRequest(c, 'User or Employee ID required');
    
    // Aggregate stats
    const tasks = await db.query.universalTasks.findMany({ where: eq(schema.universalTasks.assigneeId, userToFetch!) });
    const stats = {
      total_tasks: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
    };

    const employee = await db.query.employees.findFirst({
      where: eq(schema.employees.id, userToFetch!)
    });

    return ok(c, { stats, recent_tasks: tasks.slice(0, 10), employee });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: provision-crm (Admin only)
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/provision-crm', async (c) => {
  try {
    const { slack_id, committee_id, employee_ids } = await c.req.json<{ slack_id?: string; committee_id: string; employee_ids?: string[] }>();
    if (!committee_id) return badRequest(c, 'committee_id required');
    
    const auth = await resolveAndAuthorize(c, slack_id, 'ops', 'committees', 'edit');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    
    // 1. Check if committee exists
    const committee = await db.query.committees.findFirst({ where: eq(schema.committees.id, committee_id) });
    if (!committee) return notFound(c, 'Committee not found');

    // 2. Grant App Access to 'crm' for employees
    if (employee_ids && employee_ids.length > 0) {
      for (const eid of employee_ids) {
        // We need to find the login ID for this employee
        const login = await db.query.usersLogins.findFirst({ where: eq(schema.usersLogins.employeeId, eid) });
        if (login) {
          await db.insert(schema.userAppAccess).values({
            id: generateId('acc'),
            userId: login.id,
            appName: 'crm',
            accessLevel: 'employee',
            createdAt: new Date()
          }).onConflictDoNothing();
        }
      }
    }

    await logAudit(c.env, auth.userId!, 'PROVISION', 'committees', committee_id, { employee_ids });
    return ok(c, { committee_id, provisioned: true });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: update-employee (Admin only)
═══════════════════════════════════════════════════════════════ */
mcpRouter.patch('/update-employee', async (c) => {
  try {
    const { slack_id, employee_id, ...fields } = await c.req.json<{ slack_id?: string; employee_id: string; [k: string]: any }>();
    if (!employee_id) return badRequest(c, 'employee_id required');

    const auth = await resolveAndAuthorize(c, slack_id, 'hr', 'employees', 'edit');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    await db.update(schema.employees).set({ ...fields, updatedAt: new Date() }).where(eq(schema.employees.id, employee_id));
    await logAudit(c.env, auth.userId!, 'UPDATE', 'employees', employee_id, fields);
    return ok(c, { employee_id, updated: true });
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: list-projects
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/list-projects', async (c) => {
  try {
    const { slack_id } = await c.req.json<{ slack_id?: string }>();
    const auth = await resolveAndAuthorize(c, slack_id, 'tech', 'projects', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    const rows = await db.query.projects.findMany();
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: list-campaigns
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/list-campaigns', async (c) => {
  try {
    const { slack_id } = await c.req.json<{ slack_id?: string }>();
    const auth = await resolveAndAuthorize(c, slack_id, 'acquisition', 'campaigns', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    const rows = await db.query.campaigns.findMany();
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: list-clients
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/list-clients', async (c) => {
  try {
    const { slack_id } = await c.req.json<{ slack_id?: string }>();
    const auth = await resolveAndAuthorize(c, slack_id, 'ops', 'clients', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    const rows = await db.query.clients.findMany();
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   TOOL: list-sectors
═══════════════════════════════════════════════════════════════ */
mcpRouter.post('/list-sectors', async (c) => {
  try {
    const { slack_id } = await c.req.json<{ slack_id?: string }>();
    const auth = await resolveAndAuthorize(c, slack_id, 'hr', 'employees', 'view');
    if (!auth.authorized) return c.json({ success: false, error: auth.error }, 403);

    const db = getDb(c.env);
    const rows = await db.query.sectors.findMany();
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/* ═══════════════════════════════════════════════════════════════
   META: Tool discovery
═══════════════════════════════════════════════════════════════ */
mcpRouter.get('/tools', async (c) => {
  const allTools = [
    { name: 'resolve-identity',      description: 'Resolve Slack ID to employee record' },
    { name: 'list-employees',        description: 'List employees (Slack Auth required)' },
    { name: 'get-employee',          description: 'Get single employee (Slack Auth required)' },
    { name: 'list-universal-tasks',  description: 'List tasks (Slack Auth required)' },
    { name: 'create-universal-task', description: 'Create task (Slack Auth required)' },
    { name: 'update-universal-task', description: 'Update task (Slack Auth required)' },
    { name: 'get-user-dashboard',    description: 'Get dashboard stats (Slack Auth required)' },
    { name: 'list-projects',         description: 'List projects (Slack Auth required)' },
    { name: 'list-campaigns',        description: 'List campaigns (Slack Auth required)' },
    { name: 'list-clients',          description: 'List corporate clients (Slack Auth required)' },
    { name: 'list-sectors',          description: 'List sectors (Slack Auth required)' },
    { name: 'update-employee',       description: 'Update employee (Admin only, Slack Auth required)' },
    { name: 'provision-crm',         description: 'Launch CRM instance (Admin only, Slack Auth required)' },
    { name: 'log-audit',             description: 'Manually write to audit log' },
  ];

  return ok(c, { tools: allTools });
});

export default mcpRouter;
