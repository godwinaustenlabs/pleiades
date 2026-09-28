/**
 * Just enough MIME to read a received message.
 *
 * Nothing in this repo parsed MIME before, and nothing in the Workers runtime
 * does it either, so this is written rather than imported. It is deliberately a
 * *reader*, not a general MIME library: it finds the text and HTML parts, pulls
 * out attachments, and decodes the two transfer encodings that occur in practice.
 * Outbound messages are built by Cloudflare from structured fields, so there is
 * no builder here and there should not be one.
 *
 * Two rules hold throughout, and both exist because this runs inside a handler
 * that must never throw — a thrown `email()` bounces or loses somebody's real
 * mail:
 *
 *  1. Every function degrades rather than failing. An unparseable body yields the
 *     raw text, an unknown charset is read as UTF-8, a malformed boundary yields
 *     one part instead of several.
 *  2. Nothing recurses without a depth bound. Nested multiparts are legitimate,
 *     and a message crafted with two hundred of them is a stack overflow.
 */

export type MimeHeaders = Map<string, string>;

export type ParsedAttachment = {
  filename: string;
  contentType: string;
  /** Raw bytes, already decoded from base64 where applicable. */
  content: Uint8Array;
  disposition: 'attachment' | 'inline';
  contentId?: string;
};

export type ParsedMessage = {
  headers: MimeHeaders;
  subject: string;
  from: { email: string; name?: string };
  to: { email: string; name?: string }[];
  cc: { email: string; name?: string }[];
  messageId?: string;
  inReplyTo?: string;
  /** Every id in `References`, plus `In-Reply-To`, oldest first. */
  references: string[];
  date?: Date;
  text: string;
  html?: string;
  attachments: ParsedAttachment[];
};

const MAX_DEPTH = 8;
/** A cap on parts, so a message with ten thousand of them cannot occupy the handler. */
const MAX_PARTS = 64;

// ── Headers ─────────────────────────────────────────────────────────────────

/**
 * Splits a raw message into headers and body, and unfolds continuation lines.
 *
 * RFC 5322 lets a long header wrap onto lines beginning with whitespace, which is
 * ordinary in real mail — a `References` chain almost always wraps. Treating each
 * physical line as a header loses the tail of every one of them.
 */
export function splitMessage(raw: string): { headers: MimeHeaders; body: string } {
  const normalised = raw.replace(/\r\n/g, '\n');
  const blank = normalised.indexOf('\n\n');

  /**
   * With no blank line, RFC 5322 says the whole thing is headers — but something
   * that contains no header-shaped line at all is not a message, and reading it
   * as an empty body loses it entirely. Anything arriving here has already been
   * accepted by an MTA, so the useful reading is "this is a body with no
   * headers", which at least keeps the content.
   */
  if (blank === -1 && !/^[!-9;-~]+:/m.test(normalised)) {
    return { headers: new Map(), body: normalised };
  }

  const headerBlock = blank === -1 ? normalised : normalised.slice(0, blank);
  const body = blank === -1 ? '' : normalised.slice(blank + 2);

  const headers: MimeHeaders = new Map();
  const unfolded = headerBlock.replace(/\n[ \t]+/g, ' ');
  for (const line of unfolded.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    // Keep the FIRST occurrence. A second `From` is either a broken sender or a
    // deliberate header-injection attempt, and the first is what a receiver
    // validated DMARC against.
    if (!headers.has(name)) headers.set(name, value);
  }
  return { headers, body };
}

/** A `key=value` parameter from a structured header, quoted or not. */
function param(value: string, name: string): string | undefined {
  const quoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(value);
  if (quoted) return quoted[1];
  const bare = new RegExp(`${name}\\s*=\\s*([^;\\s]+)`, 'i').exec(value);
  return bare?.[1];
}

/**
 * Decodes RFC 2047 encoded words — `=?utf-8?B?...?=` — which is how any subject
 * containing a non-ASCII character arrives. Left as-is when it cannot be decoded,
 * since a visibly encoded subject beats an empty one.
 */
export function decodeWords(input: string): string {
  return input.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, _charset, enc, data) => {
    try {
      if (enc.toUpperCase() === 'B') return new TextDecoder().decode(base64ToBytes(data));
      // Q encoding: `_` is a space, `=XX` is a byte.
      const bytes = qpToBytes(data.replace(/_/g, ' '));
      return new TextDecoder().decode(bytes);
    } catch {
      return whole;
    }
  });
}

/**
 * Splits an address list on the commas that actually separate addresses.
 *
 * Scanned rather than done with a regex, because the two things a comma can be
 * inside are a quoted display name and an angle-bracketed address, and
 * `"Smith, John" <john@x>` — the standard Outlook format — is split in the middle
 * by any regex simple enough to read. Getting it wrong produces an address list
 * with a phantom entry and a truncated name.
 */
function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let inAngles = false;
  for (const ch of value) {
    if (ch === '"') { inQuotes = !inQuotes; current += ch; continue; }
    if (!inQuotes && ch === '<') { inAngles = true; current += ch; continue; }
    if (!inQuotes && ch === '>') { inAngles = false; current += ch; continue; }
    if (ch === ',' && !inQuotes && !inAngles) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** `Name <addr@host>` or a bare address, in a comma-separated list. */
export function parseAddresses(value: string | undefined): { email: string; name?: string }[] {
  if (!value) return [];
  const out: { email: string; name?: string }[] = [];
  for (const chunk of splitAddressList(value)) {
    const piece = chunk.trim();
    if (!piece) continue;
    const angled = /^(.*?)<([^>]+)>$/.exec(piece);
    if (angled) {
      const name = decodeWords(angled[1].trim().replace(/^"|"$/g, '')).trim();
      out.push({ email: angled[2].trim().toLowerCase(), ...(name ? { name } : {}) });
    } else if (piece.includes('@')) {
      out.push({ email: piece.replace(/[<>]/g, '').trim().toLowerCase() });
    }
  }
  return out;
}

/** Every `<...>` id in a header, in order. */
function messageIds(value: string | undefined): string[] {
  if (!value) return [];
  return [...value.matchAll(/<([^>]+)>/g)].map((m) => `<${m[1]}>`);
}

// ── Transfer encodings ──────────────────────────────────────────────────────

function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function qpToBytes(input: string): Uint8Array {
  // Soft line breaks first: `=` at end of line means "this line continues".
  const joined = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    if (joined[i] === '=' && i + 2 < joined.length) {
      const hex = joined.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(joined.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(bytes);
}

function decodeBody(body: string, encoding: string | undefined, charset: string | undefined): string {
  const enc = (encoding ?? '7bit').toLowerCase();
  let bytes: Uint8Array;
  try {
    if (enc === 'base64') bytes = base64ToBytes(body);
    else if (enc === 'quoted-printable') bytes = qpToBytes(body);
    else return body;
  } catch {
    return body;
  }
  try {
    // An unrecognised charset decodes as UTF-8 rather than failing: mojibake is
    // recoverable by a human, a thrown handler is not.
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function decodeBytes(body: string, encoding: string | undefined): Uint8Array {
  const enc = (encoding ?? '7bit').toLowerCase();
  try {
    if (enc === 'base64') return base64ToBytes(body);
    if (enc === 'quoted-printable') return qpToBytes(body);
  } catch {
    /* fall through */
  }
  return new TextEncoder().encode(body);
}

// ── Parts ───────────────────────────────────────────────────────────────────

type Collected = { text?: string; html?: string; attachments: ParsedAttachment[] };

function collect(headers: MimeHeaders, body: string, depth: number, into: Collected): void {
  if (depth > MAX_DEPTH || into.attachments.length >= MAX_PARTS) return;

  const contentType = headers.get('content-type') ?? 'text/plain';
  const type = contentType.split(';')[0].trim().toLowerCase();
  const encoding = headers.get('content-transfer-encoding');
  const disposition = headers.get('content-disposition') ?? '';

  if (type.startsWith('multipart/')) {
    const boundary = param(contentType, 'boundary');
    // A multipart with no boundary is malformed. Treating the whole body as one
    // text part keeps the message readable instead of losing it.
    if (!boundary) {
      into.text = into.text ?? body;
      return;
    }
    const marker = `--${boundary}`;
    const segments = body.split(marker);
    // First segment is the preamble, last is after the closing `--`.
    for (const segment of segments.slice(1, -1).slice(0, MAX_PARTS)) {
      const cleaned = segment.replace(/^\n/, '');
      const sub = splitMessage(cleaned);
      collect(sub.headers, sub.body, depth + 1, into);
    }
    return;
  }

  const filename = param(disposition, 'filename') ?? param(contentType, 'name');
  const isAttachment = /attachment/i.test(disposition) || (!!filename && !type.startsWith('text/'));
  const isInline = /inline/i.test(disposition) && !!headers.get('content-id');

  if (isAttachment || (isInline && filename)) {
    into.attachments.push({
      filename: decodeWords(filename ?? 'attachment'),
      contentType: type,
      content: decodeBytes(body, encoding),
      disposition: isAttachment ? 'attachment' : 'inline',
      ...(headers.get('content-id') ? { contentId: headers.get('content-id')!.replace(/[<>]/g, '') } : {}),
    });
    return;
  }

  const charset = param(contentType, 'charset');
  const decoded = decodeBody(body, encoding, charset);
  // First of each kind wins. In an `alternative` the richest part comes last, but
  // a reply chain nests earlier messages below, and taking the last text part
  // would show the quoted original instead of what was just written.
  if (type === 'text/html') into.html = into.html ?? decoded;
  else into.text = into.text ?? decoded;
}

/** Strips tags well enough to make an HTML-only message readable as text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parses a complete raw message.
 *
 * `text` is always a string. A message with only an HTML part gets a stripped
 * version, because `email_messages.body_text` is NOT NULL and because the reader
 * never renders a stranger's HTML — so with no text there would be nothing at all
 * to show.
 */
export function parseMessage(raw: string): ParsedMessage {
  const { headers, body } = splitMessage(raw);
  const into: Collected = { attachments: [] };

  try {
    collect(headers, body, 0, into);
  } catch (err) {
    console.error('[email] MIME parse failed; falling back to the raw body:', err);
  }

  const html = into.html;
  const text = into.text && into.text.trim() !== ''
    ? into.text
    : html
      ? htmlToText(html)
      // Neither part parsed. The raw body is worse than a clean text part and far
      // better than an empty message nobody can tell arrived.
      : body.slice(0, 100_000);

  const dateHeader = headers.get('date');
  const parsedDate = dateHeader ? new Date(dateHeader) : undefined;

  return {
    headers,
    subject: decodeWords(headers.get('subject') ?? ''),
    from: parseAddresses(headers.get('from'))[0] ?? { email: 'unknown@invalid' },
    to: parseAddresses(headers.get('to')),
    cc: parseAddresses(headers.get('cc')),
    messageId: messageIds(headers.get('message-id'))[0],
    inReplyTo: messageIds(headers.get('in-reply-to'))[0],
    // `References` then `In-Reply-To`: the latter is usually the last entry of the
    // former, and a set is what the thread matcher wants.
    references: [...new Set([...messageIds(headers.get('references')), ...messageIds(headers.get('in-reply-to'))])],
    ...(parsedDate && !Number.isNaN(parsedDate.getTime()) ? { date: parsedDate } : {}),
    text,
    ...(html ? { html } : {}),
    attachments: into.attachments,
  };
}

/**
 * Authentication-Results authserv-ids this system will believe.
 *
 * The header is only meaningful if you know who wrote it, and a sender can put
 * whatever they like in their own message — including
 * `Authentication-Results: mx; dmarc=pass`. A receiving MTA prepends its verdict
 * above the message's existing headers and `splitMessage` keeps the first
 * occurrence, so Cloudflare's is normally the one read; but if Cloudflare ever
 * adds none, the first is the SENDER'S, and `spam.ts` would read a forged `pass`
 * — defeating the one check that catches somebody claiming to be us, which is the
 * mechanism behind invoice redirection and "the CEO needs a transfer".
 *
 * So the authserv-id is checked. An unrecognised one yields no verdicts at all,
 * which is the safe direction: `scoreMessage` treats absent as unknown and an
 * our-domain sender that did not positively pass DMARC scores as spam.
 */
const TRUSTED_AUTHSERV = [/(^|\.)cloudflare\.net$/i, /(^|\.)mx\.cloudflare\.com$/i];

/**
 * Reads the SPF/DKIM/DMARC verdicts the receiving MTA wrote.
 *
 * Cloudflare validates these before the message reaches the Worker, so this reads
 * its conclusion rather than re-deriving one. Absent, unattributable or
 * unparseable all mean unknown — never pass.
 */
export function authResults(headers: MimeHeaders): { spf?: string; dkim?: string; dmarc?: string } {
  const line = headers.get('authentication-results');
  if (!line) return {};

  // `Authentication-Results: <authserv-id>; spf=pass; dkim=pass; dmarc=pass`
  const authserv = line.split(';')[0].trim().split(/\s+/)[0].toLowerCase();
  if (!TRUSTED_AUTHSERV.some((re) => re.test(authserv))) {
    console.warn(
      `[email] ignoring Authentication-Results from an unrecognised authserv-id ${JSON.stringify(authserv)}; ` +
      'treating authentication as unknown. If this is a legitimate change on the receiving side, add it to TRUSTED_AUTHSERV.',
    );
    return {};
  }

  /**
   * Anchored on a delimiter, which matters more than it looks: an unanchored
   * `spf=(\w+)` matches the `spf=` inside `aspf=r`, and real DMARC results carry
   * policy detail like `dmarc=pass (p=REJECT sp=REJECT aspf=r)`. That read an SPF
   * verdict of "r" off a message whose SPF was never evaluated.
   */
  const pick = (mech: string) => {
    const m = new RegExp(`(?:^|[;\\s(])${mech}=([\\w-]+)`, 'i').exec(line);
    return m?.[1]?.toLowerCase();
  };

  const spf = pick('spf');
  const dkim = pick('dkim');
  const dmarc = pick('dmarc');
  return {
    ...(spf ? { spf } : {}),
    ...(dkim ? { dkim } : {}),
    ...(dmarc ? { dmarc } : {}),
  };
}
