-- Rate limiting, and three tables nothing uses.
--
-- A full export of pleiades-db was taken immediately before this migration
-- (backups/, gitignored) along with a Time Travel bookmark; see SECURITY.md.

-- ── Rate limits ──────────────────────────────────────────────────────────────
-- One row per bucket ("login:ip:203.0.113.7"), a fixed window per row. Written by
-- one atomic upsert per guarded request (src/utils/rate-limit.ts); rows whose
-- window ended over a day ago are swept by the five-minute cron.
CREATE TABLE rate_limits (
  bucket    TEXT PRIMARY KEY NOT NULL,
  count     INTEGER NOT NULL,
  reset_at  INTEGER NOT NULL
);
CREATE INDEX rate_limits_reset ON rate_limits (reset_at);

-- ── attendance ───────────────────────────────────────────────────────────────
-- Replaced by work_days + time_entries in 0053, which kept it "for one release so
-- the copy can be checked". Checked on 17 Oct 2026 against the synced database:
-- the 15 legacy time entries and their 223,386 seconds match exactly what 0053's
-- own rules derive from attendance; the 6 rows not carried are check-ins that were
-- never checked out, which 0053 deliberately does not invent an end for. The only
-- code still touching it was the employee-deletion cascade.
DROP TABLE attendance;

-- ── compliance_events, notifications_log ─────────────────────────────────────
-- Created by 0026 for an accountant design that went another way. Zero rows in
-- production, no code reads or writes either, and no foreign key points at them.
DROP TABLE compliance_events;
DROP TABLE notifications_log;
