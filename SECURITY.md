# Security

## Audit — August 2026

A pre-implementation audit ahead of building the accounting agent. Everything
below marked **Fixed** is closed and pinned by tests in `test/security.test.ts`
(run `npm test`). Items under **Action required** need a human decision.

### Fixed

| # | Severity | Issue |
|---|---|---|
| 1 | Critical | **Slack identity was a trusted header.** `authMiddleware` accepted `x-slack-id: <slackUserId>` and granted that employee's full RBAC identity. Combined with #2, any unauthenticated caller could `curl -H "x-slack-id: <ceo>"` and read or write anything that user could. Replaced with `x-agent-actor` + `x-agent-secret`, gated by the `AGENT_INTERNAL_SECRET` Worker secret, which never leaves the Worker. |
| 2 | Critical | **No Slack request verification.** `POST /api/agents/slack/event` verified nothing; `SLACK_SIGNING_SECRET` was set in production but never read by the code. Now verifies Slack's HMAC over the raw body with a 5-minute replay window, before the `url_verification` handshake is answered. |
| 3 | Critical | **Passwords stored as unsalted SHA-256.** One fast hash, no per-user salt: identical passwords produced identical digests and the whole space is precomputable. Replaced with PBKDF2-HMAC-SHA256 (210,000 iterations, per-user salt). Legacy digests still verify and are transparently upgraded on next login, so no one is locked out. Applies to staff logins and client-portal logins. |
| 4 | High | **Finance and HR were gated only at the app level.** A user holding just `finance/tasks` could read every ledger, account and invoice; any `hr` grant holder could read all salaries. 39 finance and 47 HR routes are now gated per feature. Salary, payroll, loans and salary structures moved to the `payroll` feature rather than the broad `employees` grant. |
| 5 | High | **Notification forgery.** `POST /api/notifications/send` had no authorization: any authenticated user could deliver a notification with an arbitrary `link` to any other user — a ready-made phishing channel. It had no callers. Now requires `admin/users` edit and validates the target exists. |
| 6 | High | **Employee PII over-exposure.** `GET /api/core/employees` returned full CNIC, bank details, tax information, salary and home address to anyone holding a `core` grant — which is nearly every role. Those fields are now stripped unless the caller holds `hr/employees` view (or is reading their own record). |
| 7 | Medium | **Unrestricted R2 upload keys.** `PUT /api/assets/upload/*` took the key from the URL verbatim, so a caller could write anywhere in the bucket, including over another user's object and into `avatars/`/`profiles/`, which are served publicly with no authentication. Keys are now validated (no traversal, no control characters, length capped) and restricted to an allowlist of prefixes, with a 25MB size cap. |
| 8 | Medium | **Stored-XSS via uploaded content type.** Downloads echoed whatever `Content-Type` the uploader sent, so `text/html` in the public `avatars/` prefix would execute on this origin. Responses now send `X-Content-Type-Options: nosniff`, and anything outside a small inline-safe allowlist is forced to `application/octet-stream` with `Content-Disposition: attachment`. |
| 9 | Medium | **Audience-scoped tokens were usable as API credentials.** The JWT branch verified the signature but ignored `aud`. Tokens minted for a narrow purpose are now rejected for general API access. (Prerequisite for the agent's short-lived WebSocket ticket.) |

Also fixed earlier in the same pass: API keys were compared in plaintext against
the hash column (so no issued key could ever authenticate), and
`requireAppAccess`'s `_minLevel` argument was silently ignored, making 24
"admin-only" routes reachable with plain HR view access.

### Action required

1. ~~**Rotate the passwords of all existing users.**~~ **Done, 25 Aug 2026.**
   All nine staff accounts were reset to freshly generated passwords hashed with
   PBKDF2, so the unsalted SHA-256 digests committed in `data_only.sql` and
   `old_db_dump.sql` (commit `15114b1`) no longer authenticate anything. The one
   client-portal login was not rotated: it belongs to an external party with no
   distribution channel, and its legacy hash upgrades on next login.

2. **Decide whether to rewrite git history.** *(Still open.)* The dumps are
   removed from the working tree and gitignored, but they remain in history.
   Rotation neutralised the hashes, so what is left is nine real email
   addresses. Purging them (`git filter-repo` or BFG) rewrites commits and needs
   a coordinated force-push, so it stays a deliberate decision.

3. ~~**Set `AGENT_INTERNAL_SECRET` in every environment.**~~ **Done.** Present
   in production and in local `.dev.vars`. The Slack agent fails closed without
   it. See CLAUDE.md for the full five-secret inventory — production secrets and
   `.dev.vars` are kept in step by name.

### Notes for future work

- **Never add a `query_d1`-style arbitrary-SQL tool.** D1 has no read-only role
  or per-table grants, so such a tool would expose `users_logins`, `api_keys`,
  `payroll_records` and `employees.cnic` in full, and prompt injection inside
  any free-text field (an invoice description, say) would become a database
  read. Agent access must stay as named, fixed-path tools.
- Agent tools inherit the calling user's permissions by routing through the same
  Hono middleware chain (`authMiddleware` → `requireAppAccess` →
  `requireFeatureAccess`), so there is exactly one authorization implementation.
  Do not add a path that queries D1 directly for agent data.
- `.dev.vars` is gitignored and untracked. Keep it that way; secrets belong in
  `wrangler secret put`.
