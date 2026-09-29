import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { generateId } from '../utils/id';
import { Addr, RESEND_DAILY_CAP, sendMail } from './transport';
import { loadMailbox } from './mailboxes';

/**
 * The outbox.
 *
 * A message is a row before it is an attempt. That ordering is the whole design:
 * a send that happened with no row is unauditable, and a row with no send gets
 * picked up by the sweep — so the failure modes are "sent twice" and "sent late",
 * and only one of those is prevented by a database constraint. Hence
 * `email_delivery.idempotency_key` being UNIQUE in the DDL rather than checked
 * here: a `waitUntil` racing a cron tick is exactly the case that a code-level
 * check loses.
 *
 * The normal path is immediate — `enqueue` then `ctx.waitUntil(drainOne(...))`.
 * Cron is only the reaper. This is deliberately not Cloudflare Queues: the
 * outbox row has to exist regardless for the sent-mail UI, and once it exists,
 * `attempts` and `next_attempt_at` are two columns rather than a new binding,
 * a second delivery semantics, and a dead-letter queue to reason about.
 */

export type EnqueueRequest = {
  /**
   * The mailbox this is sent AS.
   *
   * **Authorization is the caller's job and happens before this call** — the
   * route does `canUseMailbox(c, mailboxId, 'send')`, and a transactional send
   * from `no-reply@` legitimately has no actor to authorize. Passing an id here
   * is therefore a statement that the check already happened, which is why the
   * From address can never come from a request body: the route names the mailbox,
   * having proved the caller may use it.
   */
  mailboxId: string;
  to: Addr[];
  cc?: Addr[];
  bcc?: Addr[];
  replyTo?: Addr;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
  /**
   * What makes this send unique. Transactional sends key on
   * `<event>:<entity>:<recipient>` so the same event can never mail the same
   * person twice, however many times its handler runs.
   */
  idempotencyKey: string;
  /** Set for automated sends, so the sent log can say what caused this. */
  eventKey?: string;
  threadId?: string;
  /**
   * RFC 5322 threading, set when this is a reply.
   *
   * Both directions depend on these. Outbound, they are what makes the recipient's
   * client show the reply under the original instead of as a new conversation.
   * Inbound, `inbound.ts` matches a stranger's reply by looking for OUR
   * `provider_message_id` in their References — so a reply we send without these
   * breaks the thread at both ends.
   */
  inReplyTo?: string;
  references?: string;
  scheduledFor?: Date;
  /** null for a system/cron send — there is genuinely no actor. */
  actorUserId?: string | null;
};

export type EnqueueResult =
  | { messageId: string; deduped: boolean }
  /** Same discriminated shape as `src/statements/file.ts` — callers use `'error' in result`. */
  | { error: string };

/** Backoff: 1m, 4m, 16m, 1h, 4h. Quadrupling rather than doubling, because a
 *  provider that just rate-limited us is not helped by trying again in 2 minutes. */
const BACKOFF_BASE_SECONDS = 60;
const MAX_ATTEMPTS = 5;

/**
 * How long a claim is good for.
 *
 * `status = 'sending'` used to be a one-way door: a Worker evicted between the
 * claim and the result left the row there permanently, invisible to the sweep,
 * and the message was never sent and never reported. So a claim is a *lease* —
 * `next_attempt_at` carries its expiry, and the sweep reclaims anything past it.
 * Ten minutes is far longer than a send takes and short enough that a genuinely
 * lost message goes out on the next tick or two.
 */
const CLAIM_LEASE_SECONDS = 10 * 60;

function backoffFrom(attempts: number): Date {
  return new Date(Date.now() + BACKOFF_BASE_SECONDS * Math.pow(4, attempts) * 1000);
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Both caps, in one place because two callers need them — `enqueue` for a fresh send
 * and `promoteDraft` for one that has been sitting. Returns the message to refuse
 * with, or null.
 *
 * Counted from the rows rather than tracked in a counter, so neither can drift from
 * what actually happened, and refused loudly: a send dropped quietly is the one nobody
 * discovers until a client asks why they never heard back.
 */
async function overCap(env: Env, box: { id: string; address: string; dailySendCap: number }): Promise<string | null> {
  const db = getDb(env);
  const dayStart = startOfUtcDay();

  // Per mailbox, so one department cannot spend the whole day before anybody else is
  // awake.
  if (box.dailySendCap > 0) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emailMessages)
      .where(and(
        eq(schema.emailMessages.mailboxId, box.id),
        eq(schema.emailMessages.direction, 'outbound'),
        /**
         * A draft is an outbound row with no delivery row, so without this it would
         * count against a quota it has not spent — leaving a half-written message open
         * all afternoon would slowly close the mailbox.
         */
        ne(schema.emailMessages.folder, 'drafts'),
        gte(schema.emailMessages.createdAt, dayStart),
      ));
    if (Number(count) >= box.dailySendCap) {
      return `${box.address} has reached its daily limit of ${box.dailySendCap} messages. It resets at 00:00 UTC.`;
    }
  }

  /**
   * Per account, for Resend. Its free tier allows 100 a day across the whole account,
   * not per sender, so no per-mailbox number can enforce it. Counted from
   * `email_delivery.transport`, which is set only on success — a count of all delivery
   * rows would charge quota for messages that never reached Resend.
   */
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.emailDelivery)
    .where(and(
      eq(schema.emailDelivery.transport, 'resend'),
      gte(schema.emailDelivery.queuedAt, dayStart),
    ));
  if (Number(count) >= RESEND_DAILY_CAP) {
    return `The account has reached its daily limit of ${RESEND_DAILY_CAP} messages to outside addresses (Resend's free tier allows 100 a day across all mailboxes). It resets at 00:00 UTC.`;
  }

  return null;
}

/**
 * Writes a message and its delivery row. Does not send.
 *
 * Returning the existing id on a duplicate key is not an error path — it is the
 * feature. A double-clicked Send and a retried transactional hook both land here
 * with the same key, and both should end up with one message and a 200.
 */
export async function enqueue(env: Env, req: EnqueueRequest): Promise<EnqueueResult> {
  const db = getDb(env);

  const box = await loadMailbox(env, req.mailboxId);
  if (!box) return { error: 'That mailbox does not exist.' };
  if (!box.isActive) return { error: `${box.address} is deactivated and cannot send.` };

  const existing = await db.query.emailDelivery.findFirst({
    where: eq(schema.emailDelivery.idempotencyKey, req.idempotencyKey),
  });
  if (existing) return { messageId: existing.messageId, deduped: true };

  const capped = await overCap(env, box);
  if (capped) return { error: capped };

  const messageId = generateId('eml');
  const now = new Date();

  await db.insert(schema.emailMessages).values({
    id: messageId,
    mailboxId: box.id,
    threadId: req.threadId ?? null,
    direction: 'outbound',
    folder: 'sent',
    fromAddress: box.address,
    fromName: box.displayName ?? null,
    toAddresses: JSON.stringify(req.to),
    ccAddresses: req.cc?.length ? JSON.stringify(req.cc) : null,
    // Bcc is stored because the sent log has to be able to answer "who did this
    // actually go to" months later. It is never rendered in a thread view.
    bccAddresses: req.bcc?.length ? JSON.stringify(req.bcc) : null,
    subject: req.subject,
    bodyText: req.text,
    bodyHtml: req.html ?? null,
    // Was accepted by EnqueueRequest and written nowhere. See migration 0043.
    eventKey: req.eventKey ?? null,
    inReplyToHeader: req.inReplyTo ?? null,
    referencesHeader: req.references ?? null,
    isRead: true,
    createdBy: req.actorUserId ?? null,
    createdAt: now,
  });

  try {
    await db.insert(schema.emailDelivery).values({
      messageId,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: null,
      scheduledFor: req.scheduledFor ?? null,
      idempotencyKey: req.idempotencyKey,
      queuedAt: now,
    });
  } catch (err) {
    /**
     * Almost always a lost race on the unique key: the other request's message is
     * the real one, so drop ours and return theirs.
     *
     * But not always, and this catch used to assume it was — which hid a missing
     * column behind "Could not queue that message" and turned every send into a
     * 400 with no hint why. If there is no winner, the insert failed for some other
     * reason and that reason is worth seeing.
     */
    await db.delete(schema.emailMessages).where(eq(schema.emailMessages.id, messageId));
    const winner = await db.query.emailDelivery.findFirst({
      where: eq(schema.emailDelivery.idempotencyKey, req.idempotencyKey),
    });
    if (winner) return { messageId: winner.messageId, deduped: true };

    console.error('[email] enqueue failed and it was not a duplicate key:', err);
    return { error: `Could not queue that message: ${err instanceof Error ? err.message : String(err)}` };
  }

  return { messageId, deduped: false };
}

/**
 * Attempts one queued message.
 *
 * Claims the row first with a conditional UPDATE and proceeds only if it changed
 * something. That is what stops a `waitUntil` and a cron tick five minutes later
 * from both sending the same message — the unique key prevents two *rows*, this
 * prevents two *attempts* on one row.
 */
export async function drainOne(env: Env, messageId: string): Promise<'sent' | 'failed' | 'skipped'> {
  const db = getDb(env);

  const now = Date.now();
  const lease = new Date(now + CLAIM_LEASE_SECONDS * 1000);

  /**
   * Claim the row, and only proceed if this call is what changed it.
   *
   * Three states are claimable: `queued`, a `failed` row whose backoff has
   * elapsed, and a `sending` row whose lease has expired — that last one is the
   * evicted-mid-send case. Moving the lease forward in the same statement is what
   * keeps this mutually exclusive: D1 serialises writes, so of two racing
   * drains the second no longer matches `next_attempt_at <= ?` and gets nothing.
   */
  const claim = await env.DB
    .prepare(
      `UPDATE email_delivery SET status = 'sending', next_attempt_at = ?
        WHERE message_id = ?
          AND ( status IN ('queued', 'failed')
                OR (status = 'sending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) )`,
    )
    .bind(Math.floor(lease.getTime() / 1000), messageId, Math.floor(now / 1000))
    .run();

  if (!claim.meta?.changes) return 'skipped';

  const row = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, messageId) });
  const delivery = await db.query.emailDelivery.findFirst({ where: eq(schema.emailDelivery.messageId, messageId) });
  if (!row || !delivery) return 'skipped';

  /**
   * A scheduled message is claimable but not yet sendable.
   *
   * `sweep` filters on `scheduled_for`, but `drainOne` is also called directly — by the
   * send route's waitUntil — and without this guard scheduling a message for next
   * Tuesday would send it immediately. The claim is released rather than left in
   * `sending`, so the sweep picks it up at the right time instead of waiting out a
   * ten-minute lease first.
   */
  if (delivery.scheduledFor && delivery.scheduledFor.getTime() > Date.now()) {
    await db.update(schema.emailDelivery)
      .set({ status: 'queued', nextAttemptAt: null })
      .where(eq(schema.emailDelivery.messageId, messageId));
    return 'skipped';
  }

  const box = await loadMailbox(env, row.mailboxId);
  const from: Addr = { email: row.fromAddress, ...(row.fromName ? { name: row.fromName } : {}) };

  const outcome = await sendMail(env, {
    from,
    to: JSON.parse(row.toAddresses) as Addr[],
    ...(row.ccAddresses ? { cc: JSON.parse(row.ccAddresses) as Addr[] } : {}),
    ...(row.bccAddresses ? { bcc: JSON.parse(row.bccAddresses) as Addr[] } : {}),
    subject: row.subject ?? '',
    text: row.bodyText,
    ...(row.bodyHtml ? { html: row.bodyHtml } : {}),
    /**
     * The threading headers, which were stored on the row and never sent — so a
     * reply arrived at the recipient as a new conversation, and their answer came
     * back unmatchable because it quoted nothing of ours.
     */
    ...(row.inReplyToHeader || row.referencesHeader
      ? {
        headers: {
          ...(row.inReplyToHeader ? { 'In-Reply-To': row.inReplyToHeader } : {}),
          ...(row.referencesHeader ? { References: row.referencesHeader } : {}),
        },
      }
      : {}),
  });

  if (outcome.ok) {
    await db.update(schema.emailDelivery)
      .set({
        status: 'sent',
        providerMessageId: outcome.messageId,
        // What actually carried it. Under `auto` this is the only record of
        // whether the free path worked or the fallback was needed.
        transport: outcome.transport,
        sentAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(schema.emailDelivery.messageId, messageId));
    // The provider's id is also the thread key: a reply quotes it in References,
    // which is how `inbound.ts` finds what a stranger is answering.
    await db.update(schema.emailMessages)
      .set({ messageIdHeader: outcome.messageId })
      .where(eq(schema.emailMessages.id, messageId));
    return 'sent';
  }

  const attempts = delivery.attempts + 1;
  const terminal = !outcome.retryable || attempts >= MAX_ATTEMPTS;

  await db.update(schema.emailDelivery)
    .set({
      status: 'failed',
      attempts,
      // Null on a terminal failure is load-bearing: it is what excludes the row
      // from the sweep above. Do not "tidy" it to a date.
      nextAttemptAt: terminal ? null : backoffFrom(attempts),
      errorCode: outcome.code,
      errorMessage: outcome.message,
    })
    .where(eq(schema.emailDelivery.messageId, messageId));

  console.error(
    `[email] ${messageId} failed (${outcome.code}) attempt ${attempts}` +
    `${terminal ? ', giving up' : `, retrying after ${backoffFrom(attempts).toISOString()}`}: ${outcome.message}` +
    `${box ? ` from=${box.address}` : ''}`,
  );

  return 'failed';
}

/**
 * The reaper, called from the five-minute cron.
 *
 * Takes retryable failures whose backoff has elapsed, anything still queued that
 * the immediate path missed (a Worker evicted mid-`waitUntil`, say), and
 * scheduled sends that have come due. Bounded per tick so one bad batch cannot
 * consume the whole invocation.
 */
export async function sweep(env: Env, limit = 50): Promise<{ attempted: number; sent: number; failed: number }> {
  const db = getDb(env);
  const now = new Date();

  /**
   * Three eligibility cases, spelled out separately rather than as one loose OR.
   *
   * They were one clause, and it was wrong: a terminal failure has
   * `next_attempt_at = NULL`, which `isNull(...)` read as "due now", so a message
   * that could never succeed — an unverified sender, a body over the size limit —
   * was retried on every tick until it burned all five attempts. On a `failed`
   * row a null next attempt means *given up*, and that is now what it means here.
   */
  const due = await db
    .select({ messageId: schema.emailDelivery.messageId })
    .from(schema.emailDelivery)
    .where(and(
      or(isNull(schema.emailDelivery.scheduledFor), lte(schema.emailDelivery.scheduledFor, now)),
      or(
        // Never attempted. The immediate waitUntil missed it, or it was scheduled.
        eq(schema.emailDelivery.status, 'queued'),
        // Failed, retryable, and the backoff has elapsed.
        and(
          eq(schema.emailDelivery.status, 'failed'),
          lt(schema.emailDelivery.attempts, MAX_ATTEMPTS),
          isNotNull(schema.emailDelivery.nextAttemptAt),
          lte(schema.emailDelivery.nextAttemptAt, now),
        ),
        // Claimed but never finished — the Worker died mid-send.
        //
        // A null lease counts as expired here, and deliberately so: every live
        // claim sets one, so a `sending` row without a lease cannot be in
        // progress. Requiring a non-null value would leave exactly the rows this
        // fix exists for — ones written before the lease existed, or touched by
        // hand — stuck forever, which is the same trap one layer down.
        and(
          eq(schema.emailDelivery.status, 'sending'),
          lt(schema.emailDelivery.attempts, MAX_ATTEMPTS),
          or(isNull(schema.emailDelivery.nextAttemptAt), lte(schema.emailDelivery.nextAttemptAt, now)),
        ),
      ),
    ))
    .orderBy(asc(schema.emailDelivery.queuedAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const { messageId } of due) {
    // One failure must not abandon the rest of the batch.
    try {
      const result = await drainOne(env, messageId);
      if (result === 'sent') sent += 1;
      else if (result !== 'skipped') failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[email] sweep threw on ${messageId}:`, err);
    }
  }

  return { attempted: due.length, sent, failed };
}

/**
 * Turns a draft into a send.
 *
 * A draft already has its `email_messages` row; what it lacks is the `email_delivery`
 * row, which is what the sweep looks at and therefore what makes a message a send. So
 * this is the second half of `enqueue` and nothing else — deliberately not a new
 * enqueue, because duplicating the insert would mean two places that decide what an
 * outbound row looks like.
 *
 * The caps are checked HERE rather than when the draft was saved: a draft may sit for a
 * week, and whether there is quota left is a question about now.
 */
export async function promoteDraft(
  env: Env,
  draft: { id: string; mailboxId: string; subject: string | null },
  attachmentCount = 0,
  scheduledFor?: Date,
): Promise<EnqueueResult> {
  const db = getDb(env);

  const box = await loadMailbox(env, draft.mailboxId);
  if (!box) return { error: 'That mailbox no longer exists.' };
  if (!box.isActive) return { error: `${box.address} is deactivated and cannot send.` };

  const existing = await db.query.emailDelivery.findFirst({
    where: eq(schema.emailDelivery.messageId, draft.id),
  });
  if (existing) return { messageId: draft.id, deduped: true };

  const capped = await overCap(env, box);
  if (capped) return { error: capped };

  const now = new Date();
  await db.insert(schema.emailDelivery).values({
    messageId: draft.id,
    status: 'queued',
    attempts: 0,
    nextAttemptAt: null,
    scheduledFor: scheduledFor ?? null,
    // Keyed on the draft, so a double-clicked Send finds this row rather than making
    // a second one.
    idempotencyKey: `manual:${box.id}:draft:${draft.id}`,
    queuedAt: now,
  });

  // It stops being a draft at the moment it acquires a delivery row, and the two must
  // not disagree — a row in `drafts` with a delivery row would be editable and in
  // flight at the same time.
  await db.update(schema.emailMessages)
    .set({ folder: 'sent', createdAt: now })
    .where(eq(schema.emailMessages.id, draft.id));

  if (attachmentCount > 0) {
    console.log(`[email] ${draft.id} sending with ${attachmentCount} attachment(s)`);
  }

  return { messageId: draft.id, deduped: false };
}

/**
 * Retention. Called from the daily cron, not the five-minute one.
 *
 * Without this, trash and spam grow forever — and so does R2, which is billed by the
 * byte and holds the raw MIME of every message ever received. Deliberately conservative:
 * thirty days is long enough that nobody loses something they meant to recover, and the
 * only things touched are folders whose whole purpose is "not wanted".
 *
 * Deletes the R2 objects as well as the rows. A row without its object is a broken
 * download; an object without its row is unreachable, permanent and still billed.
 */
export async function prune(env: Env, days = 30): Promise<{ messages: number; objects: number; drafts: number }> {
  const db = getDb(env);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let objects = 0;

  const doomed = await db
    .select({ id: schema.emailMessages.id, rawKey: schema.emailMessages.rawKey })
    .from(schema.emailMessages)
    .where(and(
      inArray(schema.emailMessages.folder, ['trash', 'spam']),
      lt(schema.emailMessages.createdAt, cutoff),
    ))
    .limit(200);

  for (const m of doomed) {
    const atts = await db.query.emailAttachments.findMany({
      where: eq(schema.emailAttachments.messageId, m.id),
    });
    for (const a of atts) {
      if (env.CRM_BUCKET) { try { await env.CRM_BUCKET.delete(a.r2Key); objects += 1; } catch { /* already gone */ } }
    }
    if (m.rawKey && env.CRM_BUCKET) {
      try { await env.CRM_BUCKET.delete(m.rawKey); objects += 1; } catch { /* already gone */ }
    }
    await db.delete(schema.emailAttachments).where(eq(schema.emailAttachments.messageId, m.id));
    // The delivery row first: it references the message.
    await db.delete(schema.emailDelivery).where(eq(schema.emailDelivery.messageId, m.id));
    await db.delete(schema.emailMessages).where(eq(schema.emailMessages.id, m.id));
  }

  /**
   * Abandoned drafts, at a shorter horizon. A draft nobody touched for a week is
   * forgotten rather than pending, and each one may be holding attachments in R2.
   */
  const staleDrafts = await db
    .select({ id: schema.emailMessages.id })
    .from(schema.emailMessages)
    .where(and(
      eq(schema.emailMessages.folder, 'drafts'),
      lt(schema.emailMessages.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
    ))
    .limit(100);

  for (const d of staleDrafts) {
    const atts = await db.query.emailAttachments.findMany({
      where: eq(schema.emailAttachments.messageId, d.id),
    });
    for (const a of atts) {
      if (env.CRM_BUCKET) { try { await env.CRM_BUCKET.delete(a.r2Key); objects += 1; } catch { /* already gone */ } }
    }
    await db.delete(schema.emailAttachments).where(eq(schema.emailAttachments.messageId, d.id));
    await db.delete(schema.emailMessages).where(eq(schema.emailMessages.id, d.id));
  }

  return { messages: doomed.length, objects, drafts: staleDrafts.length };
}
