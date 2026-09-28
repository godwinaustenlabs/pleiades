import { eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { appUrl, dispatch } from './events';

/**
 * Emails the people a task was just assigned to.
 *
 * Sits beside the Slack post in `src/routes/tasks.ts` rather than replacing it:
 * Slack is where work is discussed and email is where it is not missed, and the
 * one notification this system had went only to people who had a `slack_id` on
 * file, which is not everybody.
 *
 * Two things make this safe to call from inside a task handler:
 *
 *  1. It never throws. A task creation must not fail because a notification
 *     could not be addressed — `employees.email` is nullable and plenty of rows
 *     have nothing in it.
 *  2. The idempotency key is `task_assigned:<task>:<employee>`, so a given person
 *     is emailed about a given task exactly once, for the life of that task. That
 *     matters more here than anywhere else in the system: PATCH /tasks/:id
 *     deletes every assignment row and re-inserts them on every edit, so without
 *     this, changing a due date would re-notify the whole team.
 */
export async function notifyTaskAssigned(
  env: Env,
  task: { id: string; title: string; department: string; dueDate?: string | null },
  employeeIds: string[],
): Promise<void> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (ids.length === 0) return;

  try {
    const db = getDb(env);

    const employees = await db.query.employees.findMany({
      where: inArray(schema.employees.id, ids),
      columns: { id: true, name: true, email: true },
    });

    for (const emp of employees) {
      if (!emp.email) continue;

      // The login is only needed to honour an opt-out. `users_logins.employeeId`
      // is a soft link with no foreign key, so plenty of employees have none —
      // and an absent login means the notification simply cannot be opted out of,
      // which is the right default for someone with no account to set it in.
      const login = await db.query.usersLogins.findFirst({
        where: eq(schema.usersLogins.employeeId, emp.id),
        columns: { id: true },
      });

      const result = await dispatch(env, {
        event: 'task_assigned',
        to: [{ email: emp.email, ...(emp.name ? { name: emp.name } : {}) }],
        values: {
          assigneeName: emp.name ?? 'there',
          taskTitle: task.title,
          department: task.department,
          dueDate: task.dueDate || 'no due date',
          taskUrl: appUrl(env, `/${task.department.toLowerCase()}`),
        },
        idempotencyKey: `task_assigned:${task.id}:${emp.id}`,
        recipientUserId: login?.id ?? null,
      });

      // Logged rather than surfaced: the caller is a task handler and the person
      // creating the task is not the person who can fix a missing address.
      if (!result.sent) {
        console.warn(`[email] task_assigned to ${emp.id} not sent: ${result.reason}`);
      }
    }
  } catch (err) {
    console.error('[email] notifyTaskAssigned failed:', err);
  }
}
