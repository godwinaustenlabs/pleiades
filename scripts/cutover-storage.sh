#!/bin/zsh
# Storage cutover: move the pleiades Worker from office-* to pleiades-*.
#
# Run this only when you are ready for users to stop using office in the same
# sitting. The moment pleiades is repointed, office-db and pleiades-db diverge,
# and anything written to office afterwards is not in pleiades-db.
#
# Everything before this point is reversible and non-disruptive. This step is
# the one that needs a write freeze.
#
# Abort at any point: revert wrangler.jsonc and `npx wrangler deploy`. office-db
# and the office-* buckets are never written to by this script.
set -e
cd "/Users/saadnaik/Godwin Austen Labs/pleiades"
export PATH="/opt/homebrew/bin:$PATH"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_REGION=auto RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_R2_ACCESS_KEY_ID=$(grep '^CF_ACCESS_KEY_ID=' .dev.vars | cut -d= -f2)
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$(grep '^CF_SECRET_ACCESS_KEY=' .dev.vars | cut -d= -f2)
export RCLONE_CONFIG_R2_ENDPOINT=$(grep '^CF_S3_ENDPOINT=' .dev.vars | cut -d= -f2-)
PLEIADES_DB_ID="f075010c-d41b-4c3e-b859-9981b3e7aad1"

step() { print -P "\n%F{cyan}== $1 ==%f"; }

step "1/7  Record the last write, so drift is detectable afterwards"
npx wrangler d1 execute office-db --remote --json \
  --command="SELECT MAX(timestamp) last_audit FROM audit_logs" | jq -c '.[0].results'

step "2/7  Export office-db (schema and data separately — a combined dump does not import)"
rm -rf cutover/final && mkdir -p cutover/final
npx wrangler d1 export office-db --remote --no-data   --output=cutover/final/schema.sql >/dev/null
npx wrangler d1 export office-db --remote --no-schema --output=cutover/final/data.sql   >/dev/null
python3 scripts/d1-order-dump.py cutover/final/schema.sql cutover/final/data.sql cutover/final/ordered.sql

step "3/7  Rebuild pleiades-db from that export"
# Dropping every table is what makes this re-runnable: a failed attempt can be
# retried without hand-cleaning a half-populated database.
DROPS=$(npx wrangler d1 execute pleiades-db --remote --json \
  --command="SELECT group_concat('DROP TABLE IF EXISTS \"'||name||'\";', ' ') q
             FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'" \
  | jq -r '.[0].results[0].q // empty')
[ -n "$DROPS" ] && npx wrangler d1 execute pleiades-db --remote --command="$DROPS" --yes >/dev/null
npx wrangler d1 execute pleiades-db --remote --file=cutover/final/schema.sql  --yes >/dev/null
npx wrangler d1 execute pleiades-db --remote --file=cutover/final/ordered.sql --yes >/dev/null

step "4/7  Verify the copy — row counts, DDL, and content"
./scripts/d1-row-counts.sh office-db   | sort > cutover/final/counts-office.txt
./scripts/d1-row-counts.sh pleiades-db | sort > cutover/final/counts-pleiades.txt
diff cutover/final/counts-office.txt cutover/final/counts-pleiades.txt \
  && echo "  row counts identical ($(wc -l < cutover/final/counts-office.txt | tr -d ' ') tables, $(awk -F'\t' '{s+=$2} END{print s}' cutover/final/counts-office.txt) rows)"
npx wrangler d1 export pleiades-db --remote --no-data   --output=cutover/final/schema-new.sql >/dev/null
npx wrangler d1 export pleiades-db --remote --no-schema --output=cutover/final/data-new.sql   >/dev/null
diff <(grep -v '^PRAGMA' cutover/final/schema.sql | sort) \
     <(grep -v '^PRAGMA' cutover/final/schema-new.sql | sort) && echo "  DDL identical"
A=$(grep '^INSERT INTO' cutover/final/data.sql     | grep -v sqlite_sequence | sort | shasum -a 256 | cut -d' ' -f1)
B=$(grep '^INSERT INTO' cutover/final/data-new.sql | grep -v sqlite_sequence | sort | shasum -a 256 | cut -d' ' -f1)
[ "$A" = "$B" ] && echo "  content identical ($A)" || { echo "  CONTENT MISMATCH — STOP"; exit 1; }

step "5/7  R2 delta — picks up anything written since the bulk copy"
rclone copy r2:office-crm-docs        r2:pleiades-docs            --transfers=8 --stats-one-line
rclone copy r2:office-compliance-docs r2:pleiades-compliance-docs --transfers=4 --stats-one-line
rclone check r2:office-crm-docs        r2:pleiades-docs            --one-way --size-only
rclone check r2:office-compliance-docs r2:pleiades-compliance-docs --one-way --size-only

step "6/7  Every D1 pointer into R2 still resolves"
npx wrangler d1 execute pleiades-db --remote --json --command="SELECT r2_key FROM knowledge_documents" \
  | jq -r '.[0].results[].r2_key' | sort > cutover/final/kd-keys.txt
rclone lsf r2:pleiades-compliance-docs --recursive | sort > cutover/final/comp-objects.txt
MISSING=$(comm -23 cutover/final/kd-keys.txt cutover/final/comp-objects.txt)
[ -z "$MISSING" ] && echo "  every knowledge_documents.r2_key resolves" \
  || { echo "  UNRESOLVED KEYS:\n$MISSING"; exit 1; }

step "7/7  Repoint the Worker and deploy"
python3 - "$PLEIADES_DB_ID" <<'PY'
import sys, re
p = 'wrangler.jsonc'
s = open(p).read()
s = s.replace('"database_name": "office-db"', '"database_name": "pleiades-db"')
s = re.sub(r'"database_id": "[^"]+"', f'"database_id": "{sys.argv[1]}"', s)
s = s.replace('"bucket_name": "office-crm-docs"', '"bucket_name": "pleiades-docs"')
s = s.replace('"bucket_name": "office-compliance-docs"', '"bucket_name": "pleiades-compliance-docs"')
open(p, 'w').write(s)
PY
# The transitional allowance in config.test.ts exists for the window that just
# closed; drop it so the naming rule tightens and catches anything left behind.
python3 - <<'PY'
p = 'test/config.test.ts'
s = open(p).read()
s = s.replace("const TRANSITIONAL_PREFIXES = ['office'];", "const TRANSITIONAL_PREFIXES: string[] = [];")
open(p, 'w').write(s)
PY
npm test 2>&1 | grep -E "Test Files|Tests " | tail -2
npx wrangler deploy 2>&1 | grep -E "^env\.(DB|CRM_BUCKET|COMPLIANCE_BUCKET)|Current Version"

print -P "\n%F{green}Storage cutover complete.%f pleiades now serves pleiades-db and pleiades-*."
echo "office-db and the office-* buckets are untouched — revert wrangler.jsonc and redeploy to roll back."
echo "Next: point users and Slack at https://pleiades.galabs.workers.dev"
