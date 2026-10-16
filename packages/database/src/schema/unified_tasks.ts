import { sqliteTable, text, integer, real, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { usersLogins } from './auth';
import { employees, committees } from './core';
import { appointments } from './hr';

export const universalTasks = sqliteTable('universal_tasks', {
  id: text('task_id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(), // todo | in_progress | completed | blocked
  priority: text('priority'), // low | medium | high | urgent
  department: text('department').notNull(), // HR | Finance | Legal | Ops | Acquisition | Tech
  taskType: text('task_type'), // operational | administrative | technical | review | urgent | meeting
  
  // Relations
  creatorId: text('creator_id').references(() => usersLogins.id),
  
  // Assignment to appointments and committees
  appointmentId: text('appointment_id').references(() => appointments.id),
  committeeId: text('committee_id').references(() => committees.id),
  
  // Drag-and-drop ordering within a status column
  boardPosition: integer('board_position').default(0),
  
  // Generic link to other entities (e.g. project_id, etc.)
  relatedEntityId: text('related_entity_id'),
  relatedEntityType: text('related_entity_type'),
  
  startDate: text('start_date'),
  dueDate: text('due_date'),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),

  // Set on a task created by a repeating series (migration 0054): which series, and
  // the instant (UTC ms) of the occurrence it stands for. Unique together.
  recurrenceId: text('recurrence_id').references((): AnySQLiteColumn => taskRecurrences.id),
  occurrenceAt: integer('occurrence_at'),
});

/**
 * A repeating task: the task it produces and when. Each occurrence is created as
 * an ordinary `universal_tasks` row by src/tasks/recurring.ts; the rule's meaning
 * is defined in src/tasks/recurrence.ts.
 */
export const taskRecurrences = sqliteTable('task_recurrences', {
  id: text('recurrence_id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority'),
  department: text('department').notNull(),
  taskType: text('task_type'),
  committeeId: text('committee_id').references(() => committees.id),
  appointmentId: text('appointment_id').references(() => appointments.id),
  creatorId: text('creator_id').references(() => usersLogins.id),
  /** JSON array of employee ids. */
  assigneeIds: text('assignee_ids').notNull().default('[]'),

  frequency: text('frequency').notNull(), // hourly | daily | weekly | monthly
  interval: integer('interval').notNull().default(1),
  /** '1,3,5' — 0 is Sunday. Weekly only. */
  weekdays: text('weekdays'),
  monthDay: integer('month_day'),
  timeOfDay: text('time_of_day').notNull().default('09:00'),
  timezone: text('timezone').notNull(),
  startsOn: text('starts_on').notNull(),
  endsOn: text('ends_on'),

  /** UTC ms of the first occurrence not yet created; null once ended or stopped. */
  nextRunAt: integer('next_run_at'),
  occurrenceCount: integer('occurrence_count').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const taskAssignments = sqliteTable('task_assignments', {
  id: text('assignment_id').primaryKey(),
  taskId: text('task_id').notNull().references(() => universalTasks.id),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull(),
});
