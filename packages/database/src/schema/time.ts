import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { employees } from './core';
import { universalTasks } from './unified_tasks';

/**
 * Time logging — see docs/attendance-design.md.
 *
 * Replaces `attendance` (one check-in/check-out row per day). Pay is per task and
 * there are no required hours, so nothing here is a schedule, a status or a
 * target: a day exists only because somebody logged time on it, and the intervals
 * are the record. No "late", no "absent", no "overtime".
 *
 * Every instant in these two tables is UTC epoch MILLISECONDS — not the seconds
 * that `mode: 'timestamp'` columns hold elsewhere — because an interval is
 * subtracted from another constantly and second precision would round every
 * pause. Local dates and hours are computed at read time from `work_days.timezone`.
 */
export const workDays = sqliteTable('work_days', {
  id: text('work_day_id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  /** YYYY-MM-DD in `timezone`, fixed when the day's first entry starts. */
  workDate: text('work_date').notNull(),
  /**
   * The employee's timezone when this day began. Snapshotted so that somebody
   * moving from Karachi to Dubai does not have their history re-dated.
   */
  timezone: text('timezone').notNull(),
  /** Caches of closed entries, recomputed on every write. The entries are the truth. */
  loggedMs: integer('logged_ms').notNull().default(0),
  pausedMs: integer('paused_ms').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const timeEntries = sqliteTable('time_entries', {
  id: text('time_entry_id').primaryKey(),
  dayId: text('work_day_id').notNull().references(() => workDays.id),
  /** Denormalised from the day for `time_entries_one_open`: one running interval per person. */
  employeeId: text('employee_id').notNull().references(() => employees.id),
  kind: text('kind').notNull(), // work | pause
  startedAt: integer('started_at').notNull(),
  /** Null while running. */
  endedAt: integer('ended_at'),
  /** Work only. Null is general / untracked work. */
  taskId: text('task_id').references(() => universalTasks.id),
  note: text('note'),
  source: text('source').notNull(), // timer | manual | legacy
  /**
   * A backfilled "about two hours on Tuesday": placed at noon local with the right
   * length, counted in every total, left out of the hour-of-day profile.
   */
  timeUnknown: integer('time_unknown', { mode: 'boolean' }).notNull().default(false),
  /** Closed by the forgotten-timer sweep; excluded from reports by default. */
  autoClosed: integer('auto_closed', { mode: 'boolean' }).notNull().default(false),
  /** Set on edit. The `original*` columns hold what was first recorded, kept on the FIRST edit only. */
  editedAt: integer('edited_at'),
  originalStartedAt: integer('original_started_at'),
  originalEndedAt: integer('original_ended_at'),
  originalTaskId: text('original_task_id'),
  createdAt: integer('created_at').notNull(),
});
