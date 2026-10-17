#!/usr/bin/env bash
# Takes an undo point for pleiades-db: a Time Travel bookmark and a full export.
#
#   npm run db:backup
#
# Run it before every remote migration and every bulk data change. It writes two
# files into backups/ (gitignored — the export is real data, including password
# hashes; never commit it):
#
#   pleiades-db-<UTC stamp>.sql        full schema + data export
#   pleiades-db-<UTC stamp>.bookmark   the Time Travel bookmark taken first
#
# To undo to the bookmark (D1 keeps 30 days of history):
#   npx wrangler d1 time-travel restore pleiades-db --bookmark=<bookmark>
# To rebuild the LOCAL database from an export, see CLAUDE.md > Syncing the
# local database.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=pleiades-db
STAMP=$(date -u +%Y%m%dT%H%MZ)
mkdir -p backups
chmod 700 backups

BOOKMARK=$(npx wrangler d1 time-travel info "$DB" 2>&1 | grep -oE "bookmark is '[^']+'" | cut -d"'" -f2)
if [ -z "$BOOKMARK" ]; then
  echo "Could not read a Time Travel bookmark for $DB — is wrangler logged in?" >&2
  exit 1
fi
echo "$BOOKMARK  taken $STAMP" > "backups/$DB-$STAMP.bookmark"

npx wrangler d1 export "$DB" --remote --output="backups/$DB-$STAMP.sql"
chmod 600 "backups/$DB-$STAMP.sql" "backups/$DB-$STAMP.bookmark"

echo
echo "Backup:   backups/$DB-$STAMP.sql ($(grep -c '^INSERT' "backups/$DB-$STAMP.sql") rows)"
echo "Bookmark: $BOOKMARK"
echo "Restore:  npx wrangler d1 time-travel restore $DB --bookmark=$BOOKMARK"
