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

### Rendering inbound HTML (added with `components/MailHtml.tsx`)

This is the highest-exposure surface in the system, and it is worth stating why in
one place. The apex catch-all accepts mail to **any** address at the domain, so
putting content in front of a reader requires no account, no grant and no phishing
step — only knowing the domain. And `ga_token` is in `localStorage`, so a script
executing in our origin reads it and becomes that user across every mailbox and
module they can reach. The reader most likely to open the catch-all is an admin,
which inverts the usual assumption that the most exposed content reaches the least
privileged person.

**The control is the sandbox, not the sanitiser.** `MAIL_SANDBOX` omits
`allow-scripts`, which disables scripting for that browsing context by browser
enforcement — inline handlers, `javascript:` URLs, `<script>`, all inert — so a
sanitiser bypass, which is a question of when rather than whether, is not itself a
vulnerability. It also omits `allow-same-origin`: harmless by itself, since there is
no script to use it, but catastrophic in combination, and the realistic failure is the
two flags arriving in unrelated commits months apart. `test/mail-html.test.ts` asserts
the absence of each independently rather than the absence of the pair.

Accepted costs, recorded so they are not "fixed" later by someone who does not know
they were chosen:

- **The frame cannot be measured**, because it is opaque-origin. Height is estimated
  with an expand control. Adding `allow-same-origin` to auto-size it would trade the
  second sandbox rule for a cosmetic gain.
- **Inline images cost a parent fetch each**, since the frame cannot authenticate to
  `/api/assets/download`; they are inlined as `data:` URIs under a 4 MB budget.

Defence in depth behind the sandbox, in `lib/mail-safety.ts`: an allowlist of tags,
attributes and CSS properties; `<style>`, `<svg>` and `<math>` dropped with their
subtrees (a stylesheet exfiltrates by attribute selector, and the foreign-content roots
are where the HTML and XML parsers disagree, which is the engine of mutation XSS);
`url()` and `expression()` stripped from inline styles; `position`/`z-index`/`top` not
on the property allowlist, so a message cannot overlay the app's own interface; and an
inline CSP of `default-src 'none'` with `form-action 'none'`, because a message can
still *render* a convincing fake sign-in form and that is what stops the credentials
reaching anyone. URLs are scheme-checked after control characters are stripped, since
`java<TAB>script:` is one URL to a browser and another to `startsWith`.

**Remote images are blocked by default** and loaded per message on request, never
remembered. A remote image in mail is ordinarily a beacon: it confirms the address is
live, reports when and from where it was read, and with a per-recipient URL identifies
*which* person read it even from a shared mailbox.

Two things this does **not** defend against, by nature rather than by omission:

- **Link phishing.** `<a href="https://evil/reset-your-password">` needs no script.
  Links get `rel="noopener noreferrer nofollow"` and open in a new tab; the rest is
  unsolvable inside an email client.
- **The outbound direction is a different risk class.** A composer's HTML is authored
  by an authenticated member of staff with `send` on that mailbox, so it is ordinary
  mail capability, not an escalation. Paste is still sanitised — the draft is stored
  and we render our own sent mail — but nothing tries to stop a colleague writing
  whatever HTML they like into a message they were already permitted to send.

### The Resend delivery webhook (`POST /api/webhooks/resend`)

**This is the only unauthenticated route in the system that writes to the database.**
There is no session, no user and no grant behind it; the Svix signature over the request
body is the entire authorization. What it can change — whether a message reads as
delivered or bounced — is small but it is exactly the kind of record somebody would want
to falsify, either to hide that a message never arrived or to claim one did not.

Everything about it fails closed:

- **An unset `RESEND_WEBHOOK_SECRET` refuses every request.** The tempting graceful
  degradation, accepting unsigned events with a warning in the logs, would let anyone on
  the internet rewrite delivery status. "Trust everybody when misconfigured" is never
  the right failure mode for an authorization check, and it is worse than having no
  webhook at all.
- **The signature is verified over the raw bytes before any parse.** Parsing and
  re-serialising changes the bytes and fails every genuine signature; `test/email-webhook.test.ts`
  covers a body altered after signing, which is how a captured webhook would be replayed
  against a different `email_id`.
- **Timestamps outside five minutes are refused**, in both directions, so a captured
  request has a short useful life.
- **Comparison is constant-time and every candidate is compared** — the loop is not
  broken out of on a match — so neither the answer nor which signature matched leaks
  through timing. Multiple `v1,` entries are accepted because that is how Svix rotates a
  secret.
- **It lives at its own top-level path**, not under `/api/email`. Every other router
  begins with `authMiddleware`; hanging an unauthenticated route inside one would mean
  either an exemption in a router whose premise is that everything in it is
  authenticated, or a path that only works because of Hono's matching order.
- **It returns no data.** A webhook endpoint that answers questions is an unauthenticated
  read, and rejections carry a bare `ok: false` — the reasons (bad signature, stale
  timestamp, missing secret) would otherwise be a map for whoever is probing it.

Two correctness properties that are also security properties:

- **Status only ever moves forward** (`STATUS_RANK`). Webhooks are unordered and are
  redelivered on any non-2xx, so a replayed `delivered` arriving after a `bounced` is
  ordinary rather than exotic, and clearing a bounce would restore exactly the false
  confidence this endpoint exists to remove. `complained` outranks everything, because
  continuing to mail an address that reported you is how a sending domain is destroyed,
  and that state must not be quietly cleared by anything.
- **`email.opened` and `email.clicked` are dropped without being stored.** They are read
  receipts, deliberately excluded from this system, and the surest way for a feature not
  to leak is for the data never to exist. It is the same tracking the reader refuses on
  the way in by blocking remote images.

One accepted limitation, stated so it is not mistaken for a bug: a verified event naming
a message with no delivery row answers **200**, not an error. The message may have been
pruned by retention or sent by another system on the same domain, and a retry loop would
never make it exist.

### Moving authorization onto appointments (migration 0047)

Access is now defined per *appointment* and unioned onto one login per person. The
change removed the second login somebody with two posts used to need, and in doing so
touched every authorization path in the system. Four things were found and fixed on
the way; the first three predate this work and were exploitable in different degrees,
the fourth is specific to the new model.

- **The JWT's `is_superadmin` was believed.** `authMiddleware` read the claim rather
  than the row, and superadmin bypasses every check in the system — so revoking it
  had no effect for the life of the token, which is eight days and slides forward
  while the account is in use. `users_logins` is now read on every request and the
  flag comes from there. Pinned in `test/security.test.ts` under *the token is a
  name, not a set of claims*.

- **A deactivated account could still open its own mail.** `authMiddleware` did no
  database read at all, so `is_active = 0` was enforced only by `rbac.ts` returning
  no grants. Every route that does not consult grants was therefore unaffected by
  deactivation, and mailbox ownership is exactly such a route: `canUseMailbox`
  compares `owner_user_id` against the id in the token. The middleware now refuses a
  token whose account is missing or deactivated.

- **`employeeId` came from the token**, which made it a stale copy of a link that
  decides which appointments apply — and therefore which grants and which mailboxes.
  Under the old model it selected little; under this one it selects most of somebody's
  access, so believing a week-old copy of it would have been the largest hole here.
  It is read from the row, via `actorEmployeeId`, and nothing else should read
  `UserPayload.employeeId` directly.

- **Writing a post's grants must not be an HR permission.** `PUT
  /api/permissions/user/:id` was deleted in an earlier pass for being gated on
  `hr/appointments` edit, which let anybody able to edit an appointment grant
  themselves anything. The appointment table is the same hole with a new column name,
  so `PUT /api/admin/appointments/:id/permissions` is gated on `admin/permissions`
  edit and `POST /hr/appointments` **ignores** a `permissions` key on its body rather
  than honouring it. `test/appointments-rbac.test.ts` asserts both.

Two decisions that look like inconsistencies and are deliberate:

- **An appointment mailbox takes no `mailbox_grants` rows.** For an `app` mailbox a
  grant list *replaces* the app grant rather than adding to it, which is what lets
  `payroll@` be narrower than `hr/email`. Applied to a post's mailbox, a list that
  omitted the current holder would lock them out of their own official address — and
  a per-post access step somebody has to remember is the thing this model exists to
  remove. The route refuses the rows outright.

- **A vacant or ended post's mailbox is readable by `admin/mailboxes`.** Nobody holds
  the post, mail keeps arriving, and a mailbox no living person can open is a mailbox
  whose contents are lost. Same reasoning and same grant as the catch-all. It is not
  readable by the *previous* holder: a post that conferred its access on whoever held
  it last would be the worst available behaviour, and
  `test/appointments-rbac.test.ts` and `test/appointment-mail.test.ts` both pin
  against it.

One accepted limitation. `hr/employees` edit can provision and amend the login of any
non-superadmin employee, including setting a password — it is how HR onboards, and it
was already true of the route this replaces. The guards are that a superadmin's
credentials are refused (as in `password-reset.ts` and `PATCH /admin/users/:id`), that
an address already signing another account in is refused rather than reassigned, and
that every write is audited. Anyone holding that grant should be treated as able to
act as any ordinary member of staff.

### Cascading deletion, and two silent defects it uncovered

`src/deletion/impact.ts` describes what a deletion takes with it and then takes it.
The security-relevant decisions:

- **Deleting an employee is the only path that deletes a login, and it requires
  `admin/users` delete ON TOP OF `core/employees` delete.** Without that, the weaker
  HR-shaped grant becomes the ability to remove accounts. Deleting a *post* never
  touches a login — that coupling was the bug migration 0047 removed, and
  reintroducing it on the delete path would have undone the fix.
- **Three refusals are blockers, not warnings:** a superadmin's record, the actor's
  own record, and a missing `admin/users` grant. They are reported by the impact
  endpoint and enforced again at the delete, and the wizard renders no confirm button
  when any is present. A button that always returns 403 trains people to ignore the
  message above it.
- **A mailbox is never deleted, and can never become unreadable.** Received mail is
  the only thing in a deletion that cannot be rebuilt, so a post's or a person's
  mailbox is detached and deactivated instead. `canUseMailbox` gained an orphan rule
  so those boxes resolve to `admin/mailboxes` rather than to nobody — a mailbox
  holding a leaver's correspondence that no living account can open would be a
  retention problem disguised as a safety measure.
- **Personal documents are removed from R2, not just from the database.** A CNIC scan
  or signed contract left in a bucket after the person is gone is exactly the kind of
  orphan that turns up in an audit. The impact report therefore carries download links
  for every file it is about to destroy, and the wizard requires acknowledging them.
- **`audit_logs` is never touched.** It has no foreign key into `employees` or
  `users_logins` on purpose, and the record of who deleted what must outlive the thing
  deleted. The deletion writes its own entry with the full summary.

Two defects surfaced on the way, both silent, neither introduced here:

- **`RESEND_WEBHOOK_SECRET` was never set in production.** The delivery webhook fails
  closed without it, which is correct — it is the only authorization on the system's
  one unauthenticated write — but the consequence is that no delivery event has ever
  been applied. Three messages Resend accepted, zero events recorded, a hard bounce
  visible in Resend's dashboard and reported as a success in Pleiades. The failure mode
  of a fail-closed check is invisibility, which is why `GET /api/email/delivery-health`
  now reports whether the secret exists (never its value) and whether anything has ever
  arrived, and the Mailboxes tab shows it. **Setting the secret is still an operator
  action; nothing in the code can do it.**
- **`task_attachments.task_id` referenced a table that does not exist.** A past
  hand-run rebuild of `universal_tasks` renamed it, and SQLite rewrites a dependent
  table's foreign keys on rename, so this one was repointed at the temporary name and
  left dangling when that table was dropped. SQLite resolves a foreign key target at
  write time, so every insert failed. Not a security hole, but the same shape as one:
  a feature that looks implemented, fails closed, and reports nothing anybody reads.
  Fixed in migration 0049.

### Moving the appointment capability out of HR (migration 0050)

`hr/appointments` became `admin/appointments`. The grant that creates a post and
assigns a holder was sitting in HR, next to payroll — and since migration 0047 that
grant confers access: a handover moves the post's permissions, its mailbox and its
committee seat to the new holder in a single edit. So whoever could run the payroll
could also hand somebody every permission a post carried, without touching a
permission matrix and without `admin/permissions`.

Two things keep the fix from being cosmetic:

- **The capability is split in two, and neither half opens the other.**
  `admin/appointments` manages the post; `admin/permissions` decides what it reaches.
  Together they are an escalation to anything — create a post, grant it everything,
  appoint yourself to it — so `POST /api/appointments` ignores a `permissions` key on
  its body, and `test/appointments-rbac.test.ts` asserts each grant is refused the
  other's routes.
- **The migration deletes the old rows rather than leaving them.** A grant naming a
  feature `APP_FEATURES` no longer declares can never satisfy `getPerm()`, so a copy
  left behind would sit in the table looking like access while doing nothing — the
  same class of defect as the undeclared `ledgers` and `funnels` features. It rewrites
  both `user_app_permissions` and `appointment_app_permissions`, because access has
  had two sources since 0047 and a migration remembering only one would silently
  narrow whoever held this through a post.

One consequence worth stating. `GET /api/appointments` admits **any one of**
`admin/appointments`, `admin/permissions`, `admin/mailboxes` or `hr/employees` view.
That is wider than the write path on purpose: each is a real reason to see who holds
what — managing posts, editing what one reaches, attaching an address to one, showing
somebody's job in the staff directory — and requiring the union would mean nobody
could do their job without everybody else's access. Reading the list reveals titles
and holders, which the staff directory already shows. Writing is `admin/appointments`
alone, and the router sits at the top level rather than inside `/api/admin` precisely
so the read can be opened to HR without opening the admin app to them.
