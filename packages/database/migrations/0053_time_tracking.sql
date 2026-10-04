-- Time logging replaces attendance.
--
-- `attendance` held one check-in/check-out pair per person per day, as wall-clock
-- strings produced by `toLocaleTimeString` on a Worker — i.e. UTC — which the
-- dashboard then parsed as LOCAL time, filed under the UTC date, and subtracted
-- across midnight into negative hours. It also carried `Late` / `Absent` /
-- `Overtime` statuses, which presume a required schedule this company does not have.
--
-- The replacement records intervals: work and pause, each optionally on a task,
-- as UTC epoch milliseconds, grouped into days by the employee's own timezone.
-- See docs/attendance-design.md for the reasoning, and schema/time.ts.

-- ── The employee's timezone ─────────────────────────────────────────────────
ALTER TABLE employees ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Karachi';

-- ── Days ─────────────────────────────────────────────────────────────────────
CREATE TABLE work_days (
  work_day_id  TEXT PRIMARY KEY NOT NULL,
  employee_id  TEXT NOT NULL REFERENCES employees(employee_id),
  work_date    TEXT NOT NULL,
  timezone     TEXT NOT NULL,
  logged_ms    INTEGER NOT NULL DEFAULT 0,
  paused_ms    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX work_days_employee_date_unique ON work_days (employee_id, work_date);

-- ── Intervals ────────────────────────────────────────────────────────────────
CREATE TABLE time_entries (
  time_entry_id        TEXT PRIMARY KEY NOT NULL,
  work_day_id          TEXT NOT NULL REFERENCES work_days(work_day_id),
  employee_id          TEXT NOT NULL REFERENCES employees(employee_id),
  kind                 TEXT NOT NULL CHECK (kind IN ('work', 'pause')),
  started_at           INTEGER NOT NULL,
  ended_at             INTEGER,
  task_id              TEXT REFERENCES universal_tasks(task_id),
  note                 TEXT,
  source               TEXT NOT NULL CHECK (source IN ('timer', 'manual', 'legacy')),
  time_unknown         INTEGER NOT NULL DEFAULT 0,
  auto_closed          INTEGER NOT NULL DEFAULT 0,
  edited_at            INTEGER,
  original_started_at  INTEGER,
  original_ended_at    INTEGER,
  original_task_id     TEXT,
  created_at           INTEGER NOT NULL,
  CHECK (ended_at IS NULL OR ended_at > started_at),
  CHECK (kind = 'work' OR task_id IS NULL)
);

-- The load-bearing one. At most one RUNNING interval per person: two tabs, a
-- double-click or a phone and a laptop cannot produce two timers, because the
-- second insert is refused here rather than by a check somebody might skip.
CREATE UNIQUE INDEX time_entries_one_open ON time_entries (employee_id) WHERE ended_at IS NULL;
CREATE INDEX idx_time_entries_day  ON time_entries (work_day_id);
CREATE INDEX idx_time_entries_task ON time_entries (task_id);
CREATE INDEX idx_time_entries_employee_start ON time_entries (employee_id, started_at);

-- ── The old rows ─────────────────────────────────────────────────────────────
-- Every attendance row with a check-in becomes a day. Timezone 'UTC', because the
-- old dates and times WERE UTC — labelling them Karachi would shift every one by
-- five hours. Duplicate rows for one person and date (HR could POST them freely)
-- collapse into one day. `status` is deliberately not carried: Late, Absent and
-- Overtime are exactly what this replaces.
INSERT OR IGNORE INTO work_days (work_day_id, employee_id, work_date, timezone, logged_ms, paused_ms, created_at, updated_at)
SELECT
  'wkd_' || lower(hex(randomblob(16))),
  a.employee_id, a.date, 'UTC', 0, 0,
  MIN(a.created_at) * 1000, MIN(a.created_at) * 1000
FROM attendance a
JOIN employees e ON e.employee_id = a.employee_id
WHERE a.check_in IS NOT NULL AND a.date IS NOT NULL
GROUP BY a.employee_id, a.date;

-- Each row with a usable check-in AND check-out becomes one closed work interval;
-- two such rows for one day are two stints and both are kept, while an exact
-- duplicate (same person, same start and end) is kept once.
-- Two formats exist: the self-service "HH:MM:SS" (a time on `date`), and whatever
-- HR posted by hand, which may be a full ISO instant. unixepoch() returns NULL for
-- anything it cannot read — including the "24:05:00" some engines emit for
-- midnight — and such rows get a day but no entry. Inventing an end time would put
-- a made-up number into history.
INSERT INTO time_entries (time_entry_id, work_day_id, employee_id, kind, started_at, ended_at, task_id, note, source, time_unknown, auto_closed, created_at)
SELECT
  'tme_' || lower(hex(randomblob(16))),
  d.work_day_id, x.employee_id, 'work', x.s * 1000, x.e * 1000, NULL, NULL, 'legacy', 0, 0, x.created_at * 1000
FROM (
  SELECT
    a.employee_id, a.date, a.created_at,
    COALESCE(unixepoch(a.date || ' ' || a.check_in), unixepoch(a.check_in)) AS s,
    COALESCE(unixepoch(a.date || ' ' || a.check_out), unixepoch(a.check_out)) AS e,
    ROW_NUMBER() OVER (
      PARTITION BY a.employee_id, a.date,
        COALESCE(unixepoch(a.date || ' ' || a.check_in), unixepoch(a.check_in)),
        COALESCE(unixepoch(a.date || ' ' || a.check_out), unixepoch(a.check_out))
      ORDER BY a.created_at, a.id
    ) AS rn
  FROM attendance a
  WHERE a.check_in IS NOT NULL AND a.check_out IS NOT NULL
) x
JOIN work_days d ON d.employee_id = x.employee_id AND d.work_date = x.date
WHERE x.rn = 1 AND x.s IS NOT NULL AND x.e IS NOT NULL AND x.e > x.s;

UPDATE work_days SET logged_ms = COALESCE((
  SELECT SUM(t.ended_at - t.started_at) FROM time_entries t
  WHERE t.work_day_id = work_days.work_day_id AND t.kind = 'work' AND t.ended_at IS NOT NULL
), 0);

-- `attendance` itself stays for now. It is dropped in a later migration, once the
-- row counts and hour totals above have been compared on pleiades-db — keeping it
-- one release is cheap, and it is what makes this copy checkable.

-- ── hr/attendance ────────────────────────────────────────────────────────────
-- Attendance was gated on hr/employees. It gets its own feature, copied from that
-- grant at the same three levels so nobody's access changes today, and in BOTH
-- grant tables — a migration remembering only one would silently narrow whoever
-- held hr/employees through a post (see 0050).
INSERT INTO user_app_permissions
	(id, user_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT
	'uap_' || lower(hex(randomblob(16))),
	p.user_id, 'hr', 'attendance',
	p.can_view, p.can_edit, p.can_delete,
	unixepoch(), unixepoch()
FROM user_app_permissions p
WHERE p.app_name = 'hr' AND p.feature = 'employees'
  AND NOT EXISTS (
    SELECT 1 FROM user_app_permissions q
    WHERE q.user_id = p.user_id AND q.app_name = 'hr' AND q.feature = 'attendance'
  );

INSERT INTO appointment_app_permissions
	(id, appointment_id, app_name, feature, can_view, can_edit, can_delete, created_at, updated_at)
SELECT
	'aap_' || lower(hex(randomblob(16))),
	p.appointment_id, 'hr', 'attendance',
	p.can_view, p.can_edit, p.can_delete,
	unixepoch(), unixepoch()
FROM appointment_app_permissions p
WHERE p.app_name = 'hr' AND p.feature = 'employees'
  AND NOT EXISTS (
    SELECT 1 FROM appointment_app_permissions q
    WHERE q.appointment_id = p.appointment_id AND q.app_name = 'hr' AND q.feature = 'attendance'
  );
