# 0008 — Rate limits are fixed windows in D1

**Status:** Accepted (migration 0055)

**Context.** Login had per-account lockout but no per-IP limit, so one password could be
sprayed across every account. Password reset sends mail against a 90/day budget.
Dictation spends a Workers AI allowance both agents share.

**Options.** An in-memory counter (useless: isolates are many and short-lived);
Cloudflare's Rate Limiting binding (per-colo and approximate by design); a D1 table.

**Decision.** `rate_limits(bucket, count, reset_at)`, one atomic upsert per guarded
request (`src/utils/rate-limit.ts`), limits declared together in `LIMITS`, expired rows
swept by the cron. Guarded: staff and portal login, reset request and completion (per
IP), transcription (per user).

**Consequences.** One D1 write per guarded request, on endpoints that are rare by
nature. Limits are exact and global. Tests clear the table between cases that are not
about limiting.
