/**
 * Who may see whose time. One place, like `canUseMailbox` for mail.
 *
 * Per-person time is readable by:
 *   - the person themself;
 *   - their reporting manager (`employees.reporting_manager_id`);
 *   - the head of their department (`sectors.head_employee_id` for their
 *     `employees.sector_id` — the structured model; `employees.department` is free
 *     text and is never used for access);
 *   - anyone holding `hr/attendance` view.
 *
 * Changing an entry older than the 14-day self-service window needs the
 * department head or `hr/attendance` edit. A reporting manager can read but not
 * rewrite: the head is who the person goes to when they noticed too late.
 *
 * Every relationship is read from the database on each call, so moving somebody to
 * another sector or manager moves this access on the next request.
 */
import { checkFeaturePermission, actorEmployeeId } from '../middleware/rbac';

type Ctx = Parameters<typeof checkFeaturePermission>[0] & { env: { DB: D1Database } };

async function relationTo(c: Ctx, me: string, targetEmployeeId: string) {
  const r = await c.env.DB
    .prepare(`SELECT
                (e.reporting_manager_id = ?1) AS is_manager,
                EXISTS (SELECT 1 FROM sectors s WHERE s.sector_id = e.sector_id AND s.head_employee_id = ?1) AS is_head
              FROM employees e WHERE e.employee_id = ?2`)
    .bind(me, targetEmployeeId)
    .first<Record<string, unknown>>();
  return { isManager: !!r?.is_manager, isHead: !!r?.is_head };
}

export async function canReadTimeOf(c: Ctx, targetEmployeeId: string): Promise<boolean> {
  const me = await actorEmployeeId(c);
  if (me && me === targetEmployeeId) return true;
  if (await checkFeaturePermission(c, 'hr', 'attendance', 'view')) return true;
  if (!me) return false;
  const rel = await relationTo(c, me, targetEmployeeId);
  return rel.isManager || rel.isHead;
}

/** May change this person's entries outside the self-service window. Never on oneself. */
export async function canEditOldTimeOf(c: Ctx, targetEmployeeId: string): Promise<boolean> {
  const me = await actorEmployeeId(c);
  // Not even HR on their own record: the point of the window is that somebody
  // else makes the late change, so it is visible as somebody else's act.
  if (me && me === targetEmployeeId) return false;
  if (await checkFeaturePermission(c, 'hr', 'attendance', 'edit')) return true;
  if (!me) return false;
  return (await relationTo(c, me, targetEmployeeId)).isHead;
}

/**
 * The contributor breakdown on a task. Everybody who can see the task sees its
 * total; the split by person is for `hr/attendance`, the task's creator, its
 * contributors (a team seeing its own split is normal), and department heads with
 * somebody on it — as a contributor or an assignee.
 */
export async function canSeeTaskContributors(c: Ctx, taskId: string, creatorLoginId: string | null): Promise<boolean> {
  if (await checkFeaturePermission(c, 'hr', 'attendance', 'view')) return true;
  const user = c.get('user');
  if (creatorLoginId && user?.id === creatorLoginId) return true;
  const me = await actorEmployeeId(c);
  if (!me) return false;
  const r = await c.env.DB
    .prepare(`SELECT
                EXISTS (SELECT 1 FROM time_entries WHERE task_id = ?1 AND employee_id = ?2) AS contributed,
                EXISTS (
                  SELECT 1 FROM employees e JOIN sectors s ON s.sector_id = e.sector_id
                  WHERE s.head_employee_id = ?2
                    AND e.employee_id IN (
                      SELECT employee_id FROM time_entries WHERE task_id = ?1
                      UNION SELECT employee_id FROM task_assignments WHERE task_id = ?1)
                ) AS heads_someone`)
    .bind(taskId, me)
    .first<Record<string, unknown>>();
  return !!r?.contributed || !!r?.heads_someone;
}
