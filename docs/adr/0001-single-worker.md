# 0001 — One Cloudflare Worker serves the API and the SPA

**Status:** Accepted

**Context.** Pleiades is an internal system for one company on the Workers Free
plan. It needs an API, a web app, cron, inbound mail and two agents.

**Decision.** A single Worker (`pleiades`): a Hono app for `/api/*`, the built SPA
served by the assets binding, `scheduled()` for the crons, `email()` for inbound
mail, and the two agents as Durable Objects in the same script. Persistence is one
D1 database (`pleiades-db`), two R2 buckets, Vectorize and Workers AI.

**Consequences.** One deploy, one origin (so no CORS and same-origin cookies would
be possible, though none are used — see 0009), one set of secrets. The cost is the
Free plan's 10 ms CPU per invocation, which shapes several decisions (0008, 0010,
and MIME parsing limits in CLAUDE.md). Every resource is named `pleiades*`, which
`test/config.test.ts` enforces.
