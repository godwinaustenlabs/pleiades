# 0007 — A repeating task creates ordinary tasks, a lead ahead

**Status:** Accepted (migration 0054)

**Context.** Repeating tasks must appear on every board, in every workspace and on the
calendar, across every app that assigns tasks.

**Options.** (a) Expand a rule virtually at read time — every list endpoint, board,
calendar and the ICS feed would need to know about rules. (b) Materialize each
occurrence as a real task.

**Decision.** (b). A series (`task_recurrences`) creates each occurrence as an ordinary
`universal_tasks` row, at most a week before it is due, from the five-minute cron and
the request that creates or edits the series. Occurrence ids are derived from
(series, instant) and unique in the database, so creation is idempotent. After an
outage only the latest missed occurrence is created. The calendar projects later
occurrences read-only. Month days clamp per month; wall-clock times follow the
series' zone.

**Consequences.** Nothing downstream changed. Editing or stopping a series affects only
untouched future occurrences. Hourly series fill boards by design.
