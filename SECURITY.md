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

### Mail (added with `src/email`)

- **`PATCH /api/admin/users/:id` used to be a denylist and let anyone with
  `admin/users` edit set `is_superadmin` on themselves.** It spread the request
  body into the update behind `delete body.passwordHash; delete body.password;`,
  so the flag CLAUDE.md describes as settable "only by direct DB access, never
  through the API" was in fact settable through the API, bypassing every
  permission check in the system. It is now an allowlist — the failure mode of a
  denylist is silent, and it had already claimed a second victim in waiting:
  `recovery_email` would have been writable the moment the column existed.
  Rejected keys are recorded in the audit log rather than dropped, so an attempt
  is findable.
- **Nothing ever emails a password.** The reset flow delivers a single-use,
  one-hour link, and the token is minted **at approval** rather than at request —
  `POST /auth/request-reset` is unauthenticated, so a token minted there would be
  mail a stranger could cause to arrive in any staff inbox, repeatedly. Emailing
  a generated password would instead let anyone who knows an address lock the real
  user out without reading the mail, and would leave a working credential sitting
  in a mailbox — which, now that mail is stored in D1, means sitting in this
  database.
- **Reset mail goes to `users_logins.recovery_email`, which is validated to be off
  the company domain.** Once the apex MX moves to Cloudflare, `users_logins.email`
  is a mailbox inside Pleiades, and a reset sent there tells a locked-out person
  to read a mailbox they cannot log in to reach. Unset is refused with a reason,
  never silently substituted.
- **`email-raw/` and `email-att/` are not in `ALLOWED_UPLOAD_PREFIXES`.** The
  Worker writes them directly with `env.CRM_BUCKET.put()`. A caller able to write
  there could forge received mail — a message that appears to have arrived from
  anybody.
- **The inbound handler never auto-replies.** `message.reply()` to a possibly
  spoofed sender is a backscatter vector, and Cloudflare's own constraints (one
  reply per event, inbound DMARC must pass) make it a footgun.
- **Mail content in D1 is now among the most sensitive data in this database**,
  alongside `users_logins`, `api_keys`, `payroll_records` and `employees.cnic`.
  That strengthens rather than changes the rule above about never adding a
  `query_d1`-style arbitrary-SQL agent tool: prompt injection inside a received
  message is now a path into the mail store.
- **A mailbox can only be created on a domain this Worker can send as**
  (`SENDABLE_DOMAINS` in `src/routes/email.ts`). Cloudflare would refuse a send
  from an unverified domain anyway, but relying on the provider to enforce our own
  naming rule is how that becomes a real hole the day a second sending domain is
  onboarded for an unrelated reason.
- **`no-reply@` is `kind='system'`: no person can read it or send as it**, not even
  a superadmin-adjacent `admin/mailboxes` holder. A message from that address is
  what recipients have been taught to read as automated, so a human being able to
  send one is the impersonation risk.

### Found in the adversarial pass over the mail subsystem

All four were found by writing the attack rather than reading the code, and all
four are pinned by `test/email-adversarial.test.ts` — each one turns a test red if
the fix is reverted.

- **`POST /auth/request-reset` enumerated staff accounts.** Both branches returned
  200 with `submitted: true`, but different `message` text — "Your password reset
  request has been queued" for a real account against "If this email exists…" for
  an unknown one. The function's own comment claimed it "never reveals whether the
  email exists". Every login at this company is on one domain, so a list of valid
  addresses is the first step of a phishing or credential-stuffing campaign. Both
  branches now return one shared constant. A timing difference remains — the real
  path mints a token and writes rows — and is noted rather than chased.
- **A sender could forge their own authentication verdict.** `authResults()` read
  whatever `Authentication-Results` header was first, and anybody can put
  `Authentication-Results: mx; dmarc=pass` in a message they send. A receiving MTA
  prepends its own above that and the parser keeps the first occurrence, so
  Cloudflare's verdict normally wins — but if Cloudflare ever adds none, the
  sender's is read, and that single header defeats the one rule that catches
  somebody claiming to be us. That rule is what stands between the company and
  invoice redirection. The authserv-id is now checked against `TRUSTED_AUTHSERV`
  and an unattributable header yields no verdicts, which fails closed: absent
  authentication plus an our-domain sender scores as spam.
- **The same header parser read a policy tag as a verdict.** `spf=(\w+)`
  unanchored matches the `spf=` inside `aspf=r`, and real DMARC results carry
  `dmarc=pass (p=REJECT sp=REJECT aspf=r)`. It reported an SPF verdict of "r" for
  a message whose SPF was never evaluated. Anchored on a delimiter now.
- **`PATCH /api/email/messages/:id` accepted a folder change at read level**, so a
  view-only holder of `<app>/email` could move a department's correspondence to the
  trash. Filing mail is working the mailbox; it needs `send`.

Two more of the same shape as the `is_superadmin` finding above, both fixed by
replacing a body spread with an allowlist:

- **`PATCH /api/email/mailboxes/:id`** would have accepted `address`, `kind`,
  `ownerUserId`, `appName` and `forwardsToMailboxId`. Changing an address or kind
  re-points every message already stored against that mailbox; re-owning a personal
  one hands one person's mail to another; and `forwardsToMailboxId` would have let
  a PATCH build the alias chain that create deliberately refuses.
- **`PATCH /api/email/templates/:id`** would have accepted `scope` and `appName`,
  so a caller holding only `acquisition/email_templates` could promote a template
  to `scope='system'` and thereby own every department's automated mail — including
  the password-reset email.

Outbound header fields (`subject`, display names, addresses) are stripped of CR,
LF, U+2028/9 and NUL before sending. Neither provider concatenates our strings
into a header block today, so this is not a live injection path; it is there for
the version of `transport.ts` that builds raw MIME, where a smuggled `Bcc:` would
be invisible on the message we stored.

### Found by the independent review pass

Two exploitable findings, both in code added by this change, both now covered by
`test/email-adversarial.test.ts`.

- **Any authenticated user could emit the company's own password-reset email.**
  The template gate in `POST /api/email/send` read
  `if (tpl.scope === 'app' && tpl.appName && !perm)`, so a `scope='system'`
  template fell through with no check at all — and the seeded system templates
  include `password_reset`, whose `{{resetUrl}}` is a required variable the caller
  supplies. Anyone who could send from any mailbox, including their own personal
  one with no department grant whatsoever, could therefore produce the real reset
  email, verbatim, DKIM-signed and DMARC-aligned, from a genuine
  `@godwinausten.org` address, pointing at a link of their choosing — and have it
  stored in the recipient's Pleiades inbox as a legitimate internal message.
  Sending one to themselves also dumped the text of every system template that
  `GET /templates` deliberately withholds. System templates are now refused from
  that route entirely, for everybody including a superadmin: `EMAIL_EVENTS` renders
  them, and a reset mail a person composed is a phishing mail by definition. The
  same fix closes the `scope='app'` with a null `appName` case that the `&&`
  short-circuit waved through.

- **Two grantable admin permissions could be walked up to superadmin.** A
  non-superadmin holding `admin/users` edit and `admin/resets` edit could point a
  superadmin's `recovery_email` at their own inbox, trigger the unauthenticated
  `request-reset`, approve it themselves (the approve route treats `admin/users`
  edit as blanket authority and skips the `user_ownership` check), receive the
  token, and set the superadmin's password. **This change created the path**: the
  chain was inert while the token was minted and discarded, and wiring up delivery
  activated it — the same commit whose allowlist was written to stop
  `is_superadmin` being set through the API opened an indirect route to the same
  outcome. Closed at three independent points, each covered by its own test: the
  approve route refuses a superadmin target before any token is minted;
  `PATCH /users/:id` refuses a `recoveryEmail` write on a superadmin by anyone but
  that account; and `sendResetApprovedEmail` refuses to deliver one. A superadmin's
  password is reset by direct database access, the same rule that governs the flag.

Three further weaknesses fixed from the same pass:

- **A live reset link sat in plaintext in D1.** `token.ts` stores only a hash so
  that a database read yields nothing usable, and then the sent-mail row kept the
  rendered body containing the working link — for the sixty minutes the token was
  valid, the hash and the secret it guards were in the same database. Events marked
  `sensitive` have their stored body replaced after the transport has read it.
  (The first attempt redacted before the send and would have delivered the
  placeholder; `drainOne` reads the body back out of the row.)
- **Inbound thread matching was not scoped to the mailbox.** `References:` is
  attacker-controlled, and the `provider_message_id` lookup was global, so a
  guessed id would file a stranger's message into another mailbox's thread. Nothing
  reads messages by thread alone today, so it disclosed nothing — it would have
  become a disclosure the day a thread view was added.
- **`parseAddrs` accepted several addresses in one entry.** The bulk threshold
  counts entries, so a string a provider might split on would let the count and the
  actual recipients disagree. Entries containing a separator, bracket, whitespace or
  a second `@` are now refused.
