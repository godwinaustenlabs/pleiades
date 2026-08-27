import { describe, it, expect } from 'vitest';
import wranglerRaw from '../wrangler.jsonc?raw';

/**
 * Contracts on wrangler.jsonc itself.
 *
 * These are the invariants a rename breaks, and none of them are checked
 * anywhere else: miniflare gives tests an ephemeral local D1, so a wrong
 * `database_name` or `bucket_name` cannot fail a normal test — it fails in
 * production, once.
 */

/**
 * Minimal JSONC reader: strips `//` and block comments outside strings, then
 * parses. A dependency for this would have to be added to the root package for
 * one test file, and the grammar we need is small — the config has no trailing
 * commas (the one after CF_ACCOUNT_ID went with the dead vars).
 */
function parseJsonc(src: string): any {
  let out = '';
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (ch === '\\') { out += src[++i]; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; out += '\n'; continue; }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    out += ch;
  }
  return JSON.parse(out);
}

const cfg = parseJsonc(wranglerRaw);

describe('wrangler.jsonc contracts', () => {
  it('parses as JSON once comments are stripped', () => {
    // Guards the trailing comma that sat after CF_ACCOUNT_ID for a long time:
    // legal JSONC, but it means no tool that expects JSON can read this file.
    expect(typeof cfg).toBe('object');
  });

  it('binds SELF to its own script name', () => {
    // The single most dangerous coupling in the file. If these drift, SELF is
    // unbound, executors.ts falls back to a plain fetch against the Worker's
    // own public origin, and that loopback hangs — every agent tool call and
    // every approval execution dies.
    const self = (cfg.services ?? []).find((s: any) => s.binding === 'SELF');
    expect(self, 'no SELF service binding').toBeDefined();
    expect(self.service).toBe(cfg.name);
  });

  it('points WORKER_ORIGIN at its own hostname', () => {
    // WORKER_ORIGIN is what the cron path calls back into. Pointed at the wrong
    // script, a preview or renamed deployment drives production's payroll.
    expect(cfg.vars.WORKER_ORIGIN).toBe(`https://${cfg.name}.galabs.workers.dev`);
  });

  it('declares every Durable Object class in a migration tag', () => {
    // A SQLite-backed DO with no migration entry has no storage and throws on
    // first use of this.sql.
    const declared = new Set<string>();
    for (const m of cfg.migrations ?? []) {
      for (const c of m.new_sqlite_classes ?? []) declared.add(c);
      for (const c of m.new_classes ?? []) declared.add(c);
      for (const r of m.renamed_classes ?? []) { declared.add(r.to); declared.delete(r.from); }
      for (const d of m.deleted_classes ?? []) declared.delete(d);
    }
    for (const b of cfg.durable_objects?.bindings ?? []) {
      expect(declared.has(b.class_name), `DO class ${b.class_name} has no migration tag`).toBe(true);
    }
  });

  it('keeps migration tags unique', () => {
    const tags = (cfg.migrations ?? []).map((m: any) => m.tag);
    expect(new Set(tags).size, `duplicate migration tags: ${tags.join(',')}`).toBe(tags.length);
  });

  it('declares no var that the Env type does not', () => {
    // The other half of "do not declare a binding nothing reads": Env is
    // checked by tsc, but a var present only in wrangler.jsonc would be
    // invisible to it.
    const known = ['AI_GATEWAY_ACCOUNTANT', 'AI_GATEWAY_SLACK', 'WORKER_ORIGIN', 'LLM_MODEL'];
    expect(Object.keys(cfg.vars).sort()).toEqual([...known].sort());
  });

  it('binds no KV namespace', () => {
    // Both were dead and both were verified empty before removal. If one comes
    // back, it needs a read site and a line in CLAUDE.md.
    expect(cfg.kv_namespaces ?? []).toEqual([]);
  });

  /**
   * Prefixes that resource names may still carry mid-cutover.
   *
   * The `pleiades` Worker is deployed pointing at `office-db` and the `office-*`
   * buckets on purpose: both hostnames then serve identical data from one
   * dataset, so the new script can be validated against production before any
   * data moves, and nothing has to be frozen to get there.
   *
   * Empty this list when the storage cutover lands. The rule below tightens
   * automatically, and anything left behind fails.
   */
  const TRANSITIONAL_PREFIXES: string[] = [];

  it('names its resources consistently', () => {
    // The rename's own self-check. Every resource name must share a prefix with
    // the script, so a resource left behind under an abandoned name fails here
    // rather than in production.
    const prefix = cfg.name;
    const names = [
      cfg.d1_databases?.[0]?.database_name,
      ...(cfg.r2_buckets ?? []).map((b: any) => b.bucket_name),
    ].filter(Boolean);
    for (const n of names) {
      const ok = n.startsWith(prefix) || TRANSITIONAL_PREFIXES.some((p) => n.startsWith(p));
      expect(ok, `resource "${n}" matches neither "${prefix}" nor a transitional prefix`).toBe(true);
    }
  });

  it('never contains the misspelling', () => {
    // `plieades` (transposed ie) reached production as an R2 bucket and two
    // logo files. It must not reach this file.
    expect(wranglerRaw.toLowerCase()).not.toContain('plieades');
  });
});
