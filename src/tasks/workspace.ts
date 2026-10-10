import { eq, and, or, desc, inArray } from 'drizzle-orm';
import { schema } from '@pleiades/database';
import type { getDb } from '@pleiades/database';

type Db = ReturnType<typeof getDb>;

/**
 * Every task that belongs in one person's workspace: the ones assigned to them,
 * plus every task on a post they actively hold or a committee they sit on.
 *
 * One function because two screens show this set — the workspace calendar
 * (`GET /dashboard/me`) and the workspace Kanban (`GET /tasks?scope=workspace`).
 * They used to compute it separately, and the Kanban only looked at assignments,
 * so a committee task assigned to somebody else sat on a member's calendar and on
 * no board at all. The calendar has no delete, so nobody could remove it either.
 *
 * Newest first, each task carrying its `assignments`.
 */
export async function workspaceTasks(db: Db, employeeId: string | null) {
  if (!employeeId) return [];

  const [assignments, appointments, committees] = await Promise.all([
    db.query.taskAssignments.findMany({ where: eq(schema.taskAssignments.employeeId, employeeId) }),
    db.query.appointments.findMany({
      where: and(eq(schema.appointments.employeeId, employeeId), eq(schema.appointments.isActive, true)),
      columns: { id: true },
    }),
    db.query.committeeMembers.findMany({
      where: eq(schema.committeeMembers.employeeId, employeeId),
      columns: { committeeId: true },
    }),
  ]);

  const taskIds = assignments.map((a) => a.taskId);
  const appointmentIds = appointments.map((a) => a.id);
  const committeeIds = committees.map((c) => c.committeeId);

  const sources = [
    taskIds.length > 0 ? inArray(schema.universalTasks.id, taskIds) : undefined,
    appointmentIds.length > 0 ? inArray(schema.universalTasks.appointmentId, appointmentIds) : undefined,
    committeeIds.length > 0 ? inArray(schema.universalTasks.committeeId, committeeIds) : undefined,
  ].filter((s) => s !== undefined);
  if (sources.length === 0) return [];

  return db.query.universalTasks.findMany({
    where: or(...sources),
    orderBy: [desc(schema.universalTasks.createdAt)],
    with: { assignments: true },
  });
}
