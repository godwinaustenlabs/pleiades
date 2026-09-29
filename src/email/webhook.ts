import { eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';

/**
 * Resend's delivery webhook.
 *
 * ## Why this exists
 *
 * `status='sent'` only ever meant "Resend's API accepted the message". Whether it
 * *arrived* is decided afterwards by the receiving server, reported only here, and was
 * therefore invisible: a hard bounce read as "Sent" in the mailbox forever and the only
 * record lived in Resend's dashboard. This endpoint is the difference between believing
 * a proposal landed and knowing it did.
 *
 * ## Why this is the most exposed route in the system
 *
 * It is the only unauthenticated POST that writes to the database. There is no session,
 * no grant and no user — the caller is a stranger until the signature says otherwise —
 * so the signature check *is* the authorization, and everything below fails closed:
 *
 * - **An unset secret refuses every request.** Accepting unsigned webhooks would let
 *   anyone mark a bounced message as delivered, or a delivered one as bounced, which is
 *   worse than having no webhook at all. Degrading to "trust anybody" is never the
 *   graceful option for an authorization check.
 * - **The signature is verified over the raw bytes**, before any parse. Parsing and
 *   re-serialising produces different bytes and every signature fails.
 * - **Timestamps outside a five-minute window are refused**, so a captured request
 *   cannot be replayed later.
 * - **Comparison is constant-time**, and every candidate signature is compared before
 *   returning, so the answer does not leak through timing.
 *
 * ## Read receipts are deliberately dropped
 *
 * Resend also emits `email.opened` and `email.clicked`. Those are read receipts, they
 * were excluded from this system on purpose, and they are discarded here rather than
 * stored and hidden — the surest way for a feature not to leak is for the data never to
 * exist. It is also the same mechanism this mail client refuses to honour on the way in,
 * where remote images are blocked precisely so a sender learns nothing.
 *
 * @see https://resend.com/docs/dashboard/webhooks/introduction
 */

/** Svix rejects anything older than this, and so do we. */
const MAX_EVENT_AGE_SECONDS = 60 * 5;

/**
 * How far along delivery a state is, used to refuse going backwards.
 *
 * Webhooks are redelivered on any non-2xx and are not ordered, so `delivered` landing
 * after `bounced` is ordinary rather than exceptional. Ranking the states and only ever
 * moving up means a replay is a no-op, and it needs no distributed lock: the worst
 * outcome for a message is the one that sticks, which is also the one worth showing.
 *
 * `complained` outranks `bounced` because a spam complaint is a stronger statement about
 * the address than a delivery failure — and the one that must never be quietly cleared,
 * since continuing to mail it is how a sending domain's reputation is destroyed.
 */
const RANK: Record<string, number> = {
  queued: 0,
  sending: 1,
  delayed: 2,
  sent: 3,
  delivered: 4,
  failed: 5,
  suppressed: 6,
  bounced: 6,
  complained: 7,
  cancelled: 8,
};

/** Resend event name → the status it sets. Anything absent is ignored on purpose. */
const EVENT_STATUS: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  // 'email.opened' and 'email.clicked' are READ RECEIPTS and are intentionally absent.
  // Do not add them; see the module header.
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Constant-time compare over two strings. Length inequality is not itself secret. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult =
  | { ok: true }
  /** `reason` is for our logs only and must never reach the response body. */
  | { ok: false; reason: string };

/**
 * Verifies a Svix signature, which is what Resend signs webhooks with.
 *
 * The signed content is `<id>.<timestamp>.<body>` and the secret is the base64 payload
 * after the `whsec_` prefix — decoded to raw key bytes, not used as an ASCII string.
 * Getting that wrong produces a verifier that rejects every genuine request, which is
 * the failure that tempts somebody to skip verification altogether.
 *
 * `svix-signature` may carry several space-separated `v1,<base64>` entries during a
 * secret rotation; any one matching is a pass.
 */
export async function verifyResendSignature(
  secret: string | undefined,
  headers: Headers,
  rawBody: string,
  now: number = Date.now(),
): Promise<VerifyResult> {
  // Fail closed. An unset secret must never mean "allow" on a route that writes.
  if (!secret) return { ok: false, reason: 'RESEND_WEBHOOK_SECRET is not configured' };

  const id = headers.get('svix-id') ?? headers.get('webhook-id') ?? '';
  const timestamp = headers.get('svix-timestamp') ?? headers.get('webhook-timestamp') ?? '';
  const signatureHeader = headers.get('svix-signature') ?? headers.get('webhook-signature') ?? '';
  if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing svix headers' };

  const age = Math.abs(now / 1000 - Number(timestamp));
  if (!Number.isFinite(age)) return { ok: false, reason: 'unparseable timestamp' };
  if (age > MAX_EVENT_AGE_SECONDS) return { ok: false, reason: `timestamp ${Math.round(age)}s out of tolerance` };

  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(secret.replace(/^whsec_/, ''));
  } catch {
    return { ok: false, reason: 'secret is not valid base64 after the whsec_ prefix' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  );
  const expected = bytesToBase64(mac);

  /**
   * Every candidate is compared, and the loop is not broken out of early, so the number
   * of comparisons does not depend on which one matched.
   */
  let matched = false;
  for (const entry of signatureHeader.split(' ')) {
    const comma = entry.indexOf(',');
    if (comma < 0) continue;
    if (entry.slice(0, comma) !== 'v1') continue;
    if (timingSafeEqual(entry.slice(comma + 1), expected)) matched = true;
  }

  return matched ? { ok: true } : { ok: false, reason: 'no signature matched' };
}

export type ApplyResult =
  /** Written. */
  | { outcome: 'applied'; status: string; messageId: string }
  /** Verified and understood, but deliberately not stored — a read receipt. */
  | { outcome: 'ignored'; type: string }
  /** Verified, but names a message this system has no record of. */
  | { outcome: 'unknown'; providerMessageId: string }
  /** Verified, but older than or behind what the row already says. */
  | { outcome: 'stale'; status: string; had: string };

/**
 * Applies one verified event to its delivery row.
 *
 * Only ever called after `verifyResendSignature` passes, so the payload is Resend's
 * word rather than a stranger's. It is still read defensively — a provider changing a
 * field's shape must not throw inside a webhook, because a non-2xx makes Resend retry
 * and a reliably-throwing endpoint turns one bad event into an indefinite retry loop.
 */
export async function applyResendEvent(env: Env, event: unknown): Promise<ApplyResult> {
  const e = (event ?? {}) as Record<string, unknown>;
  const type = typeof e.type === 'string' ? e.type : '';
  const data = (e.data ?? {}) as Record<string, unknown>;

  const status = EVENT_STATUS[type];
  // Unmapped is not an error: read receipts land here, and so does any event type
  // Resend adds after this was written.
  if (!status) return { outcome: 'ignored', type: type || '(none)' };

  const providerMessageId = typeof data.email_id === 'string' ? data.email_id
    : typeof e.email_id === 'string' ? e.email_id
      : '';
  if (!providerMessageId) return { outcome: 'ignored', type: `${type} (no email_id)` };

  const db = getDb(env);
  const row = await db.query.emailDelivery.findFirst({
    where: eq(schema.emailDelivery.providerMessageId, providerMessageId),
  });
  /**
   * A 200 is still the right answer here. The message may have been pruned by
   * retention, or sent from another Resend-using system on the same domain; retrying
   * forever would not make it exist.
   */
  if (!row) return { outcome: 'unknown', providerMessageId };

  const eventAt = parseEventTime(e.created_at ?? data.created_at);

  /**
   * Two independent staleness guards, because either alone has a hole: the rank stops a
   * redelivered `delivered` clearing a `bounced`, and the timestamp stops two events
   * that share a rank from applying in the wrong order.
   */
  const currentRank = RANK[row.status] ?? -1;
  const incomingRank = RANK[status] ?? -1;
  if (incomingRank < currentRank) return { outcome: 'stale', status, had: row.status };
  if (
    incomingRank === currentRank
    && row.lastEventAt && eventAt
    && eventAt.getTime() <= row.lastEventAt.getTime()
  ) {
    return { outcome: 'stale', status, had: row.status };
  }

  const patch: Record<string, unknown> = { status, lastEventAt: eventAt ?? new Date() };

  if (status === 'delivered') {
    patch.deliveredAt = eventAt ?? new Date();
    // A message that arrived has no outstanding error and nothing left to retry.
    patch.errorCode = null;
    patch.errorMessage = null;
    patch.nextAttemptAt = null;
  }

  if (status === 'bounced' || status === 'complained') {
    patch.errorCode = bounceCode(type, data);
    patch.errorMessage = bounceMessage(type, data);
    /**
     * Null is what excludes a row from the sweep — see `outbox.ts`. A bounce is the
     * receiving server's verdict, so retrying cannot change it, and retrying a
     * complaint is actively harmful to the domain's reputation.
     */
    patch.nextAttemptAt = null;
  }

  await db.update(schema.emailDelivery)
    .set(patch)
    .where(eq(schema.emailDelivery.messageId, row.messageId));

  return { outcome: 'applied', status, messageId: row.messageId };
}

/** Resend sends ISO 8601; a number is accepted in case that ever changes. */
function parseEventTime(raw: unknown): Date | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Seconds or milliseconds — anything below this threshold cannot be a plausible
    // millisecond timestamp for a date after 1973.
    return new Date(raw < 1e11 ? raw * 1000 : raw);
  }
  if (typeof raw !== 'string' || !raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

function bounceCode(type: string, data: Record<string, unknown>): string {
  if (type === 'email.complained') return 'E_COMPLAINT';
  const bounce = (data.bounce ?? {}) as Record<string, unknown>;
  const kind = typeof bounce.type === 'string' ? bounce.type.toLowerCase() : '';
  // Resend reports Hard/Soft/Undetermined. A hard bounce is permanent and the address
  // should not be used again; a soft one is transient and the distinction is what
  // somebody reading the mailbox needs in order to decide whether to retype the address.
  if (kind === 'hard') return 'E_BOUNCE_HARD';
  if (kind === 'soft') return 'E_BOUNCE_SOFT';
  return 'E_BOUNCE';
}

function bounceMessage(type: string, data: Record<string, unknown>): string {
  if (type === 'email.complained') {
    return 'The recipient marked this as spam. Do not send to this address again.';
  }
  const bounce = (data.bounce ?? {}) as Record<string, unknown>;
  const message = typeof bounce.message === 'string' ? bounce.message : '';
  const subType = typeof bounce.subType === 'string' ? bounce.subType : '';
  const detail = [subType, message].filter(Boolean).join(' — ');
  return detail || 'The receiving server rejected this message.';
}

/** Exported for the tests, which assert the ordering rather than reimplementing it. */
export const STATUS_RANK = RANK;
export const RESEND_EVENT_STATUS = EVENT_STATUS;
