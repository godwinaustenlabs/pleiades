#!/usr/bin/env python3
"""
Reorder a `wrangler d1 export` data dump so parent rows are inserted before
the rows that reference them.

Why this is needed
------------------
`wrangler d1 export` emits INSERTs in sqlite_master order, not dependency
order, and prefixes the dump with `PRAGMA defer_foreign_keys=TRUE`. That pragma
is per-transaction, and D1 executes an imported file server-side in batches, so
it does not survive to the statements that need it. Importing a dump of a
healthy database into an empty one therefore fails with:

    FOREIGN KEY constraint failed: SQLITE_CONSTRAINT

which reads like data corruption and is not — it is purely statement order.
Feeding the schema and the data in separately does not help on its own; the
data half still inserts children first.

D1 also rejects a combined schema+data dump with `no such table: main.<t>`,
so the import is always three steps:

    wrangler d1 export  <src> --remote --no-data   --output=schema.sql
    wrangler d1 export  <src> --remote --no-schema --output=data.sql
    python3 scripts/d1-order-dump.py schema.sql data.sql ordered.sql
    wrangler d1 execute <dst> --remote --file=schema.sql  --yes
    wrangler d1 execute <dst> --remote --file=ordered.sql --yes

`--drops <schema.sql> <drops.sql>` emits DROP TABLE statements in the reverse
order, children first, so an existing database can be cleared before reimport.
Dropping in sqlite_master order fails the same way inserting in it does.

sqlite_sequence is dropped deliberately. SQLite maintains it itself, and
replaying the dump's copy leaves two rows for the same table, which makes the
next AUTOINCREMENT id for that table unpredictable. In this schema that is
d1_migrations, so the damage would be to migration bookkeeping.
"""
import collections
import re
import sys


def statements(sql: str):
    """Split on `;` outside string literals, so a `;` in data is not a split."""
    out, cur, in_str = [], '', False
    for i, ch in enumerate(sql):
        if in_str:
            cur += ch
            if ch == "'":
                in_str = sql[i + 1:i + 2] == "'"
            continue
        if ch == "'":
            in_str = True
        elif ch == ';':
            out.append(cur)
            cur = ''
            continue
        cur += ch
    out.append(cur)
    return out


def dependency_order(schema_sql: str):
    """Table names, parents before children. Self-references are ignored."""
    deps, tables = collections.defaultdict(set), []
    for stmt in statements(schema_sql):
        m = re.match(r'\s*CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[`"]?(\w+)[`"]?\s*\((.*)\)\s*$',
                     stmt, re.S)
        if not m:
            continue
        table, body = m.group(1), m.group(2)
        tables.append(table)
        for fk in re.finditer(r'REFERENCES\s+[`"]?(\w+)[`"]?', body):
            if fk.group(1) != table:
                deps[table].add(fk.group(1))

    known = set(tables)
    for t in list(deps):
        deps[t] &= known

    order, done = [], set()

    def visit(t, path):
        if t in done or t in path:   # a cycle keeps source order; D1 has none today
            return
        path.add(t)
        for d in sorted(deps.get(t, ())):
            visit(d, path)
        path.discard(t)
        done.add(t)
        order.append(t)

    for t in tables:
        visit(t, set())
    return order, known


def emit_drops(schema_path, out_path):
    """DROP TABLE statements, children before parents.

    Dropping in arbitrary order fails with `FOREIGN KEY constraint failed`:
    D1 enforces foreign keys, so a parent cannot go while rows still reference
    it. Reversing the insert order drops every child first.
    """
    order, _ = dependency_order(open(schema_path).read())
    with open(out_path, 'w') as f:
        for t in reversed(order):
            f.write(f'DROP TABLE IF EXISTS "{t}";\n')
    print(f"DROP statements written : {len(order)} (children first)")


def main():
    if len(sys.argv) == 4 and sys.argv[1] == '--drops':
        return emit_drops(sys.argv[2], sys.argv[3])
    if len(sys.argv) != 4:
        sys.exit(f"usage: {sys.argv[0]} <schema.sql> <data.sql> <ordered.sql>\n"
                 f"       {sys.argv[0]} --drops <schema.sql> <drops.sql>")
    schema_path, data_path, out_path = sys.argv[1:]

    order, known = dependency_order(open(schema_path).read())

    blocks, preamble = collections.defaultdict(list), []
    insert_re = re.compile(r'^INSERT INTO\s+[`"]?(\w+)[`"]?')
    for line in open(data_path):
        m = insert_re.match(line)
        if m:
            blocks[m.group(1)].append(line)
        elif line.strip().upper().startswith('PRAGMA'):
            preamble.append(line)

    dropped = len(blocks.pop('sqlite_sequence', []))
    unknown = sorted(t for t in blocks if t not in known)

    written, total = set(), 0
    with open(out_path, 'w') as f:
        f.writelines(preamble)
        for t in order:
            if t in blocks:
                f.writelines(blocks[t])
                written.add(t)
                total += len(blocks[t])
        for t in sorted(blocks):          # not in the graph: emit last
            if t not in written:
                f.writelines(blocks[t])
                total += len(blocks[t])

    expected = sum(len(v) for v in blocks.values())
    print(f"tables in schema      : {len(known)}")
    print(f"tables carrying rows  : {len(blocks)}")
    print(f"INSERTs written       : {total} (expected {expected})")
    print(f"sqlite_sequence rows dropped: {dropped}")
    if unknown:
        print(f"WARNING: data for tables absent from the schema: {unknown}")
    if total != expected:
        sys.exit("ERROR: INSERT count mismatch — refusing to vouch for this dump")


if __name__ == '__main__':
    main()
