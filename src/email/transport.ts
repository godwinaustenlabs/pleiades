import { Env } from '../index';

/**
 * The one place a message leaves this Worker, and it is Resend.
 *
 * There used to be two providers. Cloudflare Email Sending was the free one, and on
 * the Workers Free plan it delivers only to *verified destination addresses* — the
 * external addresses Email Routing forwards TO. Once the apex MX moved into
 * Cloudflare, every staff address became an own-domain address, which cannot be a
 * verified destination, so the free path could reach almost nobody; and it was never
 * finished anyway (`cf-bounce._domainkey` publishes an empty key), so every attempt
 * was refused and fell through to Resend regardless. Keeping it meant a doomed API
 * call before every real one, a column on two tables, and a branch to reason about.
 * It is gone.
 *
 * Everything above this file deals in rows and never in a provider, which is what
 * made removing one a deletion rather than a rewrite. Two things still earn their
 * keep here:
 *
 *  1. **Validation happens once, before the call.** A message refused locally gets a
 *     stated reason on its outbox row instead of a provider error code.
 *  2. **Failures are classified into retryable and terminal in one place.** The
 *     outbox decides *when* to retry; it should not also have to know which HTTP
 *     status means it never will.
 */

/** An address as the rest of the system carries it. */
export type Addr = { email: string; name?: string };

export type OutgoingMessage = {
  from: Addr;
  to: Addr[];
  cc?: Addr[];
  bcc?: Addr[];
  replyTo?: Addr;
  subject: string;
  /** Required. A message with no text/plain part scores worse and renders worse. */
  text: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: {
    filename: string;
    content: string | ArrayBuffer;
    type: string;
    disposition?: 'attachment' | 'inline';
    contentId?: string;
  }[];
};

export type SendOutcome =
  | { ok: true; messageId: string; transport: 'resend' | 'console' }
  /**
   * `retryable` is the whole reason this is not just an Error. A refused recipient
   * and a transient 500 look alike from the outside, and retrying the first wastes a
   * daily allowance only ninety messages wide.
   */
  | { ok: false; code: string; message: string; retryable: boolean };

/**
 * Resend's free tier: 100 messages a day and 3,000 a month, per ACCOUNT.
 *
 * Exported because a per-mailbox cap cannot express an account-wide limit — three
 * mailboxes at forty each sail past a hundred and start failing mid-afternoon,
 * looking like a broken integration rather than a quota. `outbox.enqueue` counts the
 * account's real sends against this. Ninety rather than a hundred so a burst finds
 * the ceiling before the ceiling finds it.
 */
export const RESEND_DAILY_CAP = 90;

/**
 * Limits checked before the call rather than after, because a message refused for
 * being too large has already been rendered, stored and audited, and "rejected by us
 * for a stated reason" is a better outbox row than an opaque provider code.
 */
export const LIMITS = {
  /** to + cc + bcc combined. */
  recipients: 50,
  /** RFC 5322. */
  subjectChars: 998,
  messageBytes: 5 * 1024 * 1024,
  /** All custom headers together. */
  headerBytes: 16 * 1024,
} as const;

/**
 * Local refusals that no retry will fix. A provider failure is classified by its
 * HTTP status instead — see `sendMail`.
 */
const TERMINAL = new Set([
  'E_CONTENT_TOO_LARGE',
  'E_INVALID_RECIPIENT',
  'E_INVALID_MESSAGE',
]);

/**
 * Characters that would end a header line, by code point rather than as escapes.
 *
 * Resend takes a JSON body, so it does not concatenate our strings into a header
 * block and is not injectable today. This is defence against the version of this file
 * that is not written yet: the moment anything here builds raw MIME, a CR or LF in a
 * subject or display name becomes a header of the sender's choosing, and a smuggled
 * Bcc is invisible on the message we stored.
 *
 * Stripped rather than rejected — a newline in a subject is almost always a template
 * accident, and refusing the send is a worse outcome than a subject on one line.
 */
const HEADER_BREAK_CODES = new Set([
  0x0a, // LF
  0x0d, // CR
  0x00, // NUL
  0x2028, // LINE SEPARATOR
  0x2029, // PARAGRAPH SEPARATOR
]);

const stripBreaks = (value: string): string =>
  [...value].filter((ch) => !HEADER_BREAK_CODES.has(ch.codePointAt(0) ?? 0)).join('').trim();

function sanitiseHeaders(m: OutgoingMessage): OutgoingMessage {
  const addr = (a: Addr): Addr => ({
    email: stripBreaks(a.email),
    ...(a.name ? { name: stripBreaks(a.name) } : {}),
  });
  return {
    ...m,
    from: addr(m.from),
    to: m.to.map(addr),
    ...(m.cc ? { cc: m.cc.map(addr) } : {}),
    ...(m.bcc ? { bcc: m.bcc.map(addr) } : {}),
    ...(m.replyTo ? { replyTo: addr(m.replyTo) } : {}),
    subject: stripBreaks(m.subject ?? ''),
    // Bodies are not headers. A newline there is the point.
  };
}

const countRecipients = (m: OutgoingMessage) => m.to.length + (m.cc?.length ?? 0) + (m.bcc?.length ?? 0);

/** Rough byte size for the pre-flight check. Attachments dominate. */
function approxBytes(m: OutgoingMessage): number {
  let n = (m.subject?.length ?? 0) + m.text.length + (m.html?.length ?? 0);
  for (const a of m.attachments ?? []) {
    n += typeof a.content === 'string' ? Math.ceil(a.content.length * 0.75) : a.content.byteLength;
  }
  return n;
}

function fail(code: string, message: string): SendOutcome {
  return { ok: false, code, message, retryable: !TERMINAL.has(code) };
}

/** Local validation. Returns a terminal outcome, or null when the message is fine. */
export function validate(m: OutgoingMessage): SendOutcome | null {
  if (!m.from?.email) return fail('E_INVALID_MESSAGE', 'No From address.');
  if (countRecipients(m) === 0) return fail('E_INVALID_RECIPIENT', 'No recipients.');
  if (countRecipients(m) > LIMITS.recipients) {
    return fail('E_INVALID_RECIPIENT', `${countRecipients(m)} recipients; the limit is ${LIMITS.recipients} per message.`);
  }
  if (!m.subject) return fail('E_INVALID_MESSAGE', 'No subject.');
  if (m.subject.length > LIMITS.subjectChars) {
    return fail('E_INVALID_MESSAGE', `Subject is ${m.subject.length} characters; the limit is ${LIMITS.subjectChars}.`);
  }
  if (!m.text) return fail('E_INVALID_MESSAGE', 'No text body. A text/plain part is required.');
  if (approxBytes(m) > LIMITS.messageBytes) {
    return fail('E_CONTENT_TOO_LARGE', `Message is about ${Math.round(approxBytes(m) / 1024)} KiB; the limit is ${LIMITS.messageBytes / 1024 / 1024} MiB.`);
  }
  const headerBytes = Object.entries(m.headers ?? {}).reduce((n, [k, v]) => n + k.length + v.length + 4, 0);
  if (headerBytes > LIMITS.headerBytes) {
    return fail('E_INVALID_MESSAGE', `Custom headers total ${headerBytes} bytes; the limit is ${LIMITS.headerBytes}.`);
  }
  return null;
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const addrLine = (a: Addr) => (a.name ? `${a.name} <${a.email}>` : a.email);

/**
 * Sends one message through Resend.
 *
 * Never throws. Every failure is a classified `SendOutcome`, because the callers are
 * an `email()` handler that must not throw and a `waitUntil` whose exception nobody
 * would ever see.
 *
 * The sending domain must be verified with Resend, and any address at a verified
 * domain then works with no per-address setup. Resend puts its SPF and MX on a
 * `send.` subdomain, so the apex SPF is never edited and its DKIM selector
 * (`resend._domainkey`) collides with nothing.
 */
export async function sendMail(env: Env, m: OutgoingMessage): Promise<SendOutcome> {
  // Sanitise before validating, so a subject that is only over-length because of
  // injected line breaks is measured after they are gone.
  const msg = sanitiseHeaders(m);
  const invalid = validate(msg);
  if (invalid) return invalid;

  if (!env.RESEND_API_KEY) {
    /**
     * Not an error, and the reason this is a branch rather than a throw: a deployment
     * that lost the secret degrades to "mail is not going out, loudly in the logs"
     * instead of an exception inside whatever was sending. It is also the path the
     * test suite takes, so the whole outbox — enqueue, claim, backoff, idempotency —
     * is exercised with nothing leaving the machine.
     */
    console.warn(
      `[email] RESEND_API_KEY is unset; not sending. to=${msg.to.map((t) => t.email).join(',')} subject=${JSON.stringify(msg.subject)}`,
    );
    return { ok: true, messageId: `console_${crypto.randomUUID()}`, transport: 'console' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: addrLine(msg.from),
        to: msg.to.map(addrLine),
        ...(msg.cc?.length ? { cc: msg.cc.map(addrLine) } : {}),
        ...(msg.bcc?.length ? { bcc: msg.bcc.map(addrLine) } : {}),
        ...(msg.replyTo ? { reply_to: addrLine(msg.replyTo) } : {}),
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
        ...(msg.attachments?.length
          ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: typeof a.content === 'string' ? a.content : bytesToBase64(a.content),
            })),
          }
          : {}),
      }),
    });

    const body = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string };

    if (res.ok && body.id) return { ok: true, messageId: body.id, transport: 'resend' };

    /**
     * 429 is the daily or monthly allowance, which clears — so it stays retryable and
     * the backoff carries it over. A 5xx is theirs. Every other 4xx is something about
     * this message that will not change.
     */
    const retryable = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      code: body.name ? `RESEND_${body.name.toUpperCase()}` : `RESEND_HTTP_${res.status}`,
      message: body.message ?? `Resend returned ${res.status}.`,
      retryable,
    };
  } catch (err) {
    // A network failure is transient by default.
    return { ok: false, code: 'RESEND_UNREACHABLE', message: String(err), retryable: true };
  }
}
