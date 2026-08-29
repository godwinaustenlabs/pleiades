import { describe, it, expect } from 'vitest';
import { getTableName, is, Table } from 'drizzle-orm';
import { schema } from '@pleiades/database';
import schemaSql from './schema.sql?raw';

/**
 * The Drizzle schema against the production DDL.
 *
 * This repo has been bitten twice by a table that existed in `schema/*.ts` and
 * not in the database: `role_hierarchy` and `role_permissions` were declared
 * for a long time but never deployed, so every route touching them returned a
 * 500 nobody noticed. `test/schema.sql` is a verbatim dump of production's
 * sqlite_master precisely so that gap is visible — but nothing compared the two
 * until now.
 */

/** Table names Drizzle declares. */
function drizzleTables(): string[] {
  const out: string[] = [];
  for (const v of Object.values(schema as Record<string, unknown>)) {
    if (is(v, Table)) out.push(getTableName(v));
  }
  return [...new Set(out)].sort();
}

/** Table names the production DDL creates. */
function productionTables(): string[] {
  const re = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+[`"']?([A-Za-z_][A-Za-z0-9_]*)[`"']?/gi;
  const out: string[] = [];
  for (const m of schemaSql.matchAll(re)) out.push(m[1]);
  return [...new Set(out)].sort();
}

/**
 * Tables Drizzle declares that production does not have.
 *
 * `tasks` is real and currently unfixed: it is created by migration 0000, is
 * recorded in pleiades-db's d1_migrations as applied, and does not exist in the
 * database — so it was dropped by hand at some point. The five handlers in
 * src/routes/tech.ts that read it return
 * `D1_ERROR: no such table: tasks` in production today, which
 * test/__snapshots__/responses.txt records.
 *
 * It is listed here so the gap is documented in code rather than folklore, and
 * so it cannot silently grow to two. Removing it from this list means either
 * writing the migration or deleting the dead routes.
 */
const KNOWN_MISSING_IN_PRODUCTION = ['tasks'];

describe('schema drift', () => {
  it('declares no table that production lacks, beyond the known gap', () => {
    const prod = new Set(productionTables());
    const missing = drizzleTables().filter((t) => !prod.has(t));
    expect(missing.sort()).toEqual([...KNOWN_MISSING_IN_PRODUCTION].sort());
  });

  it('leaves no production table undeclared that routes would need', () => {
    // The reverse direction is informational: production legitimately carries
    // d1_migrations and other tables Drizzle has no reason to model. This only
    // asserts the dump was parsed at all, so a broken regex cannot make the
    // check above vacuously pass.
    expect(productionTables().length).toBeGreaterThan(80);
    expect(drizzleTables().length).toBeGreaterThan(80);
  });

  it('still lacks the roles tables that were removed in 0025', () => {
    // Do not reintroduce: roles could only ever be widened for everyone holding
    // them, which is the opposite of what granting one person access requires.
    const all = new Set([...drizzleTables(), ...productionTables()]);
    for (const gone of ['roles', 'role_app_permissions', 'role_permissions', 'role_hierarchy', 'user_app_access']) {
      expect(all.has(gone), `${gone} is back`).toBe(false);
    }
  });
});
