# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GAnovaOS ("officeOS") is an internal company operating system deployed as a **single Cloudflare Worker**. One Hono API (`src/`) serves `/api/*` and also serves the built React SPA (`apps/web/dist`) as static assets with SPA fallback. Persistence is Cloudflare D1 (SQLite) via Drizzle ORM, plus KV, R2, and Workers AI bindings.

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
npm test          # vitest — RBAC permission-matrix suite (see test/)
npm run test:watch
```

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
npx wrangler d1 migrations apply office-db --local     # or --remote
npx wrangler d1 execute office-db --local --command="..."
```

Note: `packages/database`'s own `migrate` script now refuses to run and points at
the root-level command above — it used to name a database (`ganova-db`) that does
not exist.

Migrations are **hand-written**; `drizzle-kit generate` is not part of the current
workflow. Its snapshot baseline stopped at `0019` and still describes the
pre-roles-only schema (`role_permissions`, `role_hierarchy`, `user_app_*`), so a
`generate` today prompts to rename tables that were already replaced and would
emit a file numbered `0020`, colliding with the hand-written `0020_role_based_access.sql`.
Reconciling that baseline is a deliberate decision, not a routine step. What
authoritatively records migration state is `office-db`'s own `d1_migrations`
table, not `meta/_journal.json`.

## Architecture

### Request flow

`src/index.ts` is the only Worker entrypoint. It mounts one Hono sub-router per domain under `/api/<module>`: `auth`, `core`, `hr`, `tasks`, `finance`, `legal`, `tech`, `acquisition`, `ops`, `admin`, `crm`, `portal`, `dashboard`, `permissions`, `assets`, `notifications`, `public/calendar`, `messages`, `agent`, plus `agents/slack`. Each router applies its own middleware at the top of its file:

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

Drizzle schema split by domain under `src/schema/` (`auth`, `core`, `hr`, `finance`, `legal`, `tech`, `acquisition`, `crm`, `unified_tasks`, `notifications`, `relations`), all re-exported from `schema/index.ts`. Consumers import `{ getDb, schema }` from `@ganova/database` (path-mapped in the root `tsconfig.json`).

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

Upload prefixes must be passed explicitly (`pathPrefix` on a `file` field in
`EntityForm`). They were once derived from the *form's title*, so
"Upload Institutional Asset" wrote to `upload_institutional_asset/`; the bucket
still holds several such prefixes, listed as legacy entries in `READ_RULES`.
Do not add new ones.

`universal_tasks` is the cross-department task table (`department` field: HR | Finance | Legal | Ops | Acquisition | Tech) with `task_assignments` as the many-to-many join to employees. Task permissions are checked per-department via the `tasks` feature (`checkFeaturePermission(c, dept, 'tasks', ...)`), not by a router-level gate.

### Agents (`src/agents`)

One directory per agent, no loose files. Both are Agents-SDK Durable Objects
exported from `src/index.ts` and bound in `wrangler.jsonc`.

- `slack/` — the Slack assistant, one instance per Slack conversation.
- `pleiades/` — the accountant. One instance per conversation;
  `compliance.ts` turns operator configuration into payroll components,
  `tools.ts` is the HR + accounting surface, `approvals.ts` is the
  human-in-the-loop gate, `access.ts` decides who may drive it.

Both run their turn loop on the Vercel AI SDK (`generateText`, tools defined
with `tool()` and zod schemas) over **Workers AI** via the `AI` binding —
`LLM_MODEL` in `wrangler.jsonc`, currently `@cf/openai/gpt-oss-120b`. Using the
binding rather than a third-party provider means no external quota can stop a
payroll run mid-way.

Each agent's calls are routed through **its own AI Gateway**
(`AI_GATEWAY_PLEIADES`, `AI_GATEWAY_SLACK`), built in `src/utils/model.ts`. One
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

`src/lib/usePermissions.ts` is the single client-side permission source: it loads
`/api/permissions/me` once and exposes `can(app, feature, level)` and `canSeeApp(app)`.
Pages destructure it as `{ grants: userPermissions, loaded: permsLoaded }`. The client
never computes access itself — it renders what the server says the role grants.

Client auth state is localStorage: `ga_token` + `ga_user` for staff, `ga_client_token` for the client portal, `theme` for the dark-mode class toggled on `<html>` in `App.tsx`. Tailwind v4 via PostCSS; dark mode is class-based.

### Bindings and secrets

`wrangler.jsonc` defines `DB` (D1 `office-db`), `ASSETS`, `SELF` (this Worker,
bound to itself), `AI`, `VECTORIZE` (`pleiades-compliance`), `CRM_BUCKET` (R2
`office-crm-docs`, used by `/api/assets` for uploads/downloads),
`COMPLIANCE_BUCKET` (R2 `office-compliance-docs`), and the two Durable Object
bindings `SLACK_AGENT` / `PLEIADES_AGENT`.

`CLIENTS_KV_NAMESPACE` and `MEMORY_KV_NAMESPACE` were removed: nothing read
either, and both namespaces were verified empty before the bindings were
dropped. Pleiades keeps its memory in D1 and Vectorize, never KV.

The `VECTORIZE` index carries three metadata indexes — `namespace`, `doc_id`
and `section`. The `filter:` clauses in `agents/pleiades-accountant/knowledge.ts`
and `journal.ts` depend on them, and they exist only on the live index; nothing
in this repo recreates them. If the index is ever rebuilt, recreate all three or
filtering silently stops narrowing.

There are exactly **five secrets**, and the same five exist both in production
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

`.dev.vars.example` is the committed template listing all five with a note on
where each is obtained; `.dev.vars` itself is gitignored.

Plaintext, non-sensitive config lives in `wrangler.jsonc` under `vars`:
`AI_GATEWAY_PLEIADES`, `AI_GATEWAY_SLACK`, `WORKER_ORIGIN`, `LLM_MODEL`. The full
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

- **Do not run `npm run format` across the repo.** `.prettierrc`/`.editorconfig` specify tabs, but the existing TypeScript sources are 2-space indented; a blanket format reflows the whole codebase. Match the indentation of the file you are editing.
- The Vite dev proxy targets `127.0.0.1:8788` while `wrangler dev` defaults to `8787`. If `/api` calls 502 in dev, start the worker on 8788 (`npx wrangler dev --port 8788`).
- `wrangler dev`/`deploy` serves assets from `apps/web/dist`, so the SPA must be built before the Worker can serve it.
- **The Drizzle schema has drifted from production before.** `role_hierarchy` and `role_permissions` were defined in `schema/auth.ts` for a long time but never existed in the D1 database, so every route touching them returned a 500 that nobody noticed. If you add a table, confirm the migration actually ran against `office-db` (`SELECT name FROM sqlite_master`).
- `test/schema.sql` is the **production** DDL, pulled from `sqlite_master`, precisely so the test database cannot drift from the real one. Regenerate it rather than hand-editing.

## Conventions

Components in `PascalCase`, pages named by domain (`Finance.tsx`), schema files by domain (`schema/crm.ts`). Commit subjects are short with conventional prefixes (`feat:`, `fix:`). Call out schema/migration changes explicitly in PRs when `packages/database/migrations/` is touched.
