/**
 * Route enumeration shared by manifest.test.ts and smoke.test.ts.
 *
 * Hono merges a sub-app's routes into the parent's `routes` array with fully
 * merged paths, so `app.routes` sees `/api/finance/agent/knowledge/:id` even
 * though that handler is registered three mounts deep. Verified against Hono
 * 4.x before this was built on.
 */
import { app } from '../src/index';

export type Route = { method: string; path: string };

/**
 * Every registered handler, deduplicated.
 *
 * `ALL` entries are dropped: those are `.use()` middleware registrations
 * (`hrRouter.use('*', authMiddleware)` and friends), not endpoints. Hono lists
 * each of them once per mount, which is why the raw array is roughly twice the
 * number of real routes.
 */
export function allRoutes(): Route[] {
  const seen = new Set<string>();
  const out: Route[] = [];
  for (const r of (app as unknown as { routes: Route[] }).routes) {
    if (r.method === 'ALL') continue;
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ method: r.method, path: r.path });
  }
  return out.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

/**
 * Concrete values for path parameters.
 *
 * Everything not named here gets `__probe__`, which is deliberate: a route
 * whose id does not resolve still has a stable, recordable behaviour (404, or
 * 400 on a malformed id), and recording that is the point. A per-route fixture
 * map would be a second thing to maintain and would drift.
 */
const PARAMS: Record<string, string> = {
  ':userId': 'u_ceo',
  ':id': '__probe__',
};

/** Substitutes path params so a route template can actually be fetched. */
export function concrete(path: string): string {
  return path
    .split('/')
    .map((seg) => (seg.startsWith(':') ? (PARAMS[seg] ?? '__probe__') : seg))
    .join('/');
}
