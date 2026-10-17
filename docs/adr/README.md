# Architecture decision records

One file per decision that was genuinely arguable: what was decided, why, and what
it costs. They are short on purpose — the long-form reasoning for most of these
lives in CLAUDE.md beside the code it governs; an ADR is the record that a choice
was made deliberately, so it is not quietly undone.

Add one when a change picks between two reasonable designs, or reverses an earlier
record (mark the old one **Superseded by NNNN**; never delete it).

| # | Decision | Status |
|---|---|---|
| [0001](0001-single-worker.md) | One Cloudflare Worker serves the API and the SPA | Accepted |
| [0002](0002-appointment-authorization.md) | Access is the union of a person's grants and their posts' grants | Accepted |
| [0003](0003-hand-written-migrations.md) | Migrations are hand-written SQL; drizzle-kit is not used | Accepted |
| [0004](0004-agents-call-the-api.md) | Agents act only through the Worker's own API, never SQL | Accepted |
| [0005](0005-resend-only-transport.md) | Resend is the only outbound mail transport | Accepted |
| [0006](0006-time-logging.md) | Time logging replaces attendance; no hours reach payroll | Accepted |
| [0007](0007-repeating-tasks.md) | A repeating task creates ordinary tasks, a lead ahead | Accepted |
| [0008](0008-rate-limiting-in-d1.md) | Rate limits are fixed windows in D1 | Accepted |
| [0009](0009-errors-and-browser-boundaries.md) | Errors never describe internals; tokens only in headers; strict CSP | Accepted |
| [0010](0010-dictation-whisper.md) | Note dictation uses Whisper turbo without a prompt | Accepted |
