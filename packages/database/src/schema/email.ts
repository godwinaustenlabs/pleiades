import { sqliteTable, text, integer, real, primaryKey, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { usersLogins } from './auth';
import { appointments } from './hr';

/**
 * The mail system.
 *
 * Cloudflare Email Routing stores nothing and hosts no mailboxes — it forwards,
 * or hands the raw message to this Worker. Cloudflare Email Sending takes
 * outbound. So these tables, plus R2 for the raw MIME, ARE the mail store;
 * there is no provider holding a copy.
 *
 * See migration 0038_email.sql for why messages are one table while delivery
 * state is another, and why templates are edited in place when
 * compliance_config's rule is that a change is a new row.
 */

/**
 * A mailbox: a sending identity, and the thing mail is stored against.
 *
 * `kind` discriminates six shapes whose invariants are enforced in
 * src/routes/email.ts, since SQLite CHECK constraints cannot be added to a table
 * later without rebuilding it:
 *
 *   personal    — one staff member's own mail. `ownerUserId` set.
 *   appointment — a post's mail (cto@). `appointmentId` set; read by whoever
 *                 holds that appointment today.
 *   app         — a department's mail. `appName` set, gated by `<app>/email`.
 *   alias       — delivers into another mailbox. `forwardsToMailboxId` set.
 *   catchall    — anything unmatched. Apex-only in Cloudflare.
 *   system      — no-reply@. Never listed in a UI; inbound to it is discarded.
 *
 * There is no separate senders table: a mailbox IS a sending identity, and two
 * tables holding addresses would drift. The From line on an outbound message is
 * a row here the caller was authorised to send from, never a request field.
 */
export const mailboxes = sqliteTable('mailboxes', {
  id: text('mailbox_id').primaryKey(),
  address: text('address').notNull().unique(),
  displayName: text('display_name'),
  /** personal | appointment | app | alias | catchall | system */
  kind: text('kind').notNull(),
  ownerUserId: text('owner_user_id').references(() => usersLogins.id),
  /**
   * The post this address belongs to, for `kind = 'appointment'`.
   *
   * cto@ is neither one person's private mail nor a department's: granting
   * `tech/email` to reach it would hand it to everybody who works in Tech.
   * Attaching it to the appointment means the holder reads it in their own
   * workspace next to their personal mail, and a handover moves the mailbox with
   * the post — no grant edited, no second login, nothing to remember to revoke.
   *
   * A vacant appointment's mailbox reaches nobody but `admin/mailboxes`, and
   * keeps everything it received for whoever is appointed next.
   */
  appointmentId: text('appointment_id').references(() => appointments.id),
  appName: text('app_name'),
  forwardsToMailboxId: text('forwards_to_mailbox_id').references((): AnySQLiteColumn => mailboxes.id),
  /**
   * Counted from email_delivery per mailbox per UTC day. Exceeding it fails the
   * enqueue with a 400 — a send that is refused loudly is recoverable, one
   * dropped quietly is not.
   *
   * Not the only cap: Resend's free tier limits the whole ACCOUNT to 100 a day,
   * which no per-mailbox number can express, so `outbox.enqueue` checks
   * RESEND_DAILY_CAP across every mailbox as well.
   */
  dailySendCap: integer('daily_send_cap').notNull().default(200),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by').references(() => usersLogins.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Per-mailbox access, and deliberately an override rather than the mechanism.
 *
 * App mailboxes are normally reached through the `<app>/email` feature, so they
 * are managed on the Access page like every other grant. With no rows here for a
 * mailbox that is the whole story; with any row here, only these rows decide and
 * the app grant stops applying. That ordering is what lets `payroll@` be narrower
 * than `hr/email` without making the ordinary case need any rows at all.
 */
export const mailboxGrants = sqliteTable('mailbox_grants', {
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  userId: text('user_id').notNull().references(() => usersLogins.id),
  canRead: integer('can_read', { mode: 'boolean' }).notNull().default(true),
  canSend: integer('can_send', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by').references(() => usersLogins.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.mailboxId, t.userId] }),
}));

/**
 * A conversation. Stored rather than derived: the inbox list is "threads by last
 * activity", which is one indexed read here instead of a group-by over messages
 * on every page load.
 */
export const emailThreads = sqliteTable('email_threads', {
  id: text('thread_id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  subject: text('subject'),
  /** Set when the counterparty is a known lead, so a thread reads next to its deal. */
  contactId: text('contact_id'),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp' }).notNull(),
  messageCount: integer('message_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Every message, both directions, every folder.
 *
 * `bodyText` is NOT NULL on purpose: a missing text/plain part raises spam
 * scores outbound, and inbound it is the only thing rendered — HTML written by a
 * stranger is never put into the DOM, only offered as a raw download.
 */
export const emailMessages = sqliteTable('email_messages', {
  id: text('message_id').primaryKey(),
  mailboxId: text('mailbox_id').notNull().references(() => mailboxes.id),
  threadId: text('thread_id').references(() => emailThreads.id),
  /** inbound | outbound */
  direction: text('direction').notNull(),
  /** inbox | sent | drafts | archive | spam | trash */
  folder: text('folder').notNull(),
  fromAddress: text('from_address').notNull(),
  fromName: text('from_name'),
  /** JSON arrays of addresses. */
  toAddresses: text('to_addresses').notNull(),
  ccAddresses: text('cc_addresses'),
  bccAddresses: text('bcc_addresses'),
  subject: text('subject'),
  bodyText: text('body_text').notNull(),
  bodyHtml: text('body_html'),
  /** RFC 5322 headers, kept so a reply can be threaded back to what it answers. */
  messageIdHeader: text('message_id_header'),
  inReplyToHeader: text('in_reply_to_header'),
  referencesHeader: text('references_header'),
  /** R2 key under `email-raw/`. Written by the Worker, never through /api/assets/upload. */
  rawKey: text('raw_key'),
  rawSize: integer('raw_size'),
  spfResult: text('spf_result'),
  dkimResult: text('dkim_result'),
  dmarcResult: text('dmarc_result'),
  spamScore: real('spam_score'),
  /** ham | spam | unknown */
  spamVerdict: text('spam_verdict'),
  /**
   * Which automation produced this, from EMAIL_EVENTS — null for anything a person
   * typed. That distinction is the whole automations view: it is how you ask what
   * no-reply@ has actually been sending, rather than trusting the catalogue.
   */
  eventKey: text('event_key'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  isStarred: integer('is_starred', { mode: 'boolean' }).notNull().default(false),
  receivedAt: integer('received_at', { mode: 'timestamp' }),
  createdBy: text('created_by').references(() => usersLogins.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Send state, for outbound only — which is why it is its own table. A row exists
 * only for a message actually being sent, so nothing here is ever null because
 * it does not apply, and `email_messages` keeps no dead columns.
 *
 * `idempotencyKey` is UNIQUE in the database rather than checked in code,
 * because that is the only version of the guarantee that survives a retried cron
 * running concurrently with a waitUntil. A transactional send keys on
 * `<event>:<entity>:<recipient>`, so an assignment can produce exactly one email
 * however many times PATCH /tasks/:id rewrites its assignment rows.
 */
export const emailDelivery = sqliteTable('email_delivery', {
  messageId: text('message_id').primaryKey().references(() => emailMessages.id),
  /**
   * queued | sending | sent | failed | suppressed | cancelled
   *
   * `suppressed` is not `failed`: Cloudflare's bounce/complaint list is not our
   * error and retrying against it is how a domain's reputation gets worse.
   */
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp' }),
  scheduledFor: integer('scheduled_for', { mode: 'timestamp' }),
  /** The id Cloudflare returns. An inbound reply's References is matched against it. */
  providerMessageId: text('provider_message_id'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  /**
   * What carried it — `resend`, or `console` when no API key was configured.
   *
   * Kept even though there is only one provider, because it is set ONLY on success
   * and is therefore what the daily cap counts. A cap counting all delivery rows
   * would charge quota for messages that never reached Resend at all.
   */
  transport: text('transport'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  queuedAt: integer('queued_at', { mode: 'timestamp' }).notNull(),
  /** When we handed the message to Resend — NOT when it arrived. */
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  /**
   * When the receiving server accepted it, from Resend's `email.delivered` webhook.
   *
   * Distinct from `sentAt` deliberately: that one says the API took the message, which
   * is what "Sent" used to mean in the UI and is not the same claim. A row with
   * `sentAt` and no `deliveredAt` after a few minutes is the interesting case.
   */
  deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
  /**
   * The timestamp of the last webhook event applied to this row.
   *
   * Webhooks arrive out of order and are redelivered on any non-2xx, so this plus the
   * status ranking in `src/email/webhook.ts` is what stops a replayed `delivered`
   * overwriting a `bounced`.
   */
  lastEventAt: integer('last_event_at', { mode: 'timestamp' }),
});

/**
 * Attachments. A table rather than a JSON column, because each one is listed,
 * downloaded on its own URL, and permission-checked individually.
 */
export const emailAttachments = sqliteTable('email_attachments', {
  id: text('attachment_id').primaryKey(),
  messageId: text('message_id').notNull().references(() => emailMessages.id),
  filename: text('filename').notNull(),
  contentType: text('content_type'),
  sizeBytes: integer('size_bytes'),
  /** R2 key under `email-att/`. */
  r2Key: text('r2_key').notNull(),
  /** attachment | inline */
  disposition: text('disposition').notNull().default('attachment'),
  contentId: text('content_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Templates, edited in place.
 *
 * That differs from `compliance_config`, where a change is a new row, and the
 * difference is deliberate: a rate must not be rewritten because past payroll
 * was computed with the old one, whereas a rendered subject and body are
 * snapshotted onto the message at send time, so an email's history is already
 * immutable and versioning the template would protect nothing.
 *
 * `variables` is a JSON array of {name,label,required}. An undeclared {{x}} is
 * rejected when the template is saved, not when it is sent — a typo should be
 * caught by the person editing it, not discovered as a blank in a client's inbox.
 */
export const emailTemplates = sqliteTable('email_templates', {
  id: text('template_id').primaryKey(),
  key: text('key').notNull().unique(),
  /** system | app — `system` rows back a code path and cannot be deleted. */
  scope: text('scope').notNull().default('app'),
  appName: text('app_name'),
  name: text('name').notNull(),
  description: text('description'),
  subject: text('subject').notNull(),
  bodyText: text('body_text').notNull(),
  bodyHtml: text('body_html'),
  variables: text('variables').notNull().default('[]'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  updatedBy: text('updated_by').references(() => usersLogins.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Per-event opt-outs. Absence means enabled, so an empty table means everyone
 * gets everything and switching one notification off is a single row — which is
 * what makes the first complaint fixable without a migration.
 */
export const emailPrefs = sqliteTable('email_prefs', {
  userId: text('user_id').notNull().references(() => usersLogins.id),
  eventKey: text('event_key').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.eventKey] }),
}));
