# 0006 — Time logging replaces attendance; no hours reach payroll

**Status:** Accepted (migration 0053). `attendance` was dropped in 0055 after its copy
was verified row-for-row and second-for-second.

**Context.** Pay is per task and nobody owes hours. Attendance recorded check-ins with
Late/Absent/Overtime statuses that presumed a schedule the company does not have, and
mixed UTC and local time.

**Decision.** Play/pause intervals in `time_entries` (UTC milliseconds), grouped into
`work_days` by the employee's own zone. No schedules, scores or rankings; hours never
reach payroll. See `docs/attendance-design.md`.

**Consequences.** `test/time.test.ts` fails if an attendance tool or a ranking route
returns.
