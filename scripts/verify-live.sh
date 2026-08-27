#!/bin/zsh
# Post-cutover functional check against a deployed Worker.
#
#   ./scripts/verify-live.sh https://pleiades.galabs.workers.dev
#
# Unauthenticated on purpose. Every check below distinguishes "the feature is
# wired and refusing me" from "the feature is broken", which is what actually
# needs proving after a storage swap — a 401 means the route, the middleware and
# the database lookup behind it all ran. A 500 is the failure to look for.
set -u
BASE="${1:-https://pleiades.galabs.workers.dev}"
PASS=0; FAIL=0

check() {  # check <name> <expected-codes-regex> <curl args...>
  local name="$1" expect="$2"; shift 2
  local code
  code=$(curl -s -o /tmp/vl.out -w "%{http_code}" "$@")
  if [[ "$code" =~ $expect ]]; then
    print -P "  %F{green}ok%f   $name (${code})"; PASS=$((PASS+1))
  else
    print -P "  %F{red}FAIL%f $name — got ${code}, wanted ${expect}"
    head -c 200 /tmp/vl.out; echo; FAIL=$((FAIL+1))
  fi
}

print -P "%F{cyan}== $BASE ==%f"

check "health"                    '^200$' "$BASE/api/health"
check "SPA root"                  '^200$' "$BASE/"
check "SPA deep link"             '^200$' "$BASE/admin"
check "renamed logo asset"        '^200$' "$BASE/pleiades_logo_light.png"
check "unknown /api path is JSON 404" '^404$' "$BASE/api/nope"

# Auth: a rejected login proves the users_logins lookup and the PBKDF2 compare
# both ran against the new database. A 500 here means the schema did not survive.
check "login rejects bad credentials" '^(400|401)$' -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' --data '{"email":"nobody@example.com","password":"x"}'

# Every module gate refuses an anonymous caller rather than erroring.
for m in core hr finance legal tech acquisition ops admin crm dashboard permissions tasks messages notifications; do
  check "gate /api/$m" '^401$' "$BASE/api/$m/"
done

check "portal is a separate auth world" '^401$' "$BASE/api/portal/whoami"
check "agent surface gated"             '^401$' "$BASE/api/finance/agent/config"
# The key is only parsed after /download/, so a path without it yields an
# empty key, is treated as non-public, and 401s for the wrong reason.
check "asset download gated"            '^(401|403|404)$' "$BASE/api/assets/download/company-docs/nothing.pdf"
check "public avatar prefix is served"  '^(200|404)$'     "$BASE/api/assets/download/avatars/nothing.jpg"
check "calendar feed rejects bad token" '^404$' "$BASE/api/public/calendar/feed/not-a-token.ics"
check "forged agent actor refused"      '^401$' "$BASE/api/core/employees" \
  -H 'x-agent-actor: u_ceo' -H 'x-agent-secret: wrong'
check "slack endpoint rejects unsigned" '^(400|401|403)$' -X POST "$BASE/api/agents/slack/event" \
  -H 'Content-Type: application/json' --data '{"type":"url_verification","challenge":"x"}'

print -P "\n%F{cyan}passed $PASS, failed $FAIL%f"
[ "$FAIL" -eq 0 ]
