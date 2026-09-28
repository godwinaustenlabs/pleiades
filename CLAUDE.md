# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pleiades is an internal company operating system deployed as a **single Cloudflare Worker**. One Hono API (`src/`) serves `/api/*` and also serves the built React SPA (`apps/web/dist`) as static assets with SPA fallback. Persistence is Cloudflare D1 (SQLite) via Drizzle ORM, plus R2, Vectorize, and Workers AI bindings.

The script, the database and every bucket are named `pleiades*`. It was
previously called GAnovaOS ("officeOS") and ran against `office-db` and the
`office-*` buckets; that rename and the storage cutover are both complete, so
an `office-*` name appearing anywhere now is a leftover, not a live resource.
`test/config.test.ts` enforces this — every D1 and R2 resource name must start
with the script name.

## Commands

```bash
npm run dev        # root: `wrangler dev` + `turbo run dev` (Vite) concurrently
npm run build      # turbo build across workspaces
npm run lint       # turbo lint (ESLint, web workspace only)
npm run format     # prettier over **/*.{ts,tsx,md} — see the tabs caveat below

cd apps/web && npm run dev     # Vite only (port 5173, proxies /api -> 127.0.0.1:8788)
cd apps/web && npm run build   # tsc -b && vite build -> apps/web/dist
```

```bash
npm test          # vitest — see test/ (22 files, 511 tests)
npm run test:watch
```

The suite is in four layers, and the two snapshot files are the load-bearing part:

- `test/__snapshots__/routes.txt` — every registered route (`test/manifest.test.ts`).
  A router that stops being mounted still compiles, still deploys, and just 404s;
  nothing else notices.
- `test/__snapshots__/responses.txt` — every GET route fetched as a superadmin and
  reduced to status + response *shape*, never values (`test/smoke.test.ts`). It is
  deterministic across runs by construction, so a byte-identical diff before and
  after a refactor is proof that refactor changed no response anywhere in the API,
  including the routes nobody wrote a test for. **Regenerate it deliberately, in the
  same commit as the behaviour change, never to make a red build green.**
- `test/modules.test.ts` — one create→read→update→delete per module. This is what the
  response manifest cannot do: it proves the Drizzle column mapping matches the
  production DDL, since a wrong column in an INSERT is invisible to a read-only sweep.
- `test/config.test.ts`, `test/bindings.test.ts`, `test/schema-drift.test.ts` — contracts
  on `wrangler.jsonc` and `Env`. Miniflare gives tests an ephemeral local D1, so a wrong
  `database_name` or `bucket_name` cannot fail an ordinary test; it fails in production,
  once. `config.test.ts` asserts `services[0].service === name`, that `WORKER_ORIGIN`
  matches the script's own hostname, and that every D1/R2 resource name starts with the
  script name — so the config verifies its own naming.

Two facts the suite records rather than hides, both pre-existing:

- `GET /api/tech/tasks` (and `/:id`) return `D1_ERROR: no such table: tasks`. Migration
  0000 creates the table and `pleiades-db` records that migration as applied, but the
  table is not there — it was dropped by hand, and the cutover copied that state across
  faithfully. `schema-drift.test.ts` names `tasks` as the one known gap so it cannot
  silently become two.
- `GET /api/admin/users/my-team` returns 404 for everyone. `/users/:id` is registered at
  `admin.ts:137` and `my-team` at `admin.ts:259`, so the parameterised route shadows it
  and the handler is unreachable. Registering the static path first fixes it.

`npm run lint` passes (0 errors). It still reports ~290 **warnings**, which are tracked
debt, not noise — see the commented rules in `apps/web/eslint.config.js` for why each is
a warning and what clearing it requires. The short version: `no-explicit-any` needs the
UI to take real domain types (available type-only from `packages/database` via Drizzle's
`$inferSelect`), and the `react-hooks/*` warnings flag the app-wide "fetch in an effect"
pattern rather than actual defects. Don't silence them; burn them down.

Gates: `npm test`, `npx tsc --noEmit -p tsconfig.json`, `cd apps/web && npx tsc -b`,
`npm run build`, `npm run lint`.

### Database / migrations

Run D1 commands **from the repo root** — the D1 binding lives only in the root `wrangler.jsonc`, and `migrations_dir` points at `packages/database/migrations`:

```bash
npx wrangler d1 migrations apply pleiades-db --local     # or --remote
npx wrangler d1 execute pleiades-db --local --command="..."
```

Note: `packages/database`'s own `migrate` script refuses to run and points at the
root-level command above. It has named a stale database twice now — first
`ganova-db`, which never existed, then `office-db` after the cutover — which is
the argument for it not naming one at all.

#### Copying the database

This is how `office-db` became `pleiades-db` on 28 Aug 2026. That cutover is
done — `scripts/cutover-storage.sh` is the reviewed, re-runnable form of it, and
`scripts/verify-live.sh` checks the result. Keep the section: D1 has no rename,
so the next time a database moves it moves this way, and every trap below is one
this migration actually hit.

Moving a database means export, create, import — and a plain
`wrangler d1 export | wrangler d1 execute` **does not work**. Two things break it:

1. A combined schema+data dump fails with `no such table: main.<table>`. Export
   `--no-data` and `--no-schema` separately and import the schema first.
2. The data half then fails with `FOREIGN KEY constraint failed`, because
   `wrangler d1 export` emits INSERTs in `sqlite_master` order rather than
   dependency order. The dump's own `PRAGMA defer_foreign_keys=TRUE` does not
   save it: that pragma is per-transaction, and D1 runs an imported file
   server-side in batches, so it never reaches the statements that need it.

This reads exactly like data corruption and is not — it is statement order.
`scripts/d1-order-dump.py` topologically sorts the INSERTs by foreign key and
is the supported path:

```bash
npx wrangler d1 export  "$SRC" --remote --no-data   --output=cutover/schema.sql
npx wrangler d1 export  "$SRC" --remote --no-schema --output=cutover/data.sql
python3 scripts/d1-order-dump.py cutover/schema.sql cutover/data.sql cutover/ordered.sql
npx wrangler d1 execute "$DST" --remote --file=cutover/schema.sql  --yes
npx wrangler d1 execute "$DST" --remote --file=cutover/ordered.sql --yes
```

`cutover/` is gitignored — those dumps are full production data, including
password hashes. Do not commit them; see SECURITY.md.

It also drops `sqlite_sequence`, which SQLite maintains itself; replaying the
dump's copy leaves two rows for the same table and makes the next AUTOINCREMENT
id unpredictable — here that would be `d1_migrations`, so the damage lands on
migration bookkeeping.

Verify a copy by row counts per table, a sorted diff of the two `--no-data`
exports, and a sha256 of the sorted INSERT lines from each `--no-schema` export
(excluding `sqlite_sequence`); the last is order-independent and proves every
row survived. Note D1 caps compound `SELECT`s at **fewer than 8** `UNION ALL`
terms, so a per-table count query has to be chunked.

Do **not** rebuild a database by replaying `packages/database/migrations/`. The
files no longer describe production: `0000_plain_shard.sql` creates a `tasks`
table that `pleiades-db` records as applied and does not have. A second hazard,
`fix_universal_tasks_fk.sql`, has since been deleted — being unnumbered,
wrangler's `parseInt` sort yielded `NaN` and ran it last, after `0036`, where it
rebuilt `universal_tasks` around an `assignee_id` column production does not
have (assignment lives in `task_assignments`).

The newest is `0037_currencies.sql`, which lifts the account currency list out
of the Finance page (where it was five options hardcoded in two separate forms,
and did not include PKR) into a `currencies` table. It is gated on
`finance/accounts` rather than a feature of its own — a currency exists only as
an attribute of an account — so it needed no `APP_FEATURES` entry and no grant
migration.

Migrations are **hand-written**; `drizzle-kit generate` is not part of the current
workflow. Its snapshot baseline stopped at `0019` and still describes the
pre-roles-only schema (`role_permissions`, `role_hierarchy`, `user_app_*`), so a
`generate` today prompts to rename tables that were already replaced and would
emit a file numbered `0020`, colliding with the hand-written `0020_role_based_access.sql`.
Reconciling that baseline is a deliberate decision, not a routine step. What
authoritatively records migration state is `pleiades-db`'s own `d1_migrations`
table, not `meta/_journal.json`.

## Architecture

### Request flow

`src/index.ts` is the only Worker entrypoint. It mounts one Hono sub-router per domain under `/api/<module>`: `auth`, `core`, `hr`, `tasks`, `finance`, `legal`, `tech`, `acquisition`, `ops`, `admin`, `crm`, `portal`, `dashboard`, `permissions`, `assets`, `notifications`, `public/calendar`, `messages`, plus `agents/slack` and a bare `health`.

Four routers are **not** mounted at the top level — `src/routes/agent.ts`,
`assets-register.ts`, `statements.ts` and `reports.ts` are sub-routed inside
`finance.ts`, so they serve `/api/finance/agent`, `/api/finance/assets`,
`/api/finance/statements` and `/api/finance/reports`. Their features are gated
under `finance` (`agent`, `agent_config`, `assets`, and — for reports —
`journals` / `ledgers`), which is why looking for an `agent` app in
`APP_FEATURES` finds nothing. `test/__snapshots__/routes.txt` is the
authoritative list of what is actually reachable.

Each router applies its own middleware at the top of its file:

```ts
hrRouter.use('*', authMiddleware);
hrRouter.use('*', requireAppAccess('hr'));
```

Anything not matching `/api/*` falls through to the `ASSETS` binding and is
served as the SPA. That fallback lives in `app.notFound()` in `src/index.ts`: an
unmatched `/api` path returns JSON 404, anything else returns `index.html` so the
client router can resolve it. Without it every deep link and refresh away from
`/` returns 404 — which is exactly what happened until 25 Aug 2026.

### Auth (`src/middleware/auth.ts`)

`authMiddleware` resolves an identity from three sources, in order, and sets `c.get('user')` as a `UserPayload`:

1. `x-api-key` header → agent identity from the `api_keys` table (`type: 'agent'`, never superadmin).
2. `x-agent-actor` + `x-agent-secret` headers → the `users_logins` row named by the actor id, but only when the secret matches the `AGENT_INTERNAL_SECRET` Worker binding. Present-but-invalid always denies and never falls through to another source. This replaced `x-slack-id`, which named a Slack user and was trusted outright — see SECURITY.md #1. Slack identity is resolved server-side only *after* the request signature is verified (`src/agents/slack/lib/slack.ts`), and the resolved user id is what gets passed here.
3. `Authorization: Bearer <jwt>` → falls back to the `auth_token` cookie, then a `?token=` query param (the query-param path exists so `<img>`/download URLs can authenticate).

**Session lifetime is a week of inactivity, not a week from login.** A token
lasts `SESSION_TTL_SECONDS` (8 days) and any request carrying one with under
`SESSION_REFRESH_BELOW_SECONDS` (7 days) left is answered with a freshly signed
one in the `X-Refresh-Token` header. The one-day gap between the two numbers is
what makes the guarantee exact and the cost negligible: anyone active in the
last 24 hours holds a token with at least 7 days on it, and a session is
re-signed at most once a day rather than once per request. `/api/portal` slides
on the same constants, in its own `clientAuth`.

The browser half is `apps/web/src/lib/session.ts`, which wraps `window.fetch`
once at startup — the app makes several hundred bare `fetch` calls across every
page, so asking each call site to look for the header was never going to hold.
It also clears the token on a 401 and fires `pleiades:session-expired`, which
`App.tsx` turns into a redirect to the right sign-in screen.

A longer session does **not** delay a revocation: the token still carries no
permission claim, and grants are read from the database on every request. The
only thing it lengthens is how long a stolen token is useful, which is the
trade that was made deliberately — see `test/session.test.ts`, which pins all
three halves of the behaviour.

`/api/portal` is a **separate auth world**: it has its own `clientAuth` using JWTs with `type: 'client'` and does not use `authMiddleware`.

### Authorization (`src/middleware/rbac.ts`)

**Per user.** There is exactly one resolution path and no fallback chain:

```
users_logins.id → user_app_permissions → (appName, feature, canView/canEdit/canDelete)
```

Roles were tried (migration 0020) and removed again (0025). A role could only
ever be widened for everyone holding it, which is the opposite of what granting
one person access requires. Do not reintroduce `roles`, `role_app_permissions`
or `users_logins.role_id`.

- `requireAppAccess(module)` — gate a whole router (needs view on any feature of it).
- `requireFeatureAccess(app, feature, 'view'|'edit'|'delete')` / `checkFeaturePermission(...)` — per-feature. `delete` implies `edit` implies `view`.
- `listGrants(c, userId?)` — effective grants, with the implication chain flattened. Backs `/api/permissions/me` and `/api/permissions/user/:id`.
- Superadmin (`users_logins.is_superadmin`) bypasses everything. It is settable **only** by direct DB access, never through the API.

Two things worth knowing:

- The JWT carries only an id — no permission claim of any kind. Grants are read from the database on every request, so narrowing someone's access takes effect immediately rather than at token expiry (tokens live 8 hours). Grants are cached per request in a `WeakMap` keyed on the Hono context, so this costs one query per request, not per check.
- **Committee membership implies the `crm` grants in `COMMITTEE_IMPLIED_GRANTS`.** A real rule, defined once in `rbac.ts`, not an incidental fallback.
- An agent's `api_keys` row names the user it acts as and inherits that person's grants. Agents have no permissions of their own.

`APP_FEATURES` in `rbac.ts` is the **single source of truth** for which features exist per app, consumed by both the backend and the permissions UI. Adding a feature means editing that map.

A route gated on a feature that is *not* declared there is unreachable for
everyone except a superadmin, because `getPerm()` can never return true for it.
This has bitten twice — finance's `ledgers`/`journals`/`trial_balance` and
acquisition's `funnels` — so when you gate a new route, declare its feature in
the same change and add a migration granting it (see `0023` and `0024` for the
`INSERT ... SELECT` pattern that copies an existing grant, so no role's access
changes).

Every module router is gated per feature except `dashboard`, which is app-gated
on purpose: all of its handlers already filter on the calling user's own id.

Manage access with `PUT /api/admin/users/:id/permissions` (gated on
admin/permissions edit), or through the Access page at `/admin`
(`apps/web/src/pages/Admin.tsx` + `components/PermissionMatrix.tsx`). Editing
one person's grants affects that person only.

Removed — do not reintroduce: `roles` / `role_app_permissions` (the roles
experiment, dropped in 0025), `user_app_access` (deprecated, empty), and
`role_permissions` / `role_hierarchy` (declared in the schema but never
deployed, so every query against them failed in production).

**Migrations that rebuild a table referenced by a foreign key** must
`PRAGMA defer_foreign_keys = true` at the start and `= false` before the end.
D1 enforces foreign keys, and dropping a parent increments the deferred
constraint counter once per orphaned child row without the rename decrementing
it — so COMMIT fails while `PRAGMA foreign_key_check` reports nothing wrong.
See `0025_per_user_permissions.sql`. Verify such a migration against a scratch
SQLite database with `PRAGMA foreign_keys = ON` **inside a transaction**;
sqlite3's default is off, which gives a false pass.

### Route conventions

Every handler follows the same shape — deviating from it will look out of place:

```ts
router.post('/things', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();
    const id = generateId('thg');              // src/utils/id.ts — prefix_<32 hex>
    await db.insert(schema.things).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'things', id, body);   // src/utils/audit.ts
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
```

- Responses always go through `src/utils/response.ts` (`ok`/`created`/`notFound`/`badRequest`/`forbidden`/`serverError`), which produce `{ success, data }` or `{ success, error }`. The frontend unwraps `.data`.
- `logAudit` writes to `audit_logs` and deliberately swallows its own errors; call it after every mutation.
- On PATCH, strip `id`, `createdAt`, `updatedAt` from the body before `set(...)`.
- D1 has a bound-parameter limit — use `chunk` from `src/utils/batch.ts` for bulk writes.

### Database (`packages/database`)

`user_app_permissions` is the authorization table (see Authorization above).

Drizzle schema split by domain under `src/schema/` (`auth`, `core`, `hr`, `finance`, `legal`, `tech`, `acquisition`, `crm`, `unified_tasks`, `notifications`, `pleiades`, `relations`), all re-exported from `schema/index.ts`. Consumers import `{ getDb, schema }` from `@pleiades/database` (path-mapped in the root `tsconfig.json`). `schema/pleiades.ts` holds the agent's own tables — approvals, conversations, journal, compliance config, knowledge and generated documents.

Column names are snake_case in SQL, camelCase in TS, and primary keys are often *not* named `id` in SQL (e.g. `universalTasks.id` maps to the `task_id` column) — always check the schema file rather than assuming.

`company_documents` is a **shared** document store scoped by a `department` column
(`hr`, `finance`, …) rather than one table per module. Each module's routes filter and
stamp that column server-side — the department is never taken from the request body, and
deletes are scoped to it so one module cannot remove another's files by id. The UI is one
component, `apps/web/src/components/DocumentsTab.tsx`, parameterised by endpoint. Adding
a docs tab to another module means: a `docs` entry in that app's `APP_FEATURES`, three
routes filtered to the department, a migration granting `<app>/docs`, and mounting
`<DocumentsTab endpoint="/<app>/documents" … />`. Files themselves live in R2 behind `/api/assets`.

R2 keys are governed by two lists in `src/routes/assets.ts` that must be kept in
step: `ALLOWED_UPLOAD_PREFIXES` (where a caller may write) and `READ_RULES`
(which grant each prefix requires to read). Adding an upload location means
adding to both — a prefix with no read rule is refused, so the files upload
successfully and then cannot be opened.

`READ_RULES` is resolved by the **first matching prefix**, not the longest, so a
rule that narrows another must be listed above it. `finance-docs/reports/journal/`
and `finance-docs/reports/ledger/` sit ahead of `finance-docs/` for exactly this
reason.

Upload prefixes must be passed explicitly (`pathPrefix` on a `file` field in
`EntityForm`). They were once derived from the *form's title*, so
"Upload Institutional Asset" wrote to `upload_institutional_asset/`; the bucket
still holds several such prefixes, listed as legacy entries in `READ_RULES`.
Do not add new ones.

`universal_tasks` is the cross-department task table (`department` field: HR | Finance | Legal | Ops | Acquisition | Tech) with `task_assignments` as the many-to-many join to employees. Task permissions are checked per-department via the `tasks` feature (`checkFeaturePermission(c, dept, 'tasks', ...)`), not by a router-level gate.

### Generated documents (`src/statements`)

Everything the app renders to PDF. `layout.ts` is a small typographic kit over
**pdf-lib** — chosen because it is pure JavaScript, runs in the Worker with no
binding and no network call, and embeds the standard fonts. It provides section
headings, totals, notes and a table whose header repeats on every page it spans.

Two things in it are load-bearing and easy to undo by accident:

- **Every string drawn goes through `sanitise()`.** The standard fonts are
  WinAnsi-encoded and pdf-lib *throws* on a codepoint outside that set. A
  statement only ever drew account names, but a report draws free-text
  narrations typed by people, where a curly quote or an emoji is ordinary — and
  the exception would fail the report only for the date ranges containing the
  offending entry. Common punctuation is transliterated; anything else becomes
  `?`. Do not add a `drawText` call that bypasses it.
- **Wrapping is by word index, never by character offset** into the source
  string. Offsets do not survive whitespace collapsing, and the bug it produces
  is a duplicated tail (`Invoice: inv_77a2b1 77a2b1`) rather than an error.

On top of the kit sit two families, sharing `file.ts` for versioning, the R2
write and the `generated_documents` row:

- `render.ts` + `data.ts` — **statements** (profit and loss, assets and
  liabilities). These *summarise*: a handful of figures for a period.
- `reports-render.ts` + `reports.ts` — **reports** (the general journal, and the
  ledger accounts). These *transcribe*: every entry, both sides, the narration.

That difference drives the design of the reports. "The whole journal" is an
ordinary request rather than an edge case, so both date bounds are optional and
omitting them means the complete history. Totals are always struck over every
matching row while only the *listing* is bounded by `MAX_DETAIL_ROWS`, and the
document says how many rows it did not print — abbreviated, never silently
wrong and never a 500.

Note the two ledger filters mean different things, and the agent's tool
descriptions say so: the journal report's `ledgerId` filters on the book each
**entry** is stamped with, whereas the ledger report's `ledger` scope selects
the **accounts** belonging to that book.

Neither report adds a feature to `APP_FEATURES`, so neither needed a migration:
they reuse `finance/journals` and `finance/ledgers`, gated per route in
`routes/reports.ts` and matched by the R2 read rules above so that generating a
report and downloading it require the same grant.

`scripts/preview-report.ts` renders both from fixture data straight to files
with no Worker and no database — the layout is the half of this that no
assertion really checks.

### Agents (`src/agents`)

One directory per agent, no loose files. Both are Agents-SDK Durable Objects
exported from `src/index.ts` and bound in `wrangler.jsonc`.

- `slack/` — the Slack assistant, one instance per Slack conversation.
- `accountant/` — the accountant. One instance per conversation;
  `compliance.ts` turns operator configuration into payroll components,
  `tools.ts` is the HR + accounting surface, `approvals.ts` is the
  human-in-the-loop gate, `access.ts` decides who may drive it.

  It is called `accountant/`, not `pleiades/`, because Pleiades is the platform.
  A directory — or a Durable Object class — named after the whole system, when
  the system runs two agents, says nothing about which one it is.

Both run their turn loop on the Vercel AI SDK (`generateText`, tools defined
with `tool()` and zod schemas) over **Workers AI** via the `AI` binding —
`LLM_MODEL` in `wrangler.jsonc`, currently `@cf/openai/gpt-oss-120b`. Using the
binding rather than a third-party provider means no external quota can stop a
payroll run mid-way.

Each agent's calls are routed through **its own AI Gateway**
(`AI_GATEWAY_ACCOUNTANT`, `AI_GATEWAY_SLACK`), built in `src/utils/model.ts`. One
gateway per agent, because a single request log mixing payroll runs with
"what's on my calendar" is a log nobody reads. Both gateways have Authenticated
Gateway enabled, so `CF_AIG_TOKEN` goes out as `cf-aig-authorization` via
`extraHeaders` — `GatewayOptions` has no field for it, since on the REST path
the caller sets the header itself. With the token unset the agents log a warning
and call the binding directly rather than 401 on every turn.

Three rules hold for any agent added here:

1. **No direct database access.** Tools call the Worker's own API over the
   origin with `x-agent-actor`, so every call passes the same middleware chain a
   browser request does and an agent can never exceed the person it acts for.
   Never add a `query_d1`-style arbitrary-SQL tool — see SECURITY.md.
2. **Consequential actions are gated in code**, via `agent_approvals`, not by
   asking the model nicely in a prompt.
3. **Compliance figures come from `compliance_config`**, injected into the
   prompt each turn. No rate belongs in code or prompt text.

### Frontend (`apps/web`)

One page component per module in `src/pages/` mapped 1:1 to routes in `App.tsx`; pages are large and self-contained (fetching, state, and most UI live inline), with shared widgets extracted into `src/components/`.

`src/lib/auth.ts` owns `API`, `token()`, `currentUser()` and `authHeaders()` — these were previously copy-pasted into ~20 files. Import them; do not redefine them locally.

Three pieces of that shell are now shared rather than pasted per page, because
six pages carried byte-identical copies of each:

- `components/AppHeader.tsx` — the bar at the top of every module page. It reads
  `--module` for its accent (Finance used to spell it `success`, HR `primary`),
  and it resolves the signed-in person itself via `lib/useCurrentUser.ts`
  instead of taking a prop.
- `components/ModuleTabs.tsx` — the tab bar, underlined on desktop and a
  scrolling row of pills on a phone. It replaces `MobileTabMenu`, a dropdown
  that built its classes by interpolation (`text-${accentColor}`) and therefore
  rendered with no accent at all: Tailwind cannot emit a class that only exists
  at runtime.
- `components/UserAvatar.tsx` + `lib/avatar.ts` — the person's photo, with
  initials as the fallback. The photo never appeared anywhere before: `ga_user`
  is written from the login payload, and that payload carried no
  `profilePhoto` until now, so the `<img>` branch in each header was dead code.
  `/api/dashboard` names the same thing `avatarUrl`, which is what the
  workspace page reads.

#### Phones and the installed app

The app is installable (`public/manifest.json`, `public/sw.js`, icons generated
from the mark) and is expected to be used as one. Four things in `index.css`
carry that, all of them deliberately **unlayered** — Tailwind puts its own rules
in `@layer`, and an unlayered rule outruns every layered one, which is what lets
them beat a utility like `text-sm` on an input without a thicket of
`!important`:

- **Inputs are 16px below `md`.** Mobile Safari zooms the viewport when a
  focused field's text is under 16px and does not zoom back out, which is why
  tapping almost any field threw the layout sideways. This is the only fix that
  does not involve disabling pinch-zoom for everyone.
- **`min-h-screen`/`h-screen` resolve to `dvh`**, and every `max-h-[90vh]`
  dialog was rewritten to `dvh`. `vh` is the *largest* viewport, so a dialog
  sized in it hides its own footer under the address bar.
- **`.sheet`** docks a centred dialog to the bottom edge below `sm`. A centred
  card with `max-h-[90dvh]` is the wrong shape on a 390px screen.
- **Safe areas** are applied once on `.standalone body` rather than per header,
  because `.safe-x` *sets* padding and would silently erase an element's own
  `px-4`.

`.standalone` is stamped on `<html>` at boot for `display-mode: standalone`, and
is what distinguishes the installed app from the same URL in a tab.

The service worker never touches `/api/*` — not even stale-while-revalidate.
This is an operating system for live data; showing yesterday's payroll because
the network was slow is worse than showing nothing. Navigations are
network-first with a cached shell fallback so a deploy lands on the next load.

`src/lib/usePermissions.ts` is the single client-side permission source: it loads
`/api/permissions/me` once and exposes `can(app, feature, level)` and `canSeeApp(app)`.
Pages destructure it as `{ grants: userPermissions, loaded: permsLoaded }`. The client
never computes access itself — it renders what the server says the role grants.

Client auth state is localStorage: `ga_token` + `ga_user` for staff, `ga_client_token` for the client portal, `theme` for the dark-mode class toggled on `<html>` in `App.tsx`. Tailwind v4 via PostCSS; dark mode is class-based.

### Mail (`src/email`)

Pleiades sends and stores email. Outbound goes through Cloudflare Email Service's
`send_email` binding (`EMAIL`); inbound arrives at the `email()` handler on the
default export in `src/index.ts`. **Neither product stores anything** — Email
Routing forwards or hands the Worker a raw message and keeps no copy — so
`email_messages` plus R2 *are* the mail store, and the consequences of that
(spam filtering, durability, no IMAP) are Pleiades' problem now.

A mailbox is one row in `mailboxes`, discriminated by `kind`:

| `kind` | means | requires |
|---|---|---|
| `personal` | one staff member's own mail | `owner_user_id` |
| `app` | a department's mail | `app_name` |
| `alias` | delivers into another mailbox, **one hop only** | `forwards_to_mailbox_id` |
| `catchall` | anything unmatched (apex-only in Cloudflare) | — |
| `system` | `no-reply@`, machine identity, never listed in a UI | — |

There is no separate senders table: **a mailbox is a sending identity.** The
`From` line on an outbound message is a `mailboxes` row the caller was authorised
to send from, and is never read from a request body — the same discipline
`company_documents.department` follows.

**Access has one implementation, `canUseMailbox` in `src/email/mailboxes.ts`, and
the order of its branches is the security property:**

1. A `personal` mailbox is reached by the person it belongs to. Ownership *is*
   the permission — there is no `dashboard/email` feature, deliberately, because
   access to somebody else's private mail must not be grantable.
2. **If any `mailbox_grants` row exists for a mailbox, those rows are the whole
   answer and the app grant stops applying.** That is what lets `payroll@` be
   narrower than `hr/email`, and it widens as well as narrows. Not an OR with the
   app grant — `test/email-rbac.test.ts` fails if the two are ever combined.
3. Otherwise an `app` mailbox is reached through `<app>/email`, an ordinary
   feature on the Access page.

`<app>/email` is declared for `hr`, `finance`, `legal`, `tech`, `acquisition`,
`ops` and `crm` (not `core` — shared reference data is not a department anyone
writes to). `view` reads, `edit` sends, `delete` archives and permits a bulk send
(more than `BULK_RECIPIENT_THRESHOLD` recipients in one action — a third level
rather than a fourth feature). `<app>/email_templates` is separate because
writing the message everybody receives is not the same act as sending one, and
migration `0039` grants it **view-only**, so authoring is deliberate.
`admin/mailboxes` creates and assigns mailboxes and confers **no** ability to
read one; `admin/email_config` edits the `scope='system'` templates.

**The outbox is a row before it is an attempt.** `enqueue()` writes
`email_messages` + `email_delivery` (`status='queued'`), then the caller does
`ctx.waitUntil(drainOne(...))`; the `*/5 * * * *` cron is only the reaper for
retries, evicted sends and `scheduled_for`. `drainOne` claims with a conditional
`UPDATE ... WHERE status IN ('queued','failed')` and proceeds only on
`.meta.changes === 1`, which is what stops a `waitUntil` and a cron tick sending
the same row twice. **That claim is a lease**, not a flag: it stamps an expiry into
`next_attempt_at`, because `status='sending'` was otherwise a one-way door — a
Worker evicted between the claim and the result left the row there permanently,
invisible to the sweep, and the message was never sent and never reported. On a
`failed` row a null `next_attempt_at` means *given up*, and the sweep's three
eligibility cases are spelled out separately for that reason: as one loose OR it
read null as "due now" and retried terminal failures until they burned all five
attempts. `email_delivery.idempotency_key` is **UNIQUE in the
database** — a transactional send keys on `<event>:<entity>:<recipient>`, so
`PATCH /api/tasks/:id` rewriting every assignment row on every edit cannot
re-mail the team. `suppressed` is a distinct status from `failed`: Cloudflare
maintains the bounce/complaint list itself and retrying against it is how a
domain's reputation gets worse, which is also why there is no suppression table
here.

Automated mail is catalogued in `EMAIL_EVENTS` (`src/email/events.ts`) and
rendered from a `scope='system'` template. `transactional` events ignore
`email_prefs`; `notification` ones can be switched off, and absence of a row
means enabled. Templates are `{{name}}` substitution only — values are
HTML-escaped into the HTML part and raw into the text part, a missing **required**
variable refuses the send naming every gap, and an **undeclared** `{{x}}` is
rejected when the template is *saved* rather than when it is sent.

Templates are edited in place, unlike `compliance_config`, and the asymmetry is
deliberate: a rate must not be rewritten because past payroll used the old one,
whereas a rendered subject and body are snapshotted onto the message at send
time, so an email's history is already immutable.

`transport.ts` is the only place a message leaves the Worker, and **there are two
providers, because this account is on the Workers Free plan.** Cloudflare Email
Sending splits on exactly that line: sending to a *verified destination address*
is free on every plan and uncapped, sending to an arbitrary recipient needs
Workers Paid. So:

| service | reaches | limit |
|---|---|---|
| `env.EMAIL` (Cloudflare) | verified destination addresses only — staff | none, free |
| Resend | anybody | **90/day across the whole account** |

`mailboxes.transport` picks between them and takes three values. **`auto` is the
default and decides per message: Cloudflare first, Resend when it refuses.** The
alternative was a fixed choice per mailbox, and that is wrong half the time —
`hr@` pinned to Resend spends the day's allowance telling staff their tasks
changed, and pinned to Cloudflare it cannot write to a candidate at all. A
department mailbox has both kinds of recipient.

The fallback triggers on any refusal **except** two, which are facts about the
message rather than about the plan: `E_RECIPIENT_SUPPRESSED` (Cloudflare has the
address on its bounce/complaint list — sending it via Resend anyway is how a
sender reaches a blocklist) and `E_CONTENT_TOO_LARGE` (Resend's ceiling is no
higher). Which service actually carried a message is recorded on
`email_delivery.transport`, so a fallback is visible rather than silent — and that
column, not the mailbox configuration, is what the daily quota is counted from.
Under `auto` the two differ by definition, and counting the configuration would
charge the quota for every internal message the free path carried for nothing.

`cloudflare` and `resend` remain as explicit pins, and **nothing currently uses
them** — every send is `auto`, including the password-reset link. That is a
reversal arrived at twice over, and the history matters because the obvious design
is the broken one:

`mbx_system` was pinned to `cloudflare` so a reset notice could not traverse a
third party. Production refused the first send with `E_RECIPIENT_NOT_ALLOWED` — on
the Free plan the Cloudflare path reaches only *verified destination addresses*,
which are the external addresses Email Routing forwards TO, so an own-domain
recipient cannot be one, and a pinned mailbox cannot fall back. Moving the pin to
the message (`sensitive` events only) fixed the collateral damage and left the
reset link itself undeliverable, because Email Sending is not verified on this
account at all: `cf-bounce._domainkey` publishes an empty `p=`. A password reset
that does not arrive is not a safer password reset.

So the link goes through Resend, and the trade is stated rather than hidden:
Resend sees a single-use link for up to sixty minutes. `sensitive` still governs
**redaction**, which was always the part worth having. To restore the pin, verify
Email Sending, confirm `cf-bounce._domainkey` has a non-empty key, and set
`transport` in `dispatch` back to `spec.sensitive ? 'cloudflare' : 'auto'`.

Why no list of verified destinations here: Cloudflare holds it, and mirroring it
would be a second copy of somebody else's truth that drifts the first time an
address is added on one side only. Trying and falling back needs no list.

**Resend sends from any address at a verified domain** with no per-address setup,
and its SPF and MX sit on a `send.` subdomain — the same shape as Cloudflare's
`cf-bounce` — so the apex SPF that GoDaddy's mailboxes depend on is never edited
and the two DKIM selectors (`resend._domainkey` vs `cf-bounce`) do not collide.
Verify the apex with Resend; a subdomain is not required.

Both paths fall back to a console transport with a warning when their binding or
key is absent, so a misconfigured deploy is "mail is not going out, loudly in the
logs" rather than a throw inside whatever was sending. **Miniflare simulates
`send_email`**, so the suite drives the real binding on the Cloudflare path.

Moving to Workers Paid collapses all of this: pin every mailbox to `cloudflare`,
drop the sixth secret, and the account cap stops applying.

**Password reset depends on mail, so it must not depend on this mail.**
`users_logins.recovery_email` is where a reset link goes, validated to be off the
company domain — once the apex MX moves to Cloudflare, sending a reset to
`users_logins.email` tells a locked-out person to read a mailbox they cannot log
in to reach. The flow in `src/routes/auth.ts` already existed and was sound
(hashed single-use token, HR approval, non-enumerating response); what it lacked
was delivery, and the token is now minted **at approval** rather than at request
so an unauthenticated stranger cannot cause mail to reach any staff address.
Nothing ever emails a password.

**Inbound** is `src/email/inbound.ts`, plus `mime.ts` (a reader, not a MIME
library — nothing in the runtime parses MIME) and `spam.ts`. Three rules, and all
three exist because Email Routing keeps no copy of a message, so whatever the
handler fails to write is gone:

1. **It never throws.** A thrown `email()` bounces or loses real mail.
2. **The raw bytes go to R2 before anything is parsed.** Parsing is the step most
   likely to be wrong; the original is the part that cannot be rebuilt.
3. **Nothing is ever rejected.** `setReject()` is never called, unknown addresses
   go to the catch-all rather than bouncing (a bounce tells a stranger which
   addresses exist), and suspected spam is filed in the `spam` folder rather than
   dropped — a false positive on a client's reply costs more than a messy folder.

Threading matches `In-Reply-To`/`References` against
`email_delivery.provider_message_id`, then falls back to the most recent thread in
that mailbox from the same counterparty within 30 days, recorded in `matched_by`
rather than hidden. Per-message VERP reply addresses would be exact and are not
available: Cloudflare's subdomain routing takes **literal recipient addresses
only**, so there is no `r+<id>@` to route.

**The Workers Free plan allows 10ms of CPU per invocation**, and MIME parsing is
real CPU where D1 and R2 calls are not. A message over `MAX_PARSE_BYTES` (512 KiB)
gets its headers read and a placeholder body, with the raw file linked — being
killed mid-parse would leave the message in R2 with no row behind it, received and
invisible, which is the worst outcome available. Raise that ceiling on Workers
Paid, where the limit is 30s.

**Spam filtering is the weakest part of this and should be treated as such** —
Cloudflare does phishing detection, not spam filtering. The DMARC verdict does
most of the work because it is the only signal that is not a guess; the heaviest
rule is that a From on one of our own domains which did not pass DMARC is a
forgery, which is the case that makes invoice redirection work.

R2 holds raw MIME under `email-raw/` and attachments under `email-att/`, written
directly with `env.CRM_BUCKET.put()` and **not** added to
`ALLOWED_UPLOAD_PREFIXES` — a caller who could write there could forge received
mail. Their read rule in `src/routes/assets.ts` is the first **dynamic** one:
a stored message is readable by whoever may read the mailbox it arrived in, which
is a per-row question, so it is resolved by looking the object up and delegating
to `canUseMailbox`. A static rule listing every app's `email` feature would hand
anyone with `hr/email` the Legal mailbox's attachments.

The UI is one component, `apps/web/src/components/MailboxTab.tsx`, mounted per
scope: `{ kind: 'app', app: '<name>' }` in each module page and
`{ kind: 'personal' }` in the workspace. Mailboxes are created and assigned in
`components/MailboxAdmin.tsx` on the Access page. **HTML from an inbound message
is never rendered** — `body_text` with the raw source as a download.

### Bindings and secrets

`wrangler.jsonc` defines `DB` (D1 `pleiades-db`), `ASSETS`, `SELF` (this Worker,
bound to itself), `AI`, `EMAIL` (Cloudflare Email Service, outbound — no resource
to provision and no API key, but on the Free plan it reaches verified destination
addresses only, which is why there is a sixth secret), `VECTORIZE` (`pleiades-compliance`), `CRM_BUCKET` (R2
`pleiades-docs`, used by `/api/assets` for uploads/downloads),
`COMPLIANCE_BUCKET` (R2 `pleiades-compliance-docs`), and the two Durable Object
bindings `SLACK_AGENT` / `ACCOUNTANT_AGENT` (classes `SlackAgent` /
`AccountantAgent`).

`SELF` is declared optional in `Env` on purpose: a self-referential service
binding cannot name a script that does not exist yet, so the first deploy of a
renamed script would be impossible otherwise. `executors.ts` falls back to a
plain fetch against `WORKER_ORIGIN` when it is absent.

`CLIENTS_KV_NAMESPACE` and `MEMORY_KV_NAMESPACE` were removed: nothing read
either, and both namespaces were verified empty before the bindings were
dropped. Pleiades keeps its memory in D1 and Vectorize, never KV.

The `VECTORIZE` index carries three metadata indexes — `namespace`, `doc_id`
and `section`. The `filter:` clauses in `agents/accountant/knowledge.ts`
and `journal.ts` depend on them, and they exist only on the live index; nothing
in this repo recreates them. If the index is ever rebuilt, recreate all three or
filtering silently stops narrowing.

There are exactly **six secrets**, and the same six exist both in production
(`wrangler secret put NAME`) and in local `.dev.vars`. Keep those two sets in
step — a secret in one and not the other means local and deployed behaviour
differ silently:

| Secret | What it does | Read by |
|---|---|---|
| `JWT_SECRET` | Signs/verifies staff and client-portal JWTs | `middleware/auth.ts`, `routes/auth.ts`, `routes/portal.ts` |
| `AGENT_INTERNAL_SECRET` | Gates the internal `x-agent-actor` header; never leaves the Worker | `middleware/auth.ts`, `agents/slack/index.ts` |
| `SLACK_SIGNING_SECRET` | Verifies Slack's HMAC over the raw body | `agents/slack/lib/slack.ts` |
| `SLACK_BOT_OAUTH_TOKEN` | Posts messages back into Slack | `agents/slack/index.ts`, `utils/slack.ts` |
| `CF_AIG_TOKEN` | AI Gateway auth (`cf-aig-authorization`); both gateways require it | `utils/model.ts` |
| `RESEND_API_KEY` | Mail to anyone outside the company. The sixth, and the plan is why — see Mail | `email/transport.ts` |

`.dev.vars.example` is the committed template listing all six with a note on
where each is obtained; `.dev.vars` itself is gitignored.

Plaintext, non-sensitive config lives in `wrangler.jsonc` under `vars`:
`AI_GATEWAY_ACCOUNTANT`, `AI_GATEWAY_SLACK`, `WORKER_ORIGIN`, `LLM_MODEL`. The full
surface is the `Env` type in `src/index.ts`, where every entry names the file
that reads it — do not declare a binding nothing reads.

That rule is now enforced. `Env` used to open with an `[x: string]: any` index
signature, which made `env.ANYTHING` type-check and let six dead entries
accumulate unnoticed (`CLIENTS_KV_NAMESPACE`, `MEMORY_KV_NAMESPACE`, `AGENT_ID`,
`VERBOSE`, `CF_ACCOUNT_ID`, `LLM_PROVIDER`). The index signature is gone and an
unknown `env.*` key is a compile error. Do not reintroduce it.

`WORKER_ORIGIN` and `AGENT_INTERNAL_SECRET` are **required**, not optional.
`WORKER_ORIGIN` used to fall back to a hardcoded `https://office.galabs.workers.dev`
duplicated in `src/index.ts`, so a renamed or preview deployment would silently
call back into production; it must equal the deployed origin. `AGENT_INTERNAL_SECRET`
used to be defaulted to `''` by both senders — that never opened a bypass
(`middleware/auth.ts` refuses an empty expected value) but it made a missing
secret surface as "every agent tool call 401s" instead of "the Worker is
misconfigured".

## Gotchas

- **`scheduled()` in `src/index.ts` must branch on `event.cron`.** It runs three
  crons now — `0 6`, `0 17` and `*/5` — and the accountant's daily check used to
  run for *every* cron event, which was harmless while the only two were twelve
  hours apart. Adding the email sweep without that guard posts an agent turn 288
  times a day. Any new trigger needs its own branch.

- **Match the indentation of the file you are editing**, and note that
  `apps/web/src/components/*` is 2-space while `apps/web/src/lib/*` is tabs.
- **Do not run `npm run format` across the repo.** `.prettierrc`/`.editorconfig` specify tabs, but the existing TypeScript sources are 2-space indented; a blanket format reflows the whole codebase. Match the indentation of the file you are editing.
- The Vite dev proxy targets `127.0.0.1:8788` while `wrangler dev` defaults to `8787`. If `/api` calls 502 in dev, start the worker on 8788 (`npx wrangler dev --port 8788`).
- `wrangler dev`/`deploy` serves assets from `apps/web/dist`, so the SPA must be built before the Worker can serve it.
- **The Drizzle schema has drifted from production before.** `role_hierarchy` and `role_permissions` were defined in `schema/auth.ts` for a long time but never existed in the D1 database, so every route touching them returned a 500 that nobody noticed. If you add a table, confirm the migration actually ran against `pleiades-db` (`SELECT name FROM sqlite_master`). `test/schema-drift.test.ts` now catches this class of drift automatically.
- `test/schema.sql` is the **production** DDL, pulled from `sqlite_master`, precisely so the test database cannot drift from the real one. Regenerate it rather than hand-editing.

## Conventions

Components in `PascalCase`, pages named by domain (`Finance.tsx`), schema files by domain (`schema/crm.ts`). Commit subjects are short with conventional prefixes (`feat:`, `fix:`). Call out schema/migration changes explicitly in PRs when `packages/database/migrations/` is touched.
