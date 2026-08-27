#!/bin/zsh
# Per-table row counts for a D1 database, chunked to stay under D1's
# compound-SELECT term limit. Emits "table<TAB>count" sorted by table.
DB="$1"
cd "/Users/saadnaik/Godwin Austen Labs/pleiades" || exit 1
TABLES=$(npx wrangler d1 execute "$DB" --remote --json \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name" \
  2>/dev/null | jq -r '.[0].results[].name')
BATCH=5; Q=""; N=0
emit() {
  [ -z "$Q" ] && return
  npx wrangler d1 execute "$DB" --remote --json --command="$Q" 2>/dev/null \
    | jq -r '.[0].results[] | "\(.t)\t\(.n)"'
  Q=""; N=0
}
for t in ${(f)TABLES}; do
  S="SELECT '$t' t, COUNT(*) n FROM \"$t\""
  if [ -z "$Q" ]; then Q="$S"; else Q="$Q UNION ALL $S"; fi
  N=$((N+1)); [ $N -ge $BATCH ] && emit
done
emit
