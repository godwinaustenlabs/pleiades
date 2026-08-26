# Pleiades Accountant — build tracker

Live record of what is actually shipped. A box is ticked only when the work is
deployed and verified in production, not when it is written.

Design rationale lives in `pleiades-accountant-agent-spec.md`; this file tracks
progress against it.

---

## Two defects this build exists to fix

Found while planning. Everything downstream depended on them, so they come first.

**The agent had no conversation memory.** `handleTurn` passed a single `prompt`
to `generateText` and no `messages` array. Turns were written to
`conversation_turns` and never read back — nothing in the repo SELECTed that
table. The Durable Object gave serialisation, not memory.

**Because of that, approvals could never complete.** A gated tool returns an
approval id; executing it required the model to call the same tool again with a
byte-identical payload plus the token, checked by SHA-256. With no history the
model could not know the id or reproduce the payload — any re-derived amount or
re-ordered `lines` array changed the hash and was refused. The UI told the human
to paste `apr_…` into the chat. That was a design error, not a tuning problem.

---

## Stage 1 — Memory and auto-executing approvals

- [x] Read the last ~8 `conversation_turns` and pass them as `messages`
- [x] Skip `tool` rows and `[error]` entries when rebuilding history
- [x] Executor registry so a stored payload can run without the model
- [x] `POST /approvals/:id` executes on approval
- [x] Execution runs as `requested_by`, never the approver — approval is
      authorisation, not impersonation, and the audit trail must attribute the
      write to the person the agent was acting for
- [x] `execution_status` / `execution_result` columns, so an approved action that
      failed is visible rather than silently `consumed`
- [x] `consumed` transition moved to after a successful execute
- [x] Tests: memory reaches the model; auto-execute including the failure path

Two things surfaced while testing and were fixed here rather than deferred:

**The Worker is now bound to itself** (`services: [{ binding: SELF }]`). Agent
tools call back into this Worker's own API so a tool request passes the same
middleware chain a browser request does; that call used to go out to the origin
and back. A service binding dispatches in-process — no DNS, no second TLS
handshake, and it works under `wrangler dev` and in tests, where a loopback
fetch to the Worker's own origin simply hangs.

**`test/schema.sql` held 23 of the 85 production tables.** Its header claimed to
be the production DDL; it was a subset, so nothing touching finance, CRM or
assets could be tested at all — the first approval test failed on
`no such table: ledgers`. Regenerated in full from `sqlite_master`, with the
command in the header so the next regeneration is a copy-paste.

*Deployed: version `2199ba11`.*

## Stage 2 — A readable agent panel

The panel used `bg-surfaceAlt` and `border-border`, **neither of which exists**
in `apps/web/src/index.css` (`@theme` defines only `background, surface,
primary, accent, textPrimary, textSecondary, white, black`). Assistant bubbles
had no background. `MarkdownView` sets `text-black/85`, but this project
*inverts* black and white via `--dynamic-black`, so assistant replies rendered
at near-zero contrast. Unreadable was literal.

- [x] Replace undefined tokens with ones that exist
- [x] Fix `MarkdownView` contrast in the panel context
- [x] Lift prose from `text-[10px]`/`text-[11px]` to a readable size
- [x] Author labels, timestamps and separation between turns
- [x] Pending approvals inline in the chat with Approve / Reject
- [x] `textarea` composer so Shift+Enter makes a newline

`--color-surfaceAlt` and `--color-border` are now defined in `index.css` rather
than the classes being rewritten away: `PermissionMatrix` and `Admin` were
styling with the same two undefined tokens, so one definition fixes all three.

`MarkdownView` no longer names a colour at all — it inherits from its container.
It only ever had contrast inside the asset previewer, which sets `bg-white
text-black`, and this project inverts that pair via `--dynamic-black`.

*Deployed: version `a62a6cac`.*

## Stage 3 — Asset register with depreciation

`assets` had **no monetary column at all** — no cost, salvage, life or vendor —
so it could not feed a wealth statement. There was no `DELETE` route anywhere,
and nothing in the UI ever called the existing `POST /api/hr/assets`.

- [ ] Extend `assets`: cost, purchase date, salvage, useful life, class, serial,
      vendor, accumulated depreciation, disposal, linked accounts
- [ ] CRUD at `/api/finance/assets` (kept away from `src/routes/assets.ts`,
      which is R2 blob storage and would clobber its wildcards)
- [ ] Straight-line monthly depreciation as a pure, shared function
- [ ] Gated `post_depreciation` tool posting a balanced compound journal
- [ ] `assets` feature in `APP_FEATURES.finance` plus a grant migration
- [ ] Assets tab in Accounting
- [ ] Tests: depreciation arithmetic, fully-depreciated and disposed assets

## Stage 4 — The statement generator

The agent could file a document path but nothing rendered one.
`save_finance_document` documented a `finance-docs/` url with no companion tool
that produced a file.

- [ ] `pdf-lib` (nothing generates PDFs today; `react-pdf` is a viewer and the
      existing "Generate PDF" buttons open a browser print dialog)
- [ ] Layout kit: title block, money alignment, totals, page breaks, DRAFT
      header and provenance footer
- [ ] Ledger data module reusing `getJournalLines()` and the **period-delta**
      pattern from `GET /accounts` — `/trial-balance` is cumulative-to-date and
      cannot express a period
- [ ] Normalise `accountType` case; the UI writes lowercase, the agent tool
      describes capitalised, and the column is nullable
- [ ] Profit & loss / income statement for a date range
- [ ] Statement of assets and liabilities, reconciling the register to the ledger
- [ ] Write straight to R2 under `finance-docs/`, already allowlisted for upload
      and readable under `finance/docs`
- [ ] Version rather than overwrite, via the existing unique index
- [ ] `generate_statement` tool, **not** approval-gated — a statement reads the
      ledger and writes a draft; it changes no books
- [ ] Statements tab with downloads
- [ ] Tests: figures against a hand-built ledger fixture

## Stage 5 — Reading the books properly

- [ ] Date range on `get_journals` (the route supports it; the tool ignored it)
- [ ] Ledger-with-accounts and T-account tools
- [ ] `since` / `until` on `recall_actions`
- [ ] Return `entities`, so the agent can recall which records it touched
- [ ] Fix the unbounded full-table scan in semantic recall

## Stage 6 — `daily_runner`

- [ ] Cron triggers and a `scheduled` handler (the Worker exports a bare Hono
      app today, so both are needed)
- [ ] Twice-daily prompt: read the manual, recall what was done, check what was
      produced, say what is due
- [ ] Runs as a configured operator, so its tools stay bounded by real grants
- [ ] Output to `app_messages` for the finance app and to the agent journal
- [ ] It proposes; anything consequential still raises an approval

---

## Standing rules

Carried from `CLAUDE.md` and `SECURITY.md`, and the reason several of the
choices above look the way they do.

- Compliance figures come from `compliance_config`, never from the model
- No `query_d1`; every tool is a named path through the Worker's own API, so the
  agent can never exceed the person it acts for
- Consequential writes are gated in code, not by asking the model nicely
- Migrations that rebuild a table with foreign keys need the
  `defer_foreign_keys` recipe, rehearsed offline with `PRAGMA foreign_keys = ON`
- Every stage ends green on `npm test`, both typechecks, build and lint, and is
  deployed before the next begins
