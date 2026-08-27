# Repository Guidelines

## Project Structure & Module Organization
This is an npm workspace with two main areas:

- `apps/web/`: Vite + React frontend. Source lives in `apps/web/src/`, with pages in `src/pages/`, reusable UI in `src/components/`, and static assets in `src/assets/` and `public/`.
- `packages/database/`: shared Drizzle schema and migrations. Schemas are in `src/schema/`, utilities in `src/utils/`, and SQL migrations in `migrations/`.

Keep feature code close to the module it serves. For example, UI for a page should usually stay under `apps/web/src/pages/` or a nearby component file.

## Build, Test, and Development Commands

- `npm run dev`: starts the local development stack from the repo root. It runs the worker dev process and the workspace `dev` tasks together.
- `npm run build`: runs the Turbo build across workspaces.
- `npm run lint`: runs Turbo lint tasks across workspaces.
- `npm run format`: formats Markdown and TypeScript files with Prettier.
- `cd apps/web && npm run dev`: starts the Vite frontend only.
- `cd apps/web && npm run build`: type-checks and builds the web app.
- `cd packages/database && npm run generate`: generates a new Drizzle migration.
- `cd packages/database && npm run migrate`: applies local D1 migrations.

## Coding Style & Naming Conventions
Use tabs, LF line endings, UTF-8, and semicolons. Prettier is configured with `printWidth: 140`, `singleQuote: true`, and `useTabs: true`. ESLint is the main linting tool for the web app.

Name React components in `PascalCase` (`TaskBoard.tsx`), page modules by route or domain (`Finance.tsx`), and keep schema files domain-based (`src/schema/auth.ts`, `src/schema/crm.ts`).

## Testing Guidelines
There is no dedicated automated test runner configured in the workspace today. Use `npm run lint` and `npm run build` as the baseline verification before opening a PR. If you add tests, place them near the code they cover and use standard names such as `*.test.ts` or `*.spec.ts`.

## Commit & Pull Request Guidelines
Recent commits use short, direct messages, often with conventional prefixes like `fix:` and `feat:`. Follow that pattern when possible and keep the subject line focused on one change.

Pull requests should include a concise description of the change, any relevant issue link, and screenshots for UI updates. Note schema or migration changes explicitly when `packages/database/migrations/` is touched.
