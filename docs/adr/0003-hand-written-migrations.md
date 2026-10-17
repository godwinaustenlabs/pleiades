# 0003 — Migrations are hand-written SQL; drizzle-kit is not used

**Status:** Accepted. October 2026: the stale `migrations/meta/` snapshots,
`drizzle.config.ts` and the `drizzle-kit` dependency were removed.

**Context.** drizzle-kit's snapshot baseline stopped at migration 0019 and described a
schema (roles, `user_app_*`) that no longer existed; `generate` would have proposed
renaming live tables and emitted a file colliding with a hand-written 0020. Several
migrations (data moves, grant copies, FK-safe rebuilds) cannot be generated at all.

**Decision.** Every migration is a numbered, hand-written `.sql` file in
`packages/database/migrations/`, applied with `wrangler d1 migrations apply` from
the repo root. Production's `d1_migrations` table is the record of what ran.
`test/schema.sql` is production's DDL, regenerated from `sqlite_master`, and
`test/schema-drift.test.ts` fails if Drizzle declares a table production lacks.

**Consequences.** Each migration is reviewed as SQL and rehearsed against a copy of
production (`npm run db:backup`, then apply to a scratch copy with foreign keys on)
before it runs remotely. Drizzle is used only as a typed query builder.
