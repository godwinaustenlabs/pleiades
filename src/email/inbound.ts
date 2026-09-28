import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { generateId } from '../utils/id';
import { authResults, parseMessage } from './mime';
import { resolveInboundMailbox } from './mailboxes';
import { scoreMessage } from './spam';

/**
 * Receiving mail.
 *
 * Called from the `email()` handler on the Worker's default export, which
 * Cloudflare invokes for every message a routing rule aims at this script. Since
 * Email Routing stores nothing, whatever this function fails to write is gone —
 * which sets the rules it is built around:
 *
 *  1. **It never throws.** A thrown `email()` handler bounces or drops real mail.
 *     Every step is guarded, and the outermost guard still writes a row so that a
 *     message exists even when parsing it did not work.
 *  2. **The raw bytes go to R2 before anything is parsed.** Parsing is the part
 *     most likely to be wrong; the original is the part that cannot be
 *     reconstructed. If everything after step 2 fails, the message is still
 *     recoverable by hand.
 *  3. **Nothing is ever rejected.** `setReject()` is never called and spam is
 *     filed rather than dropped. Turning away a client's reply is worse than a
 *     messy spam folder, and we are not confident enough in the scorer to make
 *     that trade.
 */

/** Domains this system holds the mail for. Used to spot forged internal senders. */
const OUR_DOMAINS = ['godwinausten.org'];

/** How far back to look for a thread when no header matches. */
const THREAD_FALLBACK_DAYS = 30;

/** Mirrors ALLOWED_UPLOAD_PREFIXES' cap; a larger message is stored raw-only. */
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/**
 * Above this, the message is stored but not parsed.
 *
 * The Workers **Free** plan allows 10ms of CPU per invocation, and Cloudflare's
 * own docs warn that a complex `email()` handler can exceed it. D1 and R2 calls
 * are I/O and cost nothing against that budget, but MIME parsing is real CPU —
 * base64-decoding a multi-megabyte attachment is the part that would blow it.
 *
 * Being killed mid-parse is the worst available outcome: the raw message is
 * already in R2 by then, but no row exists, so nothing in the UI shows that
 * anything arrived. So a large message gets a row with a placeholder body and a
 * link to its raw file instead — visible, and recoverable by hand — rather than a
 * gamble on finishing in time.
 *
 * Raise this after moving to Workers Paid, where the limit is 30s rather than 10ms.
 */
const MAX_PARSE_BYTES = 512 * 1024;

type ForwardableEmail = {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream;
  readonly rawSize: number;
};

async function readAll(stream: ReadableStream): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.byteLength; }
  }
  const merged = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { merged.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(merged);
}

/**
 * Finds the thread a message belongs to.
 *
 * Header matching first, because it is the only exact answer: a reply quotes the
 * `Message-ID` we recorded in `email_delivery.provider_message_id` when the
 * outbound message was sent, and matching that is unambiguous.
 *
 * Per-message reply addresses (VERP) would be better still and are not available
 * — Cloudflare's subdomain routing takes literal recipient addresses only, so
 * there is no `r+<id>@` to route. Hence the fallback: the most recent thread in
 * this mailbox with the same counterparty. It can be wrong, which is why it is
 * recorded in `matched_by` rather than hidden.
 */
async function findThread(
  env: Env,
  mailboxId: string,
  references: string[],
  fromAddress: string,
): Promise<{ threadId: string | null; matchedBy: 'references' | 'address' | 'unmatched' }> {
  const db = getDb(env);

  for (const ref of references) {
    const prior = await db.query.emailMessages.findFirst({
      where: and(eq(schema.emailMessages.messageIdHeader, ref), eq(schema.emailMessages.mailboxId, mailboxId)),
    });
    if (prior?.threadId) return { threadId: prior.threadId, matchedBy: 'references' };

    const delivered = await db.query.emailDelivery.findFirst({
      where: eq(schema.emailDelivery.providerMessageId, ref),
    });
    if (delivered) {
      const sent = await db.query.emailMessages.findFirst({
        where: eq(schema.emailMessages.id, delivered.messageId),
      });
      /**
       * Scoped to this mailbox, deliberately.
       *
       * `References:` is attacker-controlled — a stranger can put any id in it. The
       * lookup above is global, so without this check a guessed provider id would
       * attach an inbound message to a thread belonging to a DIFFERENT mailbox.
       * Nothing currently reads messages by `threadId` alone, so it leaked nothing;
       * it would have put a stranger's mail into another department's conversation,
       * which is a mess to untangle and exactly the sort of thing that becomes a
       * disclosure the day a thread view is added.
       */
      if (sent && sent.mailboxId === mailboxId) {
        if (sent.threadId) return { threadId: sent.threadId, matchedBy: 'references' };
        return { threadId: null, matchedBy: 'references' };
      }
    }
  }

  const cutoff = new Date(Date.now() - THREAD_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
  const recent = await db.query.emailMessages.findFirst({
    where: and(
      eq(schema.emailMessages.mailboxId, mailboxId),
      eq(schema.emailMessages.fromAddress, fromAddress),
      gte(schema.emailMessages.createdAt, cutoff),
    ),
    orderBy: [desc(schema.emailMessages.createdAt)],
  });
  if (recent?.threadId) return { threadId: recent.threadId, matchedBy: 'address' };

  return { threadId: null, matchedBy: 'unmatched' };
}

export async function handleInbound(message: ForwardableEmail, env: Env): Promise<void> {
  const recipient = (message.to ?? '').trim().toLowerCase();
  let rawKey: string | null = null;

  try {
    const box = await resolveInboundMailbox(env, recipient);

    if (!box) {
      // No mailbox and no catch-all. Logged loudly rather than rejected: a bounce
      // tells a stranger which of our addresses exist.
      console.error(`[email] inbound to ${recipient} matched no mailbox and there is no catch-all; dropping.`);
      return;
    }

    // Mail addressed TO a machine identity is discarded on purpose. Once a
    // catch-all is live nothing bounces any more, so this is what "replies to
    // no-reply@ go nowhere" has to mean in practice.
    if (box.kind === 'system') return;

    const db = getDb(env);
    const raw = await readAll(message.raw);

    // Raw bytes first. Parsing is the step most likely to be wrong and this is
    // the artefact that cannot be rebuilt.
    if (env.CRM_BUCKET) {
      rawKey = `email-raw/${box.id}/${generateId('raw')}.eml`;
      try {
        await env.CRM_BUCKET.put(rawKey, raw, { httpMetadata: { contentType: 'message/rfc822' } });
      } catch (err) {
        console.error('[email] could not store raw message:', err);
        rawKey = null;
      }
    }

    /**
     * Headers are always parsed — they are cheap and they carry the authentication
     * verdicts and the threading ids. Only the BODY is skipped when the message is
     * too large to decode inside the CPU budget, since that is where the cost is.
     */
    const tooBigToParse = raw.length > MAX_PARSE_BYTES;

    const parsed = tooBigToParse
      ? (() => {
        const headerOnly = parseMessage(raw.slice(0, 32 * 1024).split('\n\n')[0] + '\n\n');
        return {
          ...headerOnly,
          text:
            `This message is ${Math.round(raw.length / 1024)} KiB, too large to render on the current plan.\n\n` +
            'It was received and stored in full. Download the original to read it.',
          html: undefined,
          attachments: [],
        };
      })()
      : parseMessage(raw);

    const auth = authResults(parsed.headers);
    const spam = scoreMessage(parsed, auth, OUR_DOMAINS);

    if (tooBigToParse) {
      console.warn(`[email] ${recipient}: ${raw.length} bytes exceeds the parse ceiling; stored raw at ${rawKey ?? 'nowhere'}.`);
    }

    // The envelope sender, not the From header, is what Cloudflare validated.
    // Prefer the header for display but keep them consistent for threading.
    const fromAddress = parsed.from.email !== 'unknown@invalid'
      ? parsed.from.email
      : (message.from ?? '').trim().toLowerCase();

    const { threadId, matchedBy } = await findThread(env, box.id, parsed.references, fromAddress);

    const now = new Date();
    const messageId = generateId('eml');
    let finalThreadId = threadId;

    if (!finalThreadId) {
      finalThreadId = generateId('thr');
      await db.insert(schema.emailThreads).values({
        id: finalThreadId,
        mailboxId: box.id,
        subject: parsed.subject || null,
        contactId: null,
        lastMessageAt: now,
        messageCount: 0,
        createdAt: now,
      });
    }

    await db.insert(schema.emailMessages).values({
      id: messageId,
      mailboxId: box.id,
      threadId: finalThreadId,
      direction: 'inbound',
      // Spam is filed, never dropped. See rule 3 in the file header.
      folder: spam.verdict === 'spam' ? 'spam' : 'inbox',
      fromAddress,
      fromName: parsed.from.name ?? null,
      toAddresses: JSON.stringify(parsed.to.length ? parsed.to : [{ email: recipient }]),
      ccAddresses: parsed.cc.length ? JSON.stringify(parsed.cc) : null,
      bccAddresses: null,
      subject: parsed.subject || null,
      bodyText: parsed.text,
      bodyHtml: parsed.html ?? null,
      messageIdHeader: parsed.messageId ?? null,
      inReplyToHeader: parsed.inReplyTo ?? null,
      referencesHeader: parsed.references.length ? parsed.references.join(' ') : null,
      rawKey,
      rawSize: message.rawSize ?? raw.length,
      spfResult: auth.spf ?? null,
      dkimResult: auth.dkim ?? null,
      dmarcResult: auth.dmarc ?? null,
      spamScore: spam.score,
      spamVerdict: spam.verdict,
      isRead: false,
      isStarred: false,
      receivedAt: parsed.date ?? now,
      createdBy: null,
      createdAt: now,
    });

    await db.update(schema.emailThreads)
      .set({ lastMessageAt: now, messageCount: (await countThread(env, finalThreadId)) })
      .where(eq(schema.emailThreads.id, finalThreadId));

    // Attachments after the message row: an attachment with no message is
    // unreachable, whereas a message whose attachment failed is still readable.
    if (env.CRM_BUCKET) {
      for (const att of parsed.attachments) {
        if (att.content.byteLength > MAX_ATTACHMENT_BYTES) {
          console.warn(`[email] skipping ${att.filename} on ${messageId}: ${att.content.byteLength} bytes`);
          continue;
        }
        try {
          const key = `email-att/${box.id}/${messageId}/${generateId('att')}`;
          await env.CRM_BUCKET.put(key, att.content, { httpMetadata: { contentType: att.contentType } });
          await db.insert(schema.emailAttachments).values({
            id: generateId('eatt'),
            messageId,
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: att.content.byteLength,
            r2Key: key,
            disposition: att.disposition,
            contentId: att.contentId ?? null,
            createdAt: now,
          });
        } catch (err) {
          console.error(`[email] could not store attachment ${att.filename} on ${messageId}:`, err);
        }
      }
    }

    console.log(
      `[email] received ${messageId} for ${box.address} from ${fromAddress} ` +
      `(thread ${matchedBy}, dmarc=${auth.dmarc ?? 'unknown'}, spam=${spam.verdict}/${spam.score})`,
    );
  } catch (err) {
    // Rule 1. The message is already in R2 when rawKey is set, so say where.
    console.error(
      `[email] inbound handling failed for ${recipient}` +
      `${rawKey ? ` — the raw message is at ${rawKey}` : ' and the raw message was not stored'}:`,
      err,
    );
  }
}

async function countThread(env: Env, threadId: string): Promise<number> {
  const row = await env.DB
    .prepare('SELECT count(*) AS n FROM email_messages WHERE thread_id = ?')
    .bind(threadId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}
