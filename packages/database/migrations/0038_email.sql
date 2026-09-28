-- Pleiades becomes the company's mail system.
--
-- Until now the only outbound signal this system could produce was Slack:
-- `postToSlack` at src/routes/tasks.ts:154-167 is the single notification in the
-- codebase, fire-and-forget with no record that it happened, and reassigning a
-- task notifies nobody at all. Acquisition tracked outreach with an
-- `emails_sent` counter on `outreach_logs` and no per-message record, because
-- the mail was sent from somebody's personal client and never existed here.
--
-- These tables are the mail store. Cloudflare Email Routing hands the Worker a
-- raw message; the body goes to R2 and the metadata here. Cloudflare Email
-- Sending takes outbound. Neither product stores anything itself, which is the
-- whole reason this schema exists.
--
-- Two design notes that will otherwise read as mistakes:
--
--  1. `email_messages` holds BOTH directions and every folder, and delivery
--     state lives in its own table rather than as nullable columns on it. A
--     webmail UI lists across folders and directions constantly, so splitting
--     inbound from outbound would mean a UNION on every page load; but letting
--     retry counters sit NULL on every inbound row would break this codebase's
--     rule that a declared column means something on every row. `email_delivery`
--     resolves both: a row exists only for a message actually being sent.
--
--  2. `email_templates` rows are edited IN PLACE, unlike `compliance_config`,
--     whose rule is that a rate change is a new row and never an edit. That
--     rule exists because past payroll was computed with the old rate and
--     rewriting it rewrites the past. An email is not a rate: the rendered
--     subject and body are snapshotted onto the message row at send time, so
--     history is already immutable and a second versioning scheme would buy
--     nothing.
--
-- There is deliberately no suppression table. Cloudflare maintains the
-- authoritative bounce/complaint list itself (hard bounce permanent or 7 days,
-- soft 24 hours, complaint permanent) and returns E_RECIPIENT_SUPPRESSED; a
-- second copy would drift from it. The code is recorded on the delivery row.

-- ─────────────────────────────────────────────────────────────────────────────
-- Mailboxes: the sending identity AND the thing mail is stored against.
--
-- One table for all five kinds rather than one per kind, because every kind is
-- an address that mail is resolved to; `kind` is the discriminator and its
-- invariants are enforced in src/routes/email.ts:
--
--   personal  -> requires owner_user_id          (one staff member's mail)
--   app       -> requires app_name               (a department's mail)
--   alias     -> requires forwards_to_mailbox_id (delivers into another box)
--   catchall  -> requires neither                (anything unmatched; one only)
--   system    -> requires neither                (no-reply@; never shown in UI)
--
-- This is also why there is no separate `email_senders` table: a mailbox IS a
-- sending identity, and two tables holding addresses would drift apart. The
-- From address on an outbound message is a row here that the caller has been
-- authorised to send from — it is never read from a request body, the same
-- discipline company_documents.department follows.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mailboxes (
  mailbox_id             TEXT PRIMARY KEY,
  address                TEXT NOT NULL UNIQUE,
  display_name           TEXT,
  kind                   TEXT NOT NULL,
  owner_user_id          TEXT REFERENCES users_logins (id),
  app_name               TEXT,
  forwards_to_mailbox_id TEXT REFERENCES mailboxes (mailbox_id),
  -- Counted from email_delivery per mailbox per UTC day. Exceeding it fails the
  -- enqueue with a 400 rather than dropping the message silently.
  daily_send_cap         INTEGER NOT NULL DEFAULT 200,
  is_active              INTEGER NOT NULL DEFAULT 1,
  created_by             TEXT REFERENCES users_logins (id),
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_owner  ON mailboxes (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_app    ON mailboxes (app_name);
CREATE INDEX IF NOT EXISTS idx_mailboxes_kind   ON mailboxes (kind);
CREATE INDEX IF NOT EXISTS idx_mailboxes_active ON mailboxes (is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-mailbox grants: the OVERRIDE, not the primary mechanism.
--
-- Access to an app mailbox normally comes from the `<app>/email` feature in
-- user_app_permissions, so it is managed on the Access page like everything
-- else. That cannot express one case which is real: payroll@ inside HR, where
-- three people hold hr/email and only one of them may read it.
--
-- So: with NO rows here for a mailbox, the app grant decides. With ANY row here
-- for a mailbox, only these rows decide and the app grant stops applying. That
-- ordering is what makes the narrow case expressible without making the common
-- case require any rows at all.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mailbox_grants (
  mailbox_id TEXT NOT NULL REFERENCES mailboxes (mailbox_id),
  user_id    TEXT NOT NULL REFERENCES users_logins (id),
  can_read   INTEGER NOT NULL DEFAULT 1,
  can_send   INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users_logins (id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (mailbox_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mailbox_grants_user ON mailbox_grants (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Threads. A table rather than something derived, because the inbox list is
-- "threads by last activity" and that is one indexed read here instead of a
-- group-by across messages on every page load.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_threads (
  thread_id       TEXT PRIMARY KEY,
  mailbox_id      TEXT NOT NULL REFERENCES mailboxes (mailbox_id),
  subject         TEXT,
  -- Set when the counterparty is a known lead, so an Acquisition thread can be
  -- read next to the deal it belongs to.
  contact_id      TEXT,
  last_message_at INTEGER NOT NULL,
  message_count   INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_threads_mailbox ON email_threads (mailbox_id, last_message_at);
CREATE INDEX IF NOT EXISTS idx_email_threads_contact ON email_threads (contact_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Messages: the store. Every direction, every folder.
--
-- body_text is NOT NULL on purpose. A missing text/plain part raises spam
-- scores on the way out, and on the way in it is what the reader renders —
-- HTML from a stranger is never rendered, only offered as a raw download.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  message_id         TEXT PRIMARY KEY,
  mailbox_id         TEXT NOT NULL REFERENCES mailboxes (mailbox_id),
  thread_id          TEXT REFERENCES email_threads (thread_id),
  direction          TEXT NOT NULL,
  folder             TEXT NOT NULL,
  from_address       TEXT NOT NULL,
  from_name          TEXT,
  to_addresses       TEXT NOT NULL,
  cc_addresses       TEXT,
  bcc_addresses      TEXT,
  subject            TEXT,
  body_text          TEXT NOT NULL,
  body_html          TEXT,
  -- The RFC 5322 headers, kept so a reply can be threaded back to us.
  message_id_header  TEXT,
  in_reply_to_header TEXT,
  references_header  TEXT,
  raw_key            TEXT,
  raw_size           INTEGER,
  spf_result         TEXT,
  dkim_result        TEXT,
  dmarc_result       TEXT,
  spam_score         REAL,
  spam_verdict       TEXT,
  is_read            INTEGER NOT NULL DEFAULT 0,
  is_starred         INTEGER NOT NULL DEFAULT 0,
  received_at        INTEGER,
  created_by         TEXT REFERENCES users_logins (id),
  created_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_messages_box    ON email_messages (mailbox_id, folder, created_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_msgid  ON email_messages (message_id_header);
CREATE INDEX IF NOT EXISTS idx_email_messages_from   ON email_messages (from_address);
CREATE INDEX IF NOT EXISTS idx_email_messages_rawkey ON email_messages (raw_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- Delivery state. One row per message actually being sent, so no column here is
-- ever NULL because it does not apply.
--
-- idempotency_key is the whole double-send defence, and it is a UNIQUE column
-- rather than a convention so the database enforces it. A transactional send
-- keys on '<event>:<entity>:<recipient>', which means "task tsk_x assigned to
-- emp_y" can produce exactly one email however many times the handler runs —
-- and PATCH /tasks/:id deletes and re-inserts every assignment on every edit,
-- so that handler runs a lot.
--
-- status: queued -> sending -> sent | failed | suppressed | cancelled.
-- `suppressed` is deliberately not `failed`: Cloudflare's suppression list is
-- not our error and must never be retried.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_delivery (
  message_id          TEXT PRIMARY KEY REFERENCES email_messages (message_id),
  status              TEXT NOT NULL DEFAULT 'queued',
  attempts            INTEGER NOT NULL DEFAULT 0,
  next_attempt_at     INTEGER,
  scheduled_for       INTEGER,
  provider_message_id TEXT,
  error_code          TEXT,
  error_message       TEXT,
  idempotency_key     TEXT NOT NULL UNIQUE,
  queued_at           INTEGER NOT NULL,
  sent_at             INTEGER
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_sweep    ON email_delivery (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_delivery_provider ON email_delivery (provider_message_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Attachments. A table rather than a JSON column on the message, because each
-- one is listed, downloaded individually, and permission-checked on its own.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_attachments (
  attachment_id TEXT PRIMARY KEY,
  message_id    TEXT NOT NULL REFERENCES email_messages (message_id),
  filename      TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER,
  r2_key        TEXT NOT NULL,
  disposition   TEXT NOT NULL DEFAULT 'attachment',
  content_id    TEXT,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_msg   ON email_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_key   ON email_attachments (r2_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- Templates. `variables` is a JSON array of {name,label,required}; an
-- undeclared {{x}} in a body is rejected when the template is SAVED rather than
-- when it is sent, so a typo is caught by the person editing it instead of
-- appearing as a blank in a client's inbox.
--
-- scope='system' rows back a code path, so they are editable but not deletable.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  template_id TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  scope       TEXT NOT NULL DEFAULT 'app',
  app_name    TEXT,
  name        TEXT NOT NULL,
  description TEXT,
  subject     TEXT NOT NULL,
  body_text   TEXT NOT NULL,
  body_html   TEXT,
  variables   TEXT NOT NULL DEFAULT '[]',
  is_active   INTEGER NOT NULL DEFAULT 1,
  updated_by  TEXT REFERENCES users_logins (id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_templates_scope ON email_templates (scope, app_name);

-- ─────────────────────────────────────────────────────────────────────────────
-- Notification preferences. Absence means enabled, so an empty table means
-- everyone gets everything and an opt-out is one row — which makes the first
-- person who finds task email noisy fixable without a migration.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_prefs (
  user_id    TEXT NOT NULL REFERENCES users_logins (id),
  event_key  TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, event_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Password recovery must not depend on the mail system it secures.
--
-- Once the apex MX moves to Cloudflare, a staff mailbox lives inside Pleiades —
-- so "I forgot my Pleiades password" would mean "I cannot log in to read the
-- email that lets me log in". Reset mail therefore goes to an address OUTSIDE
-- Pleiades, and this is where that address lives. src/routes/auth.ts refuses to
-- send a reset to anything on the company domain, and refuses to send one at
-- all when this is unset, rather than falling back to users_logins.email and
-- mailing the locked-out person their own unreachable inbox.
--
-- SQLite permits a REFERENCES-free ADD COLUMN with no default, so no table
-- rebuild and no defer_foreign_keys dance is needed here.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users_logins ADD COLUMN recovery_email TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seeds.
--
-- The system mailbox and the catch-all are seeded rather than created through
-- the UI because code depends on both existing: every transactional send reads
-- the first, and the inbound handler files unresolvable mail into the second.
-- Creating them by hand would make a fresh database subtly different from this
-- one, which is the class of drift test/schema-drift.test.ts exists to catch.
--
-- no-reply@ is kind='system': it never appears in a mailbox list, and mail
-- addressed TO it is discarded by the inbound handler. Once the catch-all is
-- live nothing bounces any more, so discarding is what "replies go nowhere" has
-- to mean in practice.
INSERT OR IGNORE INTO mailboxes
  (mailbox_id, address, display_name, kind, daily_send_cap, is_active, created_at, updated_at)
VALUES
  ('mbx_system',   'no-reply@godwinausten.org', 'Pleiades',  'system',   2000, 1, unixepoch(), unixepoch()),
  ('mbx_catchall', 'catchall@godwinausten.org', 'Catch-all', 'catchall',    0, 1, unixepoch(), unixepoch());

-- System templates. Seeded with both parts filled in, because an unset required
-- template is not a refusal the way an unset tax rate is — there is no safe way
-- to "refuse" to tell somebody their password reset is ready.
INSERT OR IGNORE INTO email_templates
  (template_id, key, scope, app_name, name, description, subject, body_text, variables, created_at, updated_at)
VALUES
  (
    'tpl_task_assigned', 'task_assigned', 'system', NULL,
    'Task assigned',
    'Sent to each assignee when a task is created or they are newly added to one. Mirrors the Slack post in src/routes/tasks.ts.',
    'New task: {{taskTitle}}',
    'Hi {{assigneeName}},' || char(10) || char(10)
      || 'You have been assigned a task in {{department}}:' || char(10) || char(10)
      || '  {{taskTitle}}' || char(10)
      || '  Due: {{dueDate}}' || char(10) || char(10)
      || 'Open it here: {{taskUrl}}' || char(10) || char(10)
      || '— Pleiades',
    '[{"name":"assigneeName","label":"Assignee name","required":true},'
      || '{"name":"taskTitle","label":"Task title","required":true},'
      || '{"name":"department","label":"Department","required":true},'
      || '{"name":"dueDate","label":"Due date","required":false},'
      || '{"name":"taskUrl","label":"Link to the task","required":true}]',
    unixepoch(), unixepoch()
  ),
  (
    'tpl_password_reset', 'password_reset', 'system', NULL,
    'Password reset link',
    'Sent to a user''s recovery_email once an HR Manager has approved their reset request. Carries a single-use link, never a password.',
    'Your Pleiades password reset is ready',
    'Hi {{userName}},' || char(10) || char(10)
      || 'Your password reset request has been approved. Choose a new password here:' || char(10) || char(10)
      || '  {{resetUrl}}' || char(10) || char(10)
      || 'This link can be used once and expires {{expiresAt}}. If you did not ask'  || char(10)
      || 'for this, tell your HR Manager — the link cannot be used to read anything' || char(10)
      || 'and your current password still works until you change it.' || char(10) || char(10)
      || '— Pleiades',
    '[{"name":"userName","label":"User name","required":true},'
      || '{"name":"resetUrl","label":"Single-use reset link","required":true},'
      || '{"name":"expiresAt","label":"Expiry","required":true}]',
    unixepoch(), unixepoch()
  ),
  (
    'tpl_reset_requested', 'reset_requested', 'system', NULL,
    'Password reset awaiting approval',
    'Sent to HR when somebody requests a password reset, because the request sits unapproved until a human acts on it and nothing told anyone it existed.',
    'Password reset awaiting approval: {{userName}}',
    '{{userName}} ({{userEmail}}) has requested a password reset.' || char(10) || char(10)
      || 'Approve or decline it on the Access page:' || char(10) || char(10)
      || '  {{approvalUrl}}' || char(10) || char(10)
      || 'Requested {{requestedAt}}. Nothing is sent to them until you approve.' || char(10) || char(10)
      || '— Pleiades',
    '[{"name":"userName","label":"User name","required":true},'
      || '{"name":"userEmail","label":"User email","required":true},'
      || '{"name":"approvalUrl","label":"Link to the approval queue","required":true},'
      || '{"name":"requestedAt","label":"Requested at","required":true}]',
    unixepoch(), unixepoch()
  );
