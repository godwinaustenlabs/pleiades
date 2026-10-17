# AGENTS.md

Guidance for any coding agent (Codex, Claude Code, Cursor, …) working in this
repository. **CLAUDE.md is the authoritative reference** — architecture, the
authorization model, mail, time logging, repeating tasks and every hard-won gotcha.
This file is the short version and must not contradict it. SECURITY.md records every
security decision; `docs/adr/` records every arguable one.

## What this is

Pleiades — Godwin Austen Labs' internal operating system. One Cloudflare Worker
(`pleiades`) serves a Hono API at `/api/*` and the React SPA from `apps/web/dist`,
with D1 (`pleiades-db`), R2, Vectorize, Workers AI, two agent Durable Objects, crons
and an inbound-mail handler. Workers **Free** plan: 10 ms CPU per invocation.

```
src/                 the Worker: routes/, middleware/ (auth, rbac), agents/, email/,
                     tasks/, time/, statements/, deletion/, utils/
apps/web/            Vite + React SPA (pages/, components/, lib/, public/_headers)
packages/database/   Drizzle schema (src/schema/) + hand-written SQL migrations
test/                Vitest in workerd — test/schema.sql is production's DDL
docs/adr/            architecture decision records
scripts/             backup, cutover and verification scripts
```

## Commands

```bash
npm run dev            # wrangler dev + Vite (Vite proxies /api to 127.0.0.1:8788)
npm test               # the full suite, in workerd
npm run build          # build the SPA
npm run lint           # ESLint (web) — 0 errors required; warnings are tracked debt
npm run deploy         # build, then wrangler deploy (pushing main also deploys)
npm run db:backup      # bookmark + full export — before ANY remote migration
npx tsc --noEmit -p tsconfig.json && (cd apps/web && npx tsc -b)   # typecheck both
```

**Gates before you call anything done:** `npm test`, both typechecks, `npm run build`,
`npm run lint`. If a gate fails, say so with the output; never weaken a test to pass.

## Rules that are not negotiable

1. **Authorization goes through `src/middleware/rbac.ts`.** Gate every route with
   `requireFeatureAccess(app, feature, level)` and declare new features in
   `APP_FEATURES` with a migration granting them. Never read permissions from the token.
2. **Agents call the Worker's own API**, never D1. No arbitrary-SQL tool, ever.
3. **Migrations are hand-written SQL**, numbered, in `packages/database/migrations/`,
   applied from the repo root with `wrangler d1 migrations apply pleiades-db`. Back up
   and rehearse on a copy of production first; regenerate `test/schema.sql` from it.
4. **Errors**: `serverError(c, err)` never echoes internals; throw `PublicError` for a
   message the user should see.
5. **Never spread a request body across an ownership boundary** (a person's notes or
   profile, a task's department or creator) — use an allowlist.
6. **Tokens**: `Authorization: Bearer` only; `?token=` exists solely for the two
   link-opened download paths. No cookies.
7. **Never commit** `.dev.vars`, `backups/`, `cutover/` or any database dump. Secrets go
   through `wrangler secret put`.
8. **Snapshots** (`test/__snapshots__/`) are regenerated deliberately, in the same
   commit as the behaviour change they record — never to turn a red build green.

## Style

Match the file you are editing: `src/` and `apps/web/src/components/` are 2-space,
`apps/web/src/lib/` is tabs. Do not run `npm run format` across the repo. Components
in PascalCase, pages by domain (`Finance.tsx`), schema files by domain. Comments
explain *why*, not what.

## Commits and branches

Work on `dev`; `main` is production and deploys on push. Short conventional subjects
(`feat:`, `fix:`, `chore:`, `docs:`). Call out migrations explicitly in the message.
