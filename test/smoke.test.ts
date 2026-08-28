import { describe, it, expect, beforeAll } from 'vitest';
import { SELF } from 'cloudflare:test';
import { allRoutes, concrete } from './routes';
import { resetDatabase, tokenFor } from './helpers';

/**
 * The golden response manifest.
 *
 * Every GET route is fetched as a superadmin and reduced to a structural
 * fingerprint: status, the `success` flag, and the *shape* of `data` — never
 * its values. The result is committed, and the claim it supports is narrow but
 * strong: if this file is byte-identical before and after a refactor, that
 * refactor changed no response anywhere in the API, including the routes
 * nobody thought to write a test for.
 *
 * That is what makes it the baseline for the platform rename. A hand-written
 * assertion can only check what its author imagined; this checks everything
 * that is actually mounted.
 *
 * Rules that keep it deterministic and therefore useful:
 *
 *  - GET only. A smoke sweep that mutates fails differently on its second run,
 *    which would make a diff meaningless.
 *  - Shapes, not values. Ids, timestamps and row counts vary with the fixture;
 *    key sets do not.
 *  - Error *messages* are recorded, because they are stable for the failures
 *    that matter here (a missing table, a refused binding) and because a
 *    hostname leaking into an error string is exactly the kind of rename bug
 *    this is meant to catch.
 */

/** Structural fingerprint of a value: key sets and types, never scalars. */
function shape(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    // Length is fixture-dependent, so it is deliberately not recorded — only
    // whether the array is empty, and the shape of its first element.
    return v.length === 0 ? 'array<empty>' : `array<${shape(v[0])}>`;
  }
  if (typeof v === 'object') {
    return `{${Object.keys(v as object).sort().join(',')}}`;
  }
  return typeof v;
}

function fingerprint(status: number, contentType: string, body: string): string {
  if (!contentType.includes('application/json')) {
    // ICS feeds, PDFs, redirects. Record the type, not the bytes.
    return `${status} ${contentType.split(';')[0] || 'no-content-type'}`;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return `${status} unparseable-json`;
  }
  const env = parsed as { success?: boolean; data?: unknown; error?: unknown };
  if (env && typeof env === 'object' && 'success' in env) {
    return env.success
      ? `${status} ok data=${shape(env.data)}`
      : `${status} err=${JSON.stringify(env.error)}`;
  }
  // Endpoints that predate the envelope (/api/health) or auth's bare errors.
  return `${status} raw=${shape(parsed)}`;
}

describe('golden response manifest', () => {
  let token: string;

  beforeAll(async () => {
    await resetDatabase();
    token = await tokenFor('ceo');
  });

  it('every GET route responds as recorded', async () => {
    // Wildcards are skipped: `/api/assets/*` has no meaningful probe value and
    // resolving one would reach for R2.
    const gets = allRoutes().filter((r) => r.method === 'GET' && !r.path.includes('*'));

    const lines: string[] = [];
    for (const r of gets) {
      const path = concrete(r.path);
      let line: string;
      try {
        const res = await SELF.fetch(`https://test.local${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        line = fingerprint(res.status, res.headers.get('content-type') ?? '', await res.text());
      } catch (err) {
        // A throw that escapes the handler is itself a stable, recordable fact.
        line = `THREW ${err instanceof Error ? err.message : String(err)}`;
      }
      lines.push(`${r.path}\n    ${line}`);
    }

    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('./__snapshots__/responses.txt');
  });
});
