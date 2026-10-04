# Attendance & effort tracking — design

Status: **implemented on `dev`, revision 5** · 4 Oct 2026 — migrations 0052/0053 not yet applied to `pleiades-db`

Two changes, shipped separately:

1. **Replace attendance** (one check-in/check-out row per day) with a play/pause
   log of when people work and on which task. It exists to show **how effort turns
   into finished tasks**. It doesn't measure hours owed, because none are owed.
2. **Remove the efficiency score** from the whole platform. Evaluation is manual
   (`performance_reviews`); a number on the employee record suggests otherwise.

## 0. Constraints that shape everything below

The company **does not require set hours and does not pay by the hour. It pays
per task.** That's a legal-structure constraint, not a preference, so the system
must not quietly build the opposite. Concretely:

| The system never… | Because… |
|---|---|
| defines required hours, shifts, schedules, a minimum day or a target | there is no obligation to measure against |
| labels anyone **late**, **absent**, **short** or **overtime** | each of those presumes a required schedule |
| feeds hours into payroll, payslips or the accountant agent | pay is per task; hours in a pay calculation would contradict that |
| ranks or scores people by hours | evaluation is manual; that's why the efficiency score is going |
| requires a timer to be running to do work, or nags when it isn't | logging is a record, not a condition of working |
| uses idle detection, activity tracking or screenshots | none of it is needed for the purpose, and all of it signals control |

**Wording follows the same rule.** The UI says *Start / Pause / Done for now*,
*session*, *time logged*. It never says *clock in*, *shift*, *attendance
violation* or *hours due*. Whether a feature like this sits comfortably inside
your contracts is a question for your lawyer, not something this document can
settle. Section 0 is written so they can review it in one read.

### What "efficiency" means here

**Organisational, not personal.** The questions this answers:

- **How many work hours did it take us to do this task?**
- **Who contributed, and how much?** Each contributor's hours and share of the
  task's total.
- How long do tasks of each type and department take? This is descriptive only.
  There's no estimate to measure against, because tasks aren't valued in hours
  (section 8).
- How long does a task sit between created, first worked on, and completed?
- Where does the company's time go, by department, task type and task?
- How much logged time isn't attached to any task (overhead, or untracked work)?

Contribution is reported **inside a piece of work** ("on this task, A logged
30 h, B 12 h"). It's never a score attached to a person. Per-person views exist
so that a manager doing a **manual** review has the facts in front of them. The
system produces no rating of a person.

Decisions taken so far:

| Question | Decision |
|---|---|
| What a session is logged against | An **optional** `universal_tasks` row, defaulting to the last one used |
| Edits | **Changed in revision 2:** the person edits their own log, and every edit is visible. No approval (see section 3) |
| `efficiency_score` | **Drop the column**, after an export |
| Day boundary | **Per-employee timezone** |
| What "efficiency" measures | **Hours it took, and who contributed how much**, per task. No money (no commission, rate or cost) and no estimates anywhere in this system |
| Projects | **Not linked.** Time attaches to tasks, and nothing new is connected to tasks |
| `estimated_hours` on tasks | **Remove platform-wide**, like the efficiency score. Nobody defines what a task is "worth" in hours |
| Is logging expected? | **Yes, but it gets forgotten.** Missed time has to be easy to add afterwards (section 3) |
| Department heads | **May see individual time** for their own department |

---

## 1. What is wrong with today's attendance

- **Times are wall-clock strings in UTC.** `checkin` stores
  `toLocaleTimeString('en-US', { hour12: false })`, which on a Worker is UTC. The
  dashboard parses it *as local time* (`UserDashboard.tsx:156`), so in PKT the
  running clock is five hours off.
- **The day is the UTC day.** Starting before 05:00 PKT is filed on yesterday.
- **Crossing midnight goes negative** (`dashboard.ts:213`).
- **One stint per day.** After checkout, starting again is refused.
- **No tasks, no pauses.** It can't answer any of the efficiency questions above.
- **It already uses the wrong vocabulary.** It stores `status` values `Late`,
  `Absent` and `Overtime`, and the profile tab counts them in red. Those go.
- **The accountant agent can read it** (`get_attendance`, "for payroll"). Its
  filter param is also wrong: `employeeId` vs `employee_id` (`tools.ts:582`).
  The tool is removed (section 6).
- **The HR dashboard always shows 0** (`HR.tsx:364` passes `[]`).

---

## 2. Model

All instants are **UTC epoch milliseconds** (`integer`). Local times are computed
at read time from the timezone snapshotted on the day.

### `work_days` — one row per person per local date they logged anything

| column | type | notes |
|---|---|---|
| `id` | text PK | `wkd_…` |
| `employee_id` | text FK → employees | |
| `work_date` | text | `YYYY-MM-DD` **in `timezone`**, fixed when the day's first session starts |
| `timezone` | text | IANA name, **snapshotted** from the employee |
| `logged_ms` | integer | cache: sum of closed work entries |
| `paused_ms` | integer | cache: sum of closed pause entries |
| `created_at`, `updated_at` | integer | |

`UNIQUE (employee_id, work_date)`. **No status column.** A day has time on it or
it doesn't exist; there's no "absent" row. A day only exists if the person
logged something.

### `time_entries` — the intervals (source of truth)

| column | type | notes |
|---|---|---|
| `id` | text PK | `tme_…` |
| `day_id` | text FK → work_days | |
| `employee_id` | text FK → employees | denormalised for the index below |
| `kind` | text | `work` · `pause` |
| `started_at` | integer | for a duration-only entry, noon local on its date (see below) |
| `ended_at` | integer | **null = running** |
| `time_unknown` | integer (bool) | a backfilled "2 h on Tuesday" with no clock times |
| `task_id` | text FK → universal_tasks, nullable | `work` only; null = untracked/general |
| `note` | text, nullable | "what I did", optional |
| `source` | text | `timer` · `manual` · `legacy` |
| `auto_closed` | integer (bool) | closed by the forgotten-timer sweep (section 3) |
| `edited_at` | integer, nullable | set when the person edits it |
| `original_started_at`, `original_ended_at`, `original_task_id` | nullable | what the timer recorded, kept on first edit |
| `created_at` | integer | |

```sql
CREATE UNIQUE INDEX time_entries_one_open
  ON time_entries(employee_id) WHERE ended_at IS NULL;
```

**At most one running interval per person.** Two tabs, a double-click, or phone
plus laptop can't produce two timers, because the database refuses the second
insert. That becomes a 409, and the client re-reads state. Also:
`CHECK (ended_at IS NULL OR ended_at > started_at)` and
`CHECK (kind = 'work' OR task_id IS NULL)`.

Pauses are kept, but **only so a session reads correctly** ("worked 10–1, paused,
worked 2–5"). They aren't "breaks", and nothing reports on how long anyone paused.

**Duration-only entries** exist because forgotten time is usually remembered as
"about two hours on the Acme task on Tuesday", not "10:05–12:10". Making people
invent clock times puts false precision into the data. Such an entry stores
`started_at` at noon local and `ended_at = started_at + duration`, with
`time_unknown = 1`, so it counts fully in every total and is **left out only of
the hour-of-day profile**. Because the noon placement could overlap a real
entry, overlap checks skip `time_unknown` entries.

### `employees.timezone`

`text NOT NULL DEFAULT 'Asia/Karachi'`. It's validated on write with
`new Intl.DateTimeFormat('en', { timeZone })`, which throws on an unknown zone in
workerd. It's editable on the HR employee form. It's snapshotted onto each day so
that moving countries never re-dates history.

---

## 3. Play / pause

```
            start(task?)              pause
   idle ─────────────────▶ working ─────────▶ paused
    ▲                       │   │               │
    │      done             │   └ switch(task?) │ resume(task?)
    └───────────────────────┘                   │
    ▲      done                                 ▼
    └──────────────────────────────────────── paused
```

| action | effect (one `db.batch`, server clock, conditional `WHERE ended_at IS NULL`) |
|---|---|
| `start` | find-or-create today's day in the person's tz; open a `work` entry |
| `pause` | close work, open `pause` |
| `resume` | close pause, open work (task defaults to the one before the pause) |
| `switch` | close work, open work on another task (or none) |
| `done` | close whatever is open |

- Any number of sessions a day. `start` after `done` just adds to the day.
- An interval belongs to the date it **started** on, so working past midnight is
  one session.
- A lost race (zero rows changed) returns **409 + current state**, never a 500.
- The client never sends timestamps for timer actions.

### Editing, and why there's no approval step any more

Revision 1 required manager approval for corrections. That made sense while
hours looked like they mattered for pay. They don't. An approval gate on someone's
own time log is a control over their hours, which is exactly what section 0 rules
out, and it adds work for managers on data that pays nobody.

Instead:

- A person can **add, edit or delete their own entries** for the last **14 days**.
  Older entries can be changed by their department head or `hr/attendance` edit,
  with a reason. They aren't approving anything: they're making the change for
  someone who noticed too late.
- The first edit copies the timer's values into `original_*` and sets `edited_at`.
  Every edit is also written to `audit_logs`. The day view shows edited entries
  with a marker and "originally 10:02–13:40".
- Reports show the **share of time that was entered or edited by hand**. That keeps
  the data honest without anyone having to sign off on it.

### Forgotten logging

Logging is expected, and it will be forgotten, so recovering missed time has to
be quicker than skipping it:

- **Add missed time** on the dashboard and on My time: date, task (prefilled
  from tasks the person touched that day), and either a duration or start/end.
  Three fields, one tap.
- **Suggestions, not alarms.** When a person opens the dashboard and a recent
  workday has task activity (a status change, comment or attachment by them) but
  no logged time, the widget shows "Nothing logged for Tuesday — you updated
  *Acme landing page*. Add time?" It's shown **only to that person**, it can be
  dismissed, and nobody else is told. Task activity is used purely to prefill;
  it's never counted as time.
- **Edit after the fact**: covered above. An entry added later is
  `source = 'manual'` and counts like any other.

### Forgotten timers

A new branch on the existing `*/5` cron (keyed on `event.cron`, per Gotchas). A
`work` entry open longer than **16 h** or a `pause` longer than **12 h** is closed at
`started_at + cap` with `auto_closed = 1`. The person sees "this session was closed
automatically — adjust it?" next time they open the dashboard. There's no
notification to the manager and no flag on the person. Reports exclude
auto-closed time **by default**, because it's almost certainly wrong.

---

## 4. Reports (the point of the exercise)

Computed at read time from `time_entries` joined to `universal_tasks`. Nothing is
stored, so no cache can disagree with the intervals.

**Organisation / department** (`hr/attendance` view, plus each department's own
`<dept>/tasks` view for its own department):

| report | from |
|---|---|
| **Per task: total hours, number of contributors, each contributor's hours and share**, running while the task is open | entries × task |
| **Tasks compared**: hours taken, by task type and department | the same, grouped |
| Logged time by department, task type, task, per week/month | entries × `universal_tasks.department/task_type` |
| **Cycle time**: created → first logged → `completed_at` | task timestamps + first entry |
| Time logged on tasks that ended up `blocked` or were never completed | entries × status |
| Untracked share: work time with no task | `task_id IS NULL` |
| When work happens: the 24 local-hour profile, aggregated | entries bucketed in each day's tz |
| Data quality: manual/edited share, auto-closed sessions | `source`, `edited_at`, `auto_closed` |

**Contribution view** (the task drawer, "Time" panel):

```
Acme landing page · completed · 46 h logged · 4 contributors
  Ayesha   21 h  46%   █████████
  Bilal    14 h  30%   ██████
  Sara      8 h  17%   ███
  Omar      3 h   7%   █
  + 6 h logged without times (duration-only)
  ! 5 h was edited or added later
```

It's sorted by hours because that's how you read a contribution breakdown,
but it carries no rank number, colour scale or "top contributor" badge. Hours
are not output: someone who logged 3 h may have unblocked the other 43. The
footer shows how complete the picture is (late additions, time without clock times), so
the numbers aren't read as more exact than they are.

Who sees the contributor breakdown: `hr/attendance`, the task's creator,
department heads with someone on the task, and every contributor (a team
seeing its own split is normal). Anyone who can see the task sees the total
hours only.

**Per person** (the person themself, their reporting manager, their
**department head**, `hr/attendance`):
the same week/day views and per-task totals for one person, as **input to a manual
review**. Two rules apply here:

1. No rank, percentile, leaderboard, score or "below average" comparison against
   colleagues, ever.
2. Per-person numbers appear only **within a piece of work** (a task's
   contribution panel) or in **that one person's own view**. There's no
   company-wide table of people by hours, so the efficiency score can't come back
   by another name.


---

## 5. API

Response shapes follow `src/utils/response.ts`; every mutation calls `logAudit`.

### Self-service: `dashboardRouter`, own data only, via `actorEmployeeId(c)`

```
GET    /api/dashboard/time/state                 { state, openEntry, today, serverNow }
POST   /api/dashboard/time/start                 { taskId? }
POST   /api/dashboard/time/pause
POST   /api/dashboard/time/resume                { taskId? }
POST   /api/dashboard/time/switch                { taskId | null }
POST   /api/dashboard/time/done
GET    /api/dashboard/time/days?from&to
GET    /api/dashboard/time/days/:date            entries + hour profile + per-task
POST   /api/dashboard/time/entries               manual add (≤14 days old)
PATCH  /api/dashboard/time/entries/:id           edit (≤14 days old, not running)
DELETE /api/dashboard/time/entries/:id
GET    /api/dashboard/time/tasks                 tasks this person may log against
GET    /api/dashboard/time/missed                recent days with task activity, nothing logged
```

Renamed from `/attendance` to `/time`. The vocabulary rule applies to the API
too, and the old routes go away with the old table.

`taskId` must be a task the person can see: assigned via `task_assignments` or
belonging to one of their appointments or committees. That's the set
`GET /api/dashboard` already builds; extract it into a shared helper rather than
copy it.

`serverNow` lets the client show `serverNow − startedAt` plus local drift, which
fixes the five-hour clock bug.

### Across people: `/api/time` (top level), new feature **`hr/attendance`**

Top level, not under `/api/hr`: a department head or manager reads their people
without holding any HR grant, and the HR router is gated on HR access.

```
GET    /api/time/people                              whom the caller may read
GET    /api/time/people/:employeeId/days?from&to      + canEdit (head or HR)
GET    /api/time/people/:employeeId/days/:date
POST   /api/time/people/:employeeId/entries           head or HR, reason required
PATCH  /api/time/entries/:id                          head or HR, reason required
DELETE /api/time/entries/:id?reason=                  head or HR
GET    /api/time/tasks/:taskId                        total; contributor split if entitled
GET    /api/time/report?from&to&group=department|task_type|task|week   hr/attendance
GET    /api/time/now                                  count running, hr/attendance
```

Without `hr/attendance`, two relationships also open a person's days, both
resolved server-side from the database and never from the request:

- **Reporting manager**: `employees.reporting_manager_id = me`.
- **Department head**: the person's `employees.sector_id` names a `sectors` row
  whose `head_employee_id = me`. `sectors` is the structured model for this;
  `employees.department` is free text and isn't used for access. Heads can also
  make the beyond-14-days edits for their department.

Both are one helper, `canReadTimeOf(c, employeeId)`, the time equivalent of
`canUseMailbox`, so the rule lives in one place. (Note
`/api/admin/users/my-team` is shadowed by `/users/:id`, per CLAUDE.md. Don't
build on it until that's fixed.)

### RBAC

- Add `'attendance'` to `APP_FEATURES.hr`.
- The migration copies `hr/employees` grants to `hr/attendance` in **both**
  `user_app_permissions` and `appointment_app_permissions` (the 0050 lesson).
- **The accountant's `get_attendance` tool is removed**, not repointed. An
  accounting agent reading hours is exactly the payroll link section 0 rules out.

---

## 6. UI

- **Dashboard widget** (replaces "Today's Attendance" and, see section 8, the
  efficiency tile). It has a large clock, ▶ / ⏸ / Done for now, a task picker
  ("General" default, last task preselected), and "Logged today: 3 h 20 m". There's
  no target, no progress ring and no "you've only logged…". It re-reads state on
  `visibilitychange` and focus.
- **My time**: week view with an hour profile per day, per-task table, inline
  edit for the last 14 days, and edited/auto-closed markers.
- **Task detail** (`universal_tasks` drawer): "Time logged: 6 h 10 m across 3
  people", opening the contribution panel. This is the most useful single place
  the data shows up.
- **Employee profile → Attendance tab**: rename it to **Time**, show the same
  views, and drop the Present/Late/Absent counters.
- **HR → Time**: the organisation reports in section 4 and a CSV export through
  `HRReports.tsx`. Rename the "Attendance Report" there and drop its status column.
  `HRDashboard` shows "logging time today: N" (a count, not names) instead of the
  always-zero "present".

---

## 7. Migrating existing `attendance` rows

`0053_time_tracking.sql` (0052 is the efficiency drop, which ships first):

1. Create `work_days`, `time_entries`, the partial unique index and
   `employees.timezone`. Nothing is added to `universal_tasks`.
2. Each `attendance` row with a `check_in` becomes a `work_days` row
   (`timezone = 'UTC'`, because the old dates and times *were* UTC).
3. Rows with a `check_out` later than `check_in` become one closed `work` entry,
   `source = 'legacy'`, no task. Rows without a usable check-out get a day and
   **no entry**. Inventing an end time puts a made-up number in history.
4. **`status` is not carried over.** "Late", "Absent" and "Overtime" are exactly
   the labels this design removes.
5. Grant `hr/attendance` (section 5).

The old table is dropped in a later migration, after a row-count and hours-sum
comparison on `pleiades-db`.

Same change:

- **`src/deletion/impact.ts`**: a person's days and entries are fate `delete`.
  Deleting a **task** `release`s `time_entries.task_id` to null, so the time
  survives as untracked. Both appear in the impact report.
- `schema-drift.test.ts`, `test/schema.sql` (regenerated from prod), and both
  snapshots, updated in the same commit.

### Tests that matter

- Two concurrent `start`s give one open entry and one 409.
- start → pause → resume → switch → done, with day caches equal to Σ entries.
- 22:00→02:00 Karachi is one session on the start date.
- Two people in different zones starting at the same instant get different
  `work_date`s. Changing `employees.timezone` re-dates nothing.
- A self-edit at 13 days succeeds and at 15 days is refused. A first edit
  preserves `original_*`. A second edit doesn't overwrite them.
- The sweep closes a 17 h timer at 16 h with `auto_closed`, and only on the `*/5`
  branch.
- **No response anywhere contains `late`, `absent`, `overtime` or a per-person
  rank.** This is asserted against `responses.txt`, so section 0 is enforced
  rather than remembered.
- No route under `/api/finance` or the accountant's tool list touches
  `time_entries`.
- Deleting a task leaves its time as untracked.
- A duration-only entry counts in day and task totals, and is absent
  from the hour profile.
- A department head reads a person in their sector, and is refused one outside
  it. Changing `employees.sector_id` moves that access on the next request.
- Contribution shares on a task sum to 100%, and are visible to a contributor
  but not to someone who can only see the task.
- No response contains a currency amount derived from time.
- The missed-time suggestion is returned only to the person themselves.

---

## 8. Removing the efficiency score and task estimates

A separate, small PR, shipped **first**. It doesn't depend on any of the above.

Export first (into the gitignored `cutover/`, never committed):

```bash
npx wrangler d1 execute pleiades-db --remote --json \
  --command="SELECT employee_id, name, efficiency_score FROM employees WHERE efficiency_score IS NOT NULL" \
  > cutover/efficiency_scores.json
```

| Where | Change |
|---|---|
| `migrations/0052_drop_efficiency_score.sql` | `ALTER TABLE employees DROP COLUMN efficiency_score;` |
| `packages/database/src/schema/core.ts:15` | remove `efficiencyScore` |
| `src/routes/core.ts:74-75, 105, 107` | remove from the create/update whitelists |
| `src/routes/dashboard.ts:51-58, 133` | remove the lookup and `stats.efficiencyScore` (keep the `employeeRecord` fetch, still used) |
| `apps/web/src/pages/UserDashboard.tsx:268-269` | remove the tile. The time widget takes the space later |
| `apps/web/src/pages/HR.tsx:559, 919-920` | remove from form state and the input |
| `test/schema.sql` | regenerate from production after the migration |
| `test/__snapshots__/responses.txt` | regenerate: `stats` and the employee shapes lose the key |

Left alone: `migrations/meta/*_snapshot.json`, `0000_plain_shard.sql` (history),
and `test/email.test.ts:348` ("efficiency measure" there means query count).

### Also in this PR: task hour estimates

Same reasoning: tasks aren't valued in hours, so the field that says what one
should take goes. Export first, as above
(`SELECT task_id, title, estimated_hours FROM universal_tasks WHERE estimated_hours IS NOT NULL`,
and the same for `acq_tasks.estimated_effort`).

| Where | Change |
|---|---|
| same migration (0052) | `ALTER TABLE universal_tasks DROP COLUMN estimated_hours;` `ALTER TABLE acq_tasks DROP COLUMN estimated_effort;` |
| `packages/database/src/schema/unified_tasks.ts:29` | remove `estimatedHours` |
| `packages/database/src/schema/acquisition.ts:84` | remove `estimatedEffort` |
| `apps/web/src/components/TaskBoard.tsx:261-264` | remove the "Nh" badge on task cards |
| `apps/web/src/components/TaskBoard.tsx:354, 462, 495` | remove from form state, the section label and the input |
| `apps/web/src/pages/Acquisition.tsx:399` | remove the "Estimated Effort (hrs)" field |
| `test/__snapshots__/responses.txt` | task shapes lose `estimatedHours` (and acquisition tasks `estimatedEffort`) |

**Not touched:** `schema/tech.ts:69-70` (`estimatedHours`/`actualHours` on Tech
`tasks`). That table doesn't exist in production. It's the one gap
`schema-drift.test.ts` already names, so editing a schema for a table that isn't
there would change nothing. It goes when that gap is resolved.

Check before the migration that `universal_tasks` and `acq_tasks` have no index
or view that names the dropped columns. `DROP COLUMN` refuses in that case, and
then the table needs a rebuild, which brings in the `defer_foreign_keys` rule in
CLAUDE.md.

---

## 9. Order of work

1. Efficiency score + task estimate removal (section 8), on its own.
2. Schema, timezone, legacy copy, `hr/attendance` grant, removal of the accountant tool.
3. Self-service API, dashboard widget, My time, add missed time and suggestions.
4. Contribution panel on tasks, then reports, the task-detail figure, HR → Time, CSV.
5. Forgotten-timer sweep, deletion impact, then drop the old table.

## 10. Open questions

- **Legal review** of section 0 and the UI wording before rollout.
