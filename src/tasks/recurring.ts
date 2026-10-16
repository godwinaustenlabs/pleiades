import { and, eq, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import type { Env } from '../index';
import { generateId } from '../utils/id';
import { chunk } from '../utils/batch';
import { localDate } from '../time/clock';
import { deleteTasks } from './delete';
import {
  MAX_LEAD_MS, describeRule, nextOccurrence, occurrencesBetween, parseRule, plan,
  type Rule, type RuleInput,
} from './recurrence';

/**
 * Repeating tasks — the writes. The rule itself is `./recurrence.ts`.
 *
 * ## Occurrences are ordinary tasks
 *
 * A series never appears anywhere as itself. Each occurrence is created as a real
 * `universal_tasks` row — with the series' department, committee, post and real
 * `task_assignments` — shortly before it is due, and from then on it IS a task:
 * every board, the workspace, the calendar, the ICS feed, time logging and the
 * permission checks see it with no special case. Completing, editing or deleting
 * one occurrence touches that occurrence only.
 *
 * ## Exactly once
 *
 * Creation runs from the five-minute cron and from the request that creates or
 * edits a series, and nothing stops two of those overlapping. So an occurrence's
 * task id is DERIVED from (series, instant) rather than random, and
 * `universal_tasks_occurrence_unique` makes (recurrence_id, occurrence_at) unique:
 * every insert is `ON CONFLICT DO NOTHING`, and a second writer finds the work done.
 * Advancing `next_run_at` is a compare-and-set on its old value, in the same batch.
 *
 * ## Notifications
 *
 * Assignees are emailed once, when the series is created — not per occurrence.
 * Resend's allowance is ninety mails a day for the whole company, and an hourly
 * task would spend it before lunch.
 */

type Db = ReturnType<typeof getDb>;
export type RecurrenceRow = typeof schema.taskRecurrences.$inferSelect;

/** The fields of a series that each occurrence copies. */
export interface SeriesTemplate {
  title: string;
  description?: string | null;
  priority?: string | null;
  department: string;
  taskType?: string | null;
  committeeId?: string | null;
  appointmentId?: string | null;
  assigneeIds: string[];
}

/* ── Row ↔ rule ───────────────────────────────────────────────────────────── */

export function ruleOf(row: RecurrenceRow): Rule {
  return {
    frequency: row.frequency as Rule['frequency'],
    interval: row.interval,
    weekdays: row.weekdays ? row.weekdays.split(',').map(Number) : [],
    monthDay: row.monthDay,
    timeOfDay: row.timeOfDay,
    timezone: row.timezone,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
  };
}

function ruleColumns(rule: Rule) {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.frequency === 'weekly' ? rule.weekdays.join(',') : null,
    monthDay: rule.frequency === 'monthly' ? rule.monthDay : null,
    timeOfDay: rule.timeOfDay,
    timezone: rule.timezone,
    startsOn: rule.startsOn,
    endsOn: rule.endsOn,
  };
}

export function assigneesOf(row: Pick<RecurrenceRow, 'assigneeIds'>): string[] {
  try {
    const v = JSON.parse(row.assigneeIds);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  } catch {
    return [];
  }
}

/** The series as the API returns it: the row, its rule in words, its people. */
export function present(row: RecurrenceRow) {
  return { ...row, assigneeIds: assigneesOf(row), weekdays: ruleOf(row).weekdays, summary: describeRule(ruleOf(row)) };
}

export { parseRule, type RuleInput };

/* ── Creating occurrences ─────────────────────────────────────────────────── */

async function sha32(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The task id an occurrence always gets. Derived, so a second writer collides. */
export async function occurrenceTaskId(recurrenceId: string, occurrenceAt: number): Promise<string> {
  return `task_${await sha32(`${recurrenceId}@${occurrenceAt}`)}`;
}

/** The assignees who can still be given work: they exist and are active. */
async function activeAssignees(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found: string[] = [];
  for (const part of chunk([...new Set(ids)], 50)) {
    const rows = await db.query.employees.findMany({
      where: and(inArray(schema.employees.id, part), eq(schema.employees.employmentStatus, 'active')),
      columns: { id: true },
    });
    found.push(...rows.map((r) => r.id));
  }
  return ids.filter((id) => found.includes(id));
}

/**
 * Creates whatever this series has due now, and moves it on.
 * Returns the ids of the occurrence tasks it wrote (or found already written).
 */
export async function materialize(db: Db, row: RecurrenceRow, now: number): Promise<string[]> {
  if (!row.isActive || row.nextRunAt === null) return [];
  const rule = ruleOf(row);
  const { create, nextRunAt } = plan(rule, row.nextRunAt, now);
  if (create.length === 0 && nextRunAt === row.nextRunAt) return [];

  const people = await activeAssignees(db, assigneesOf(row));
  const stamp = new Date(now);
  const writes: unknown[] = [];
  const taskIds: string[] = [];

  for (const at of create) {
    const id = await occurrenceTaskId(row.id, at);
    const day = localDate(at, rule.timezone);
    taskIds.push(id);
    writes.push(
      db.insert(schema.universalTasks).values({
        id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        department: row.department,
        taskType: row.taskType,
        committeeId: row.committeeId,
        appointmentId: row.appointmentId,
        creatorId: row.creatorId,
        status: 'todo',
        boardPosition: 0,
        startDate: day,
        dueDate: day,
        recurrenceId: row.id,
        occurrenceAt: at,
        createdAt: stamp,
        updatedAt: stamp,
      }).onConflictDoNothing(),
    );
    const assignments = await Promise.all(people.map(async (employeeId) => ({
      id: `tassign_${await sha32(`${id}@${employeeId}`)}`,
      taskId: id,
      employeeId,
      assignedAt: stamp,
    })));
    for (const part of chunk(assignments, 20)) {
      writes.push(db.insert(schema.taskAssignments).values(part).onConflictDoNothing());
    }
  }

  // Compare-and-set: only the writer that read this `next_run_at` moves it.
  writes.push(
    db.update(schema.taskRecurrences)
      .set({
        nextRunAt,
        occurrenceCount: sql`${schema.taskRecurrences.occurrenceCount} + ${create.length}`,
        updatedAt: stamp,
      })
      .where(and(eq(schema.taskRecurrences.id, row.id), eq(schema.taskRecurrences.nextRunAt, row.nextRunAt))),
  );

  await db.batch(writes as unknown as [never, ...never[]]);
  return taskIds;
}

/**
 * The cron's half: every live series with something inside its lead window.
 * Bounded per run, oldest first, so a backlog drains over a few ticks rather than
 * one invocation trying to do all of it.
 */
export async function runDueSeries(env: Env, now: number, limit = 100): Promise<number> {
  const db = getDb(env);
  const due = await db.query.taskRecurrences.findMany({
    where: and(
      eq(schema.taskRecurrences.isActive, true),
      isNotNull(schema.taskRecurrences.nextRunAt),
      lte(schema.taskRecurrences.nextRunAt, now + MAX_LEAD_MS),
    ),
    orderBy: (r, { asc }) => [asc(r.nextRunAt)],
    limit,
  });
  let created = 0;
  for (const row of due) {
    try {
      created += (await materialize(db, row, now)).length;
    } catch (err) {
      // One broken series (an FK to something deleted by hand, say) must not stop
      // the rest; it is retried on the next tick and logged until someone looks.
      console.error(`[recurring] series ${row.id} failed:`, err);
    }
  }
  return created;
}

/* ── Series lifecycle ─────────────────────────────────────────────────────── */

/** Creates a series and its first occurrences. */
export async function createSeries(
  db: Db,
  template: SeriesTemplate,
  rule: Rule,
  creatorId: string | null,
  now: number,
): Promise<{ row: RecurrenceRow; taskIds: string[] }> {
  const stamp = new Date(now);
  const row: RecurrenceRow = {
    id: generateId('trec'),
    title: template.title.trim(),
    description: template.description ?? null,
    priority: template.priority ?? null,
    department: template.department.trim(),
    taskType: template.taskType ?? null,
    committeeId: template.committeeId || null,
    appointmentId: template.appointmentId || null,
    creatorId,
    assigneeIds: JSON.stringify([...new Set(template.assigneeIds.filter(Boolean))]),
    ...ruleColumns(rule),
    // The very first occurrence; `plan` decides what of it is due.
    nextRunAt: nextOccurrence(rule, Number.NEGATIVE_INFINITY),
    occurrenceCount: 0,
    isActive: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await db.insert(schema.taskRecurrences).values(row);
  const taskIds = await materialize(db, row, now);
  return { row, taskIds };
}

/**
 * The occurrences this series has created that have not happened yet and that
 * nobody has started. Those are the ones an edit replaces and a stop removes;
 * anything already under way, or in the past, is somebody's work and stays.
 */
async function untouchedFuture(db: Db, recurrenceId: string, now: number): Promise<string[]> {
  const rows = await db.query.universalTasks.findMany({
    where: and(
      eq(schema.universalTasks.recurrenceId, recurrenceId),
      gt(schema.universalTasks.occurrenceAt, now),
      eq(schema.universalTasks.status, 'todo'),
    ),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Applies an edit to a series. It changes what FUTURE occurrences look like and
 * when they fall: untouched upcoming occurrences are removed and re-created from
 * the new version; past and started ones are left exactly as they are.
 */
export async function updateSeries(
  env: Env,
  db: Db,
  row: RecurrenceRow,
  changes: Partial<SeriesTemplate> & { rule?: Rule },
  now: number,
): Promise<{ row: RecurrenceRow; removed: number; taskIds: string[] }> {
  const rule = changes.rule ?? ruleOf(row);
  const next: RecurrenceRow = {
    ...row,
    ...(changes.title !== undefined ? { title: changes.title.trim() } : {}),
    ...(changes.description !== undefined ? { description: changes.description ?? null } : {}),
    ...(changes.priority !== undefined ? { priority: changes.priority ?? null } : {}),
    ...(changes.taskType !== undefined ? { taskType: changes.taskType ?? null } : {}),
    ...(changes.committeeId !== undefined ? { committeeId: changes.committeeId || null } : {}),
    ...(changes.assigneeIds !== undefined ? { assigneeIds: JSON.stringify([...new Set(changes.assigneeIds.filter(Boolean))]) } : {}),
    ...ruleColumns(rule),
    // Resume from now: what is past already exists, and is not re-created.
    nextRunAt: row.isActive ? nextOccurrence(rule, now + 1) : null,
    updatedAt: new Date(now),
  };

  const removed = await deleteTasks(env, db, await untouchedFuture(db, row.id, now));
  await db.update(schema.taskRecurrences).set({
    title: next.title, description: next.description, priority: next.priority, taskType: next.taskType,
    committeeId: next.committeeId, assigneeIds: next.assigneeIds, ...ruleColumns(rule),
    nextRunAt: next.nextRunAt, updatedAt: next.updatedAt,
  }).where(eq(schema.taskRecurrences.id, row.id));
  const taskIds = await materialize(db, next, now);
  return { row: next, removed, taskIds };
}

/** Stops a series. Its upcoming untouched occurrences go; everything else stays. */
export async function stopSeries(env: Env, db: Db, row: RecurrenceRow, now: number): Promise<number> {
  await db.update(schema.taskRecurrences)
    .set({ isActive: false, nextRunAt: null, updatedAt: new Date(now) })
    .where(eq(schema.taskRecurrences.id, row.id));
  return deleteTasks(env, db, await untouchedFuture(db, row.id, now));
}

/* ── The calendar's view ahead ────────────────────────────────────────────── */

export interface ProjectedOccurrence {
  recurrenceId: string;
  title: string;
  department: string;
  priority: string | null;
  occurrenceAt: number;
  date: string;
  summary: string;
}

/** Hard ceiling on what one projection returns, whatever the window. */
const MAX_PROJECTED = 400;

/**
 * Occurrences these series WILL create in [from, to), past what they already have.
 *
 * Read-only — nothing is written — so a calendar can show a monthly task in
 * months it has not reached. Hourly series are not projected: a month of them is
 * seven hundred entries on one screen, which helps nobody, and the board shows the
 * ones that exist.
 */
export function project(rows: RecurrenceRow[], from: number, to: number): ProjectedOccurrence[] {
  const out: ProjectedOccurrence[] = [];
  for (const row of rows) {
    if (!row.isActive || row.nextRunAt === null || row.frequency === 'hourly') continue;
    const rule = ruleOf(row);
    const summary = describeRule(rule);
    for (const at of occurrencesBetween(rule, Math.max(from, row.nextRunAt), to, 62)) {
      out.push({
        recurrenceId: row.id, title: row.title, department: row.department, priority: row.priority,
        occurrenceAt: at, date: localDate(at, rule.timezone), summary,
      });
      if (out.length >= MAX_PROJECTED) return out;
    }
  }
  return out.sort((a, b) => a.occurrenceAt - b.occurrenceAt);
}

/** Live series in one person's workspace: assigned to them, or on their post or committee. */
export async function workspaceSeries(db: Db, employeeId: string, refs: { appointmentIds: string[]; committeeIds: string[] }) {
  const mine = sql`EXISTS (SELECT 1 FROM json_each(${schema.taskRecurrences.assigneeIds}) WHERE json_each.value = ${employeeId})`;
  const sources = [
    mine,
    refs.appointmentIds.length > 0 ? inArray(schema.taskRecurrences.appointmentId, refs.appointmentIds) : undefined,
    refs.committeeIds.length > 0 ? inArray(schema.taskRecurrences.committeeId, refs.committeeIds) : undefined,
  ].filter((s) => s !== undefined);
  return db.query.taskRecurrences.findMany({
    where: and(eq(schema.taskRecurrences.isActive, true), or(...sources)),
  });
}
