import { and, asc, eq, gte, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { generateId } from '../utils/id';
import { Addr, RESEND_DAILY_CAP, sendMail, TransportChoice } from './transport';
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
  scheduledFor?: Date;
  /** null for a system/cron send — there is genuinely no actor. */
  actorUserId?: string | null;
  /**
   * Overrides `mailboxes.transport` for this one message.
   *
   * Used only by `dispatch`, so that whether a third party may carry a message is a
   * property of the EVENT rather than of the mailbox: a reset link is pinned to the
   * Cloudflare path and allowed to fail, while an ordinary notification from the
   * same mailbox falls back to Resend so that it arrives.
   */
  transport?: TransportChoice;
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

  // Two caps, counted rather than tracked so neither can drift from reality, and
  // both refused loudly — a send dropped silently is the one nobody discovers
  // until a client asks why they never heard back.
  const dayStart = startOfUtcDay();

  // Per mailbox, so one department cannot spend the whole day's allowance before
  // anybody else is awake.
  if (box.dailySendCap > 0) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emailMessages)
      .where(and(
        eq(schema.emailMessages.mailboxId, box.id),
        eq(schema.emailMessages.direction, 'outbound'),
        gte(schema.emailMessages.createdAt, dayStart),
      ));
    if (Number(count) >= box.dailySendCap) {
      return { error: `${box.address} has reached its daily limit of ${box.dailySendCap} messages. It resets at 00:00 UTC.` };
    }
  }

  /**
   * Per account, for Resend only.
   *
   * Resend's free tier allows 100 messages a day across the whole account, not per
   * sender, so no per-mailbox number can enforce it: three mailboxes at forty each
   * sail past a hundred and start failing mid-afternoon, and the failures look
   * like a broken integration rather than a quota. Counted across every mailbox
   * that sends through Resend.
   *
   * The Cloudflare path is deliberately exempt — sends to verified destination
   * addresses count against no quota at all, which is the whole reason
   * transactional mail goes that way.
   */
  /**
   * Checked here only when Resend is certain.
   *
   * Under `auto` the message may well go out free on the Cloudflare path, so
   * refusing it up front would reject sends that were never going to cost anything
   * — which is what happened the moment `mbx_system` became `auto`. The cap for an
   * `auto` message is enforced at the point it actually matters, in `drainOne`,
   * immediately before the fallback.
   */
  const certainlyResend = (req.transport ?? box.transport) === 'resend';
  if (certainlyResend) {
    // Counted from what actually went through Resend, not from how mailboxes are
    // configured. Under `auto` those differ by definition, and the configured
    // number would over-count every internal message the free path carried.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emailDelivery)
      .where(and(
        eq(schema.emailDelivery.transport, 'resend'),
        gte(schema.emailDelivery.queuedAt, dayStart),
      ));
    if (Number(count) >= RESEND_DAILY_CAP) {
      return {
        error: `The account has reached its daily limit of ${RESEND_DAILY_CAP} messages to outside addresses (Resend's free tier allows 100 a day across all mailboxes). It resets at 00:00 UTC.`,
      };
    }
  }

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
      transportOverride: req.transport ?? null,
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
export async function drainOne(env: Env, messageId: string): Promise<'sent' | 'failed' | 'suppressed' | 'skipped'> {
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

  const box = await loadMailbox(env, row.mailboxId);
  const from: Addr = { email: row.fromAddress, ...(row.fromName ? { name: row.fromName } : {}) };

  // The mailbox decides the service, and `auto` means "decide per message" — see
  // sendMail. A mailbox deleted between the enqueue and the send gets `auto`,
  // which can still reach anybody; guessing `cloudflare` would be the one that
  // silently cannot.
  let via = (delivery.transportOverride as TransportChoice | null)
    ?? (box?.transport as TransportChoice | undefined)
    ?? 'auto';

  /**
   * With the day's Resend allowance gone, `auto` becomes Cloudflare-only.
   *
   * This is where the account cap belongs for an `auto` message: at the enqueue we
   * did not yet know whether Resend would be involved, and refusing there rejected
   * sends that the free path would have carried for nothing. Here we are about to
   * find out, so the check is exact.
   *
   * Degrading rather than refusing outright is deliberate: the message may still go
   * out free to a verified destination. If it cannot, it fails with Cloudflare's own
   * reason recorded on the row, which is more use than "quota exhausted" on a
   * message that never needed the quota.
   */
  if (via === 'auto') {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.emailDelivery)
      .where(and(
        eq(schema.emailDelivery.transport, 'resend'),
        gte(schema.emailDelivery.queuedAt, startOfUtcDay()),
      ));
    if (Number(count) >= RESEND_DAILY_CAP) {
      console.warn(
        `[email] ${messageId}: the day's Resend allowance (${RESEND_DAILY_CAP}) is spent, so this will only go out if ` +
        'the recipient is a verified destination on the free path.',
      );
      via = 'cloudflare';
    }
  }

  const outcome = await sendMail(env, {
    from,
    to: JSON.parse(row.toAddresses) as Addr[],
    ...(row.ccAddresses ? { cc: JSON.parse(row.ccAddresses) as Addr[] } : {}),
    ...(row.bccAddresses ? { bcc: JSON.parse(row.bccAddresses) as Addr[] } : {}),
    subject: row.subject ?? '',
    text: row.bodyText,
    ...(row.bodyHtml ? { html: row.bodyHtml } : {}),
  }, via);

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
  const terminal = outcome.suppressed || !outcome.retryable || attempts >= MAX_ATTEMPTS;

  await db.update(schema.emailDelivery)
    .set({
      status: outcome.suppressed ? 'suppressed' : 'failed',
      attempts,
      // Null on a terminal failure is load-bearing: it is what excludes the row
      // from the sweep above. Do not "tidy" it to a date.
      nextAttemptAt: terminal ? null : backoffFrom(attempts),
      errorCode: outcome.code,
      errorMessage: outcome.message,
    })
    .where(eq(schema.emailDelivery.messageId, messageId));

  console.error(
    `[email] ${messageId} ${outcome.suppressed ? 'suppressed' : 'failed'} (${outcome.code}) attempt ${attempts}` +
    `${terminal ? ', giving up' : `, retrying after ${backoffFrom(attempts).toISOString()}`}: ${outcome.message}` +
    `${box ? ` from=${box.address}` : ''}`,
  );

  return outcome.suppressed ? 'suppressed' : 'failed';
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
