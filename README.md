# Pleiades

The internal operating system of Godwin Austen Labs: HR, finance, legal, tech, ops,
acquisition and CRM in one app, with a personal workspace (tasks, repeating tasks,
calendar, notes with voice dictation, mail, time logging) and two agents — an
accountant and a Slack assistant.

It runs as a single Cloudflare Worker: a Hono API at `/api/*` and a React SPA, on
D1, R2, Vectorize and Workers AI.

## Getting started

```bash
npm install
cp .dev.vars.example .dev.vars        # fill in the seven secrets — see the file
npm run dev                           # Worker + Vite; open the Vite URL
npm test                              # the full suite, in workerd
```

Before calling a change done: `npm test`, `npx tsc --noEmit -p tsconfig.json`,
`cd apps/web && npx tsc -b`, `npm run build`, `npm run lint`.

## Deploying

`main` is production and deploys on push. `dev` is where work happens. A manual
deploy is `npm run deploy` (it builds the SPA first). Before any remote database
migration, take an undo point with `npm run db:backup`.

## Documentation

- **[CLAUDE.md](CLAUDE.md)** — the reference: architecture, authorization, data model,
  mail, agents, every gotcha. Read it before changing anything non-trivial.
- **[SECURITY.md](SECURITY.md)** — every audit, what was found, what was fixed.
- **[docs/adr/](docs/adr/README.md)** — architecture decision records.
- **[AGENTS.md](AGENTS.md)** — the short version, for coding agents.
- `docs/` — the accountant agent's spec and build tracker, the time-logging design.

Licensed under the Apache License 2.0 — see [LICENSE](LICENSE).
