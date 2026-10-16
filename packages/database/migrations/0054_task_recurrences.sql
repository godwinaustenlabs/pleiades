-- Repeating tasks.
--
-- A series is one `task_recurrences` row: the task it produces (title, people,
-- department) and when (the rule). Each occurrence becomes an ORDINARY
-- `universal_tasks` row carrying `recurrence_id` and `occurrence_at`, so boards,
-- the workspace, the calendar, time logging and permissions all treat it as the
-- task it is, with no special case anywhere downstream. See src/tasks/recurring.ts.
--
-- Purely additive: a new table, two nullable columns, three indexes. Nothing
-- existing is rewritten, so no table rebuild and no foreign-key deferral.

CREATE TABLE task_recurrences (
  recurrence_id   TEXT PRIMARY KEY NOT NULL,

  -- The task each occurrence is created from.
  title           TEXT NOT NULL,
  description     TEXT,
  priority        TEXT,
  department      TEXT NOT NULL,
  task_type       TEXT,
  committee_id    TEXT REFERENCES committees(committee_id),
  appointment_id  TEXT REFERENCES appointments(appointment_id),
  creator_id      TEXT REFERENCES users_logins(id),
  -- JSON array of employee ids. Not a join table: it is a template, read whole when
  -- an occurrence is created, and every occurrence gets real task_assignments rows.
  -- Ids that have since left or been deleted are skipped at creation time.
  assignee_ids    TEXT NOT NULL DEFAULT '[]',

  -- The rule. See src/tasks/recurrence.ts for exactly what each combination means.
  frequency       TEXT NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
  interval        INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
  weekdays        TEXT,              -- '1,3,5' (0 = Sunday); weekly only
  month_day       INTEGER CHECK (month_day IS NULL OR month_day BETWEEN 1 AND 31),
  time_of_day     TEXT NOT NULL DEFAULT '09:00',
  timezone        TEXT NOT NULL,
  starts_on       TEXT NOT NULL,
  ends_on         TEXT,

  -- The first occurrence not yet created as a task. NULL once the rule has ended
  -- or the series was stopped.
  next_run_at       INTEGER,
  occurrence_count  INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- What the cron asks every five minutes: which live series have something due.
CREATE INDEX task_recurrences_due ON task_recurrences (next_run_at) WHERE is_active = 1;

ALTER TABLE universal_tasks ADD COLUMN recurrence_id TEXT REFERENCES task_recurrences(recurrence_id);
ALTER TABLE universal_tasks ADD COLUMN occurrence_at INTEGER;

-- One task per occurrence, enforced by the database. Two cron runs overlapping, or
-- a run racing the request that created the series, conflict here and write nothing.
CREATE UNIQUE INDEX universal_tasks_occurrence_unique
  ON universal_tasks (recurrence_id, occurrence_at) WHERE recurrence_id IS NOT NULL;
