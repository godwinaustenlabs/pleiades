import { describe, it, expect } from 'vitest';
import { allRoutes } from './routes';

/**
 * The route table, snapshotted.
 *
 * This is the anti-drift test. A router that stops being mounted still
 * compiles, still deploys, and simply 404s — there is no other check in the
 * suite that would notice. The same goes for a path typo'd during a move
 * between directories.
 *
 * If this snapshot changes, either a route was intentionally added or removed
 * (update the snapshot in the same commit) or something was dropped by
 * accident.
 */
describe('route manifest', () => {
  it('matches the recorded route table', async () => {
    const lines = allRoutes().map((r) => `${r.method.padEnd(6)} ${r.path}`);
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./__snapshots__/routes.txt');
  });

  it('mounts every module router', () => {
    const paths = allRoutes().map((r) => r.path);
    // Every module named in src/index.ts's route registry must contribute at
    // least one endpoint. Catches a whole router silently failing to mount.
    for (const mod of [
      'auth', 'core', 'hr', 'tasks', 'finance', 'legal', 'tech', 'acquisition',
      'ops', 'admin', 'crm', 'portal', 'dashboard', 'permissions', 'assets',
      'notifications', 'messages',
    ]) {
      expect(paths.some((p) => p.startsWith(`/api/${mod}/`) || p === `/api/${mod}`),
        `no routes mounted under /api/${mod}`).toBe(true);
    }
    expect(paths.some((p) => p.startsWith('/api/public/calendar'))).toBe(true);
    expect(paths.some((p) => p.startsWith('/api/agents/slack'))).toBe(true);
    expect(paths.some((p) => p.startsWith('/api/finance/agent'))).toBe(true);
  });
});
