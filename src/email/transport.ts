import { Env } from '../index';

/**
 * The one place a message actually leaves this Worker.
 *
 * Everything above it — the outbox, the templates, the transactional hooks —
 * deals in rows and never in a provider. That matters for three reasons and only
 * the first is portability:
 *
 *  1. There are two providers, because this account is on the Workers FREE plan
 *     and Cloudflare Email Sending splits on exactly that line: sending to a
 *     *verified destination address* is free on every plan, sending to an
 *     arbitrary recipient is not. So internal mail goes through the binding and
 *     anything addressed to a prospect or a client goes through Resend. Which one
 *     a message uses is `mailboxes.transport`, chosen when the mailbox is created
 *     and visible on the Access page — not inferred here from the address.
 *  2. A deployment can be missing the binding — a preview, a fresh account, a
 *     `wrangler.jsonc` that lost the block in a merge. Without a fallback that
 *     surfaces as an exception inside every task assignment; here it degrades to
 *     a warning and a message that was not sent, which is both survivable and
 *     legible. (Miniflare does simulate `send_email`, so the test suite takes the
 *     binding path, not this one — see test/email.test.ts.)
 *  3. The provider's error codes are classified here, once, into "try again" and
 *     "stop". `outbox.ts` decides *when* to retry; it should not also have to
 *     know which of Cloudflare's strings mean it never will.
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

/**
 * Which service sends a message.
 *
 * `auto` is the default and the interesting one: try the free path, fall back to
 * Resend when it refuses. The two explicit values are overrides for a mailbox that
 * must never touch a third party, or must never risk a refusal.
 */
export type TransportChoice = 'auto' | 'cloudflare' | 'resend';

/** Which one actually sent it. `console` means nothing left the machine. */
export type TransportName = 'cloudflare' | 'resend';

export type SendOutcome =
  | { ok: true; messageId: string; transport: TransportName | 'console' }
  /**
   * `retryable` is the whole reason this type is not just an Error. A refused
   * recipient and a transient 500 both throw the same shape out of the binding,
   * and retrying the first is how a sending domain's reputation gets worse.
   */
  | { ok: false; code: string; message: string; retryable: boolean; suppressed?: boolean };

/**
 * Cloudflare's published limits. Checked before the call rather than after,
 * because a message that is refused for being too large has already been
 * rendered, stored and audited, and "rejected by us for a stated reason" is a
 * better outbox row than "E_CONTENT_TOO_LARGE".
 */
export const LIMITS = {
  /** to + cc + bcc combined. */
  recipients: 50,
  /** RFC 5322. */
  subjectChars: 998,
  /** 5 MiB for an ordinary send; 25 MiB when every recipient is a verified destination. */
  messageBytes: 5 * 1024 * 1024,
  /** All custom headers together. */
  headerBytes: 16 * 1024,
} as const;

/**
 * Resend's free tier: 100 messages a day, 3,000 a month, per ACCOUNT.
 *
 * Exported because the per-mailbox cap cannot enforce it — three mailboxes at
 * forty each would sail past a hundred and start failing mid-afternoon with no
 * warning — so `outbox.enqueue` counts the whole account's Resend traffic against
 * this separately. Ninety rather than a hundred so a burst does not discover the
 * ceiling by hitting it.
 */
export const RESEND_DAILY_CAP = 90;

/**
 * Codes that no number of retries will fix. Everything not named here is treated
 * as transient, which is the safe default: a retry of something permanent costs
 * five log lines, whereas giving up on something transient loses the message.
 */
const TERMINAL = new Set([
  'E_SENDER_NOT_VERIFIED',
  'E_CONTENT_TOO_LARGE',
  'E_INVALID_RECIPIENT',
  'E_INVALID_MESSAGE',
  /**
   * What Cloudflare returns on the Workers Free plan for a recipient that is not a
   * verified destination address. Observed in production rather than guessed — the
   * first real send attempt refused `hr@godwinausten.org` with exactly this.
   *
   * Terminal, because retrying cannot make an address verified. Note it is NOT in
   * the no-fallback list in `sendMail`: under `auto` this is precisely the code that
   * should hand the message to Resend, which is the whole reason `auto` exists.
   */
  'E_RECIPIENT_NOT_ALLOWED',
]);

function countRecipients(m: OutgoingMessage): number {
  return m.to.length + (m.cc?.length ?? 0) + (m.bcc?.length ?? 0);
}

/** Rough byte size, for the pre-flight check. Attachments dominate. */
function approxBytes(m: OutgoingMessage): number {
  let n = (m.subject?.length ?? 0) + m.text.length + (m.html?.length ?? 0);
  for (const a of m.attachments ?? []) {
    n += typeof a.content === 'string'
      // base64 in, raw bytes out.
      ? Math.ceil(a.content.length * 0.75)
      : a.content.byteLength;
  }
  return n;
}

/**
 * Anything that would end a header line.
 *
 * Both providers take structured objects — a JSON body for Resend, a builder for
 * the binding — so neither concatenates our strings into a header block and
 * neither is injectable today. This is defence against the version of this file
 * that is not written yet: the moment anything here builds raw MIME, a CR or LF in
 * a subject or a display name becomes a header of the attacker's choosing, and a
 * `Bcc:` smuggled that way is invisible on the message we stored.
 *
 * Stripped rather than rejected. A subject containing a newline is almost always a
 * template accident, and refusing the send would be a worse outcome than a subject
 * on one line.
 */
const HEADER_BREAKS = /[\r\n\u2028\u2029\u0000]/g;

function stripBreaks(value: string): string {
  return value.replace(HEADER_BREAKS, ' ').trim();
}

/** Removes anything header-shaped from the fields that become headers. */
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

function fail(code: string, message: string): SendOutcome {
  return { ok: false, code, message, retryable: !TERMINAL.has(code) };
}

const addr = (a: Addr) => (a.name ? { email: a.email, name: a.name } : a.email);

/**
 * Send one message.
 *
 * Never throws. Every failure path returns a classified `SendOutcome`, because
 * the callers are an `email()` handler that must not throw and a `waitUntil`
 * whose exception nobody would ever see.
 */
/**
 * Sends one message, through whichever service the mailbox is configured for.
 *
 * Never throws. Every failure path returns a classified `SendOutcome`, because the
 * callers are an `email()` handler that must not throw and a `waitUntil` whose
 * exception nobody would ever see.
 *
 * Validation happens once, here, rather than in each implementation: the limits
 * that matter (recipient count, subject length, total size) are the stricter of
 * the two providers' anyway, and a message refused locally produces a stated
 * reason on the outbox row instead of a provider error code.
 */
export async function sendMail(
  env: Env,
  m: OutgoingMessage,
  via: TransportChoice = 'auto',
): Promise<SendOutcome> {
  // Sanitise before validating, so a subject that is only over-length because of
  // injected line breaks is measured after they are gone.
  const msg = sanitiseHeaders(m);
  const invalid = validate(msg);
  if (invalid) return invalid;

  if (via === 'resend') return sendViaResend(env, msg);
  if (via === 'cloudflare') return sendViaCloudflare(env, msg);

  /**
   * `auto`: the free path first, Resend as the fallback.
   *
   * On the Workers Free plan Cloudflare delivers only to verified destination
   * addresses, and which addresses those are is a list Cloudflare holds — not
   * something this Worker can query. Mirroring it here would be a second copy of
   * somebody else's truth, drifting the first time an address was added on one
   * side only. Trying and falling back needs no list and cannot drift.
   *
   * Two refusals are NOT retried elsewhere, because they are facts about the
   * message rather than about the plan:
   *
   *   E_RECIPIENT_SUPPRESSED  Cloudflare has this address on its bounce or
   *                           complaint list. Sending it via Resend anyway is how
   *                           a sender ends up on a blocklist.
   *   E_CONTENT_TOO_LARGE     Resend's ceiling is no higher.
   *
   * Anything else — including an unverified recipient, whatever code that turns
   * out to be — falls through. The transport that actually sent it is recorded on
   * the delivery row, so a fallback is visible rather than silent.
   */
  const first = await sendViaCloudflare(env, msg);
  if (first.ok) return first;

  if (first.suppressed || first.code === 'E_CONTENT_TOO_LARGE') return first;

  console.log(
    `[email] Cloudflare refused (${first.code}: ${first.message}); falling back to Resend for ` +
    `${msg.to.map((t) => t.email).join(',')}.`,
  );

  const second = await sendViaResend(env, msg);
  if (second.ok) return second;

  // Report the Resend failure, but name both so the log is not misleading about
  // where the message got to.
  return {
    ...second,
    message: `${second.message} (Cloudflare had already refused it: ${first.code} ${first.message})`,
  };
}

/**
 * Resend, over HTTP.
 *
 * Carries anything addressed to somebody outside the company, because on the
 * Workers Free plan the binding below refuses a recipient that is not a verified
 * destination — which is every prospect and every client.
 *
 * The sending domain has to be verified with Resend, and it should be a
 * SUBDOMAIN: Resend wants an SPF include on whatever domain it sends for, and the
 * apex already carries `v=spf1 include:secureserver.net -all` that GoDaddy's
 * mailboxes depend on. Editing that record to add a second include is a change
 * with a blast radius; adding records to `outreach.godwinausten.org` is not.
 */
async function sendViaResend(env: Env, m: OutgoingMessage): Promise<SendOutcome> {
  if (!env.RESEND_API_KEY) {
    console.warn(
      `[email] RESEND_API_KEY is unset; not sending. to=${m.to.map((t) => t.email).join(',')} subject=${JSON.stringify(m.subject)}`,
    );
    return { ok: true, messageId: `console_${crypto.randomUUID()}`, transport: 'console' };
  }

  const addrLine = (a: Addr) => (a.name ? `${a.name} <${a.email}>` : a.email);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: addrLine(m.from),
        to: m.to.map(addrLine),
        ...(m.cc?.length ? { cc: m.cc.map(addrLine) } : {}),
        ...(m.bcc?.length ? { bcc: m.bcc.map(addrLine) } : {}),
        ...(m.replyTo ? { reply_to: addrLine(m.replyTo) } : {}),
        subject: m.subject,
        text: m.text,
        ...(m.html ? { html: m.html } : {}),
        ...(m.headers ? { headers: m.headers } : {}),
        ...(m.attachments?.length
          ? {
            attachments: m.attachments.map((a) => ({
              filename: a.filename,
              content: typeof a.content === 'string' ? a.content : bytesToBase64(a.content),
            })),
          }
          : {}),
      }),
    });

    const body = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string };

    if (res.ok && body.id) {
      return { ok: true, messageId: body.id, transport: 'resend' };
    }

    // Resend reports the quota as 429. That is not permanent — it clears at
    // midnight — so it must stay retryable, and the backoff will carry it over.
    const retryable = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      code: body.name ? `RESEND_${body.name.toUpperCase()}` : `RESEND_HTTP_${res.status}`,
      message: body.message ?? `Resend returned ${res.status}.`,
      retryable,
    };
  } catch (err) {
    // A network failure is transient by default; see the note on TERMINAL.
    return { ok: false, code: 'RESEND_UNREACHABLE', message: String(err), retryable: true };
  }
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Cloudflare Email Service, via the `send_email` binding.
 *
 * On the Workers Free plan this reaches verified destination addresses only, and
 * those sends are free and count against no quota — which is why every
 * transactional notification to staff goes this way and leaves Resend's daily
 * allowance entirely for mail to the outside world.
 */
async function sendViaCloudflare(env: Env, m: OutgoingMessage): Promise<SendOutcome> {
  if (!env.EMAIL) {
    // Not an error, and not the path tests take — Miniflare simulates the
    // binding. This is a deployment with the binding missing, and saying so once
    // per message is how that gets noticed.
    console.warn(
      `[email] no EMAIL binding; not sending. to=${m.to.map((t) => t.email).join(',')} subject=${JSON.stringify(m.subject)}`,
    );
    return { ok: true, messageId: `console_${crypto.randomUUID()}`, transport: 'console' };
  }

  try {
    const result = await env.EMAIL.send({
      from: addr(m.from),
      to: m.to.map(addr),
      ...(m.cc?.length ? { cc: m.cc.map(addr) } : {}),
      ...(m.bcc?.length ? { bcc: m.bcc.map(addr) } : {}),
      ...(m.replyTo ? { replyTo: addr(m.replyTo) } : {}),
      subject: m.subject,
      text: m.text,
      ...(m.html ? { html: m.html } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
      ...(m.attachments?.length
        ? {
          attachments: m.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            type: a.type,
            disposition: a.disposition ?? 'attachment',
            ...(a.contentId ? { contentId: a.contentId } : {}),
          })),
        }
        : {}),
    } as EmailMessageBuilder);

    return { ok: true, messageId: result.messageId, transport: 'cloudflare' };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = e.code ?? 'E_UNKNOWN';
    // Suppression is reported as its own status rather than a failure: the
    // address is on Cloudflare's bounce/complaint list, we are not going to
    // change that by trying again, and it is not a fault in this message.
    if (code === 'E_RECIPIENT_SUPPRESSED') {
      return { ok: false, code, message: e.message ?? 'Recipient is suppressed.', retryable: false, suppressed: true };
    }
    return { ok: false, code, message: e.message ?? String(err), retryable: !TERMINAL.has(code) };
  }
}
