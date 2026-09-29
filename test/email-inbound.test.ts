import { describe, it, expect, beforeAll } from 'vitest';
import { resetDatabase, tokenFor } from './helpers';
import { parseMessage, parseAddresses, decodeWords, authResults, splitMessage } from '../src/email/mime';
import { scoreMessage } from '../src/email/spam';

/**
 * Receiving mail.
 *
 * The MIME half runs against the parser directly. The delivery half drives
 * `handleInbound` with fabricated messages, because the behaviour worth pinning is
 * what happens to mail that does NOT parse cleanly or does not match anything —
 * that is where a mail system loses somebody's message, and the rule this
 * subsystem is built around is that nothing is ever dropped or rejected.
 */

const CRLF = '\r\n';

function raw(headers: Record<string, string>, body: string): string {
  return Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join(CRLF) + CRLF + CRLF + body;
}

describe('MIME: headers', () => {
  it('unfolds a wrapped header instead of losing its tail', () => {
    // A References chain almost always wraps in real mail. Treating each physical
    // line as a header drops every id but the first.
    const msg = `Subject: hello${CRLF} world${CRLF}References: <a@x>${CRLF}\t<b@x>${CRLF}${CRLF}body`;
    const { headers } = splitMessage(msg);
    expect(headers.get('subject')).toBe('hello world');
    expect(headers.get('references')).toBe('<a@x> <b@x>');
  });

  it('keeps the first of a duplicated header', () => {
    // A second From is a broken sender or a header-injection attempt, and the
    // first is what the receiving MTA validated DMARC against.
    const { headers } = splitMessage(`From: real@x${CRLF}From: forged@y${CRLF}${CRLF}b`);
    expect(headers.get('from')).toBe('real@x');
  });

  it('decodes RFC 2047 encoded words in both encodings', () => {
    expect(decodeWords('=?utf-8?B?SGVsbG8gd29ybGQ=?=')).toBe('Hello world');
    expect(decodeWords('=?utf-8?Q?Hello_world?=')).toBe('Hello world');
    // Undecodable is left visible rather than blanked.
    expect(decodeWords('=?bogus?X?zz?=')).toBe('=?bogus?X?zz?=');
  });

  it('parses address lists in every shape that actually arrives', () => {
    const parsed = parseAddresses('"Smith, John" <john@x.test>, bare@y.test, <third@z.test>');
    expect(parsed.map((a) => a.email)).toEqual(['john@x.test', 'bare@y.test', 'third@z.test']);
    expect(parsed[0].name).toBe('Smith, John');
  });

  it('reads the authentication verdicts and treats absence as unknown', () => {
    const { headers } = splitMessage(
      `Authentication-Results: mx.cloudflare.net; spf=pass; dkim=fail; dmarc=pass${CRLF}${CRLF}b`,
    );
    expect(authResults(headers)).toEqual({ spf: 'pass', dkim: 'fail', dmarc: 'pass' });
    expect(authResults(splitMessage(`Subject: x${CRLF}${CRLF}b`).headers)).toEqual({});
  });
});

describe('MIME: bodies', () => {
  it('decodes quoted-printable including soft line breaks', () => {
    const m = parseMessage(raw(
      { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Transfer-Encoding': 'quoted-printable' },
      'caf=C3=A9 and a very long line that=\r\n continues here',
    ));
    expect(m.text).toContain('café');
    expect(m.text).toContain('continues here');
  });

  it('decodes base64', () => {
    const m = parseMessage(raw(
      { 'Content-Type': 'text/plain', 'Content-Transfer-Encoding': 'base64' },
      btoa('plain text body'),
    ));
    expect(m.text).toBe('plain text body');
  });

  it('pulls the text part out of a multipart/alternative', () => {
    const body = [
      '--BOUND',
      'Content-Type: text/plain',
      '',
      'the plain part',
      '--BOUND',
      'Content-Type: text/html',
      '',
      '<p>the html part</p>',
      '--BOUND--',
    ].join(CRLF);
    const m = parseMessage(raw({ 'Content-Type': 'multipart/alternative; boundary="BOUND"' }, body));
    expect(m.text.trim()).toBe('the plain part');
    expect(m.html).toContain('the html part');
  });

  it('extracts an attachment and keeps it out of the body', () => {
    const body = [
      '--B',
      'Content-Type: text/plain',
      '',
      'see attached',
      '--B',
      'Content-Type: application/pdf; name="invoice.pdf"',
      'Content-Disposition: attachment; filename="invoice.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa('%PDF-1.4 fake'),
      '--B--',
    ].join(CRLF);
    const m = parseMessage(raw({ 'Content-Type': 'multipart/mixed; boundary="B"' }, body));
    expect(m.text.trim()).toBe('see attached');
    expect(m.attachments).toHaveLength(1);
    expect(m.attachments[0].filename).toBe('invoice.pdf');
    expect(new TextDecoder().decode(m.attachments[0].content)).toContain('%PDF');
  });

  it('always produces a text body, even from an HTML-only message', () => {
    // body_text is NOT NULL and the reader never renders a stranger's HTML, so
    // with no text part there would be nothing at all to show.
    const m = parseMessage(raw(
      { 'Content-Type': 'text/html' },
      '<html><style>p{color:red}</style><p>Hello</p><br><p>World</p></html>',
    ));
    expect(m.text).toContain('Hello');
    expect(m.text).toContain('World');
    expect(m.text).not.toContain('<p>');
    expect(m.text).not.toContain('color:red');
  });

  it('survives a multipart with no boundary rather than losing the message', () => {
    const m = parseMessage(raw({ 'Content-Type': 'multipart/mixed' }, 'orphaned body'));
    expect(m.text).toContain('orphaned body');
  });

  it('survives a message that is not MIME at all', () => {
    const m = parseMessage('this is not a message');
    expect(m.text).toContain('this is not a message');
    expect(m.from.email).toBe('unknown@invalid');
  });

  it('bounds nesting instead of overflowing the stack', () => {
    // A message crafted with hundreds of nested multiparts is a denial of service
    // on a handler that is not allowed to throw.
    let body = 'deep';
    for (let i = 0; i < 40; i += 1) {
      body = [`--B${i}`, `Content-Type: multipart/mixed; boundary="B${i + 1}"`, '', body, `--B${i}--`].join(CRLF);
    }
    expect(() => parseMessage(raw({ 'Content-Type': 'multipart/mixed; boundary="B0"' }, body))).not.toThrow();
  });

  it('collects the reference chain for threading', () => {
    const m = parseMessage(raw(
      { References: '<one@x> <two@x>', 'In-Reply-To': '<two@x>', 'Message-ID': '<three@x>' },
      'reply body',
    ));
    expect(m.references).toEqual(['<one@x>', '<two@x>']);
    expect(m.messageId).toBe('<three@x>');
  });
});

describe('spam scoring', () => {
  const msg = (subject: string, text: string, from = 'delivered+stranger@resend.dev') =>
    parseMessage(raw({ From: from, Subject: subject }, text));

  it('trusts a DMARC pass', () => {
    const v = scoreMessage(msg('Quarterly review', 'Here are the numbers.'), { dmarc: 'pass' }, ['godwinausten.org']);
    expect(v.verdict).toBe('ham');
  });

  it('flags a forged internal sender hardest', () => {
    // The case worth catching above every other: an internal-looking From is what
    // makes invoice redirection and "the CEO needs a transfer" work. Our own DMARC
    // record exists so a receiver can tell, and here we are the receiver.
    const v = scoreMessage(
      msg('Urgent payment', 'Please wire the funds today.', 'ceo@godwinausten.org'),
      { dmarc: 'fail' },
      ['godwinausten.org'],
    );
    expect(v.verdict).toBe('spam');
  });

  it('does not flag an ordinary message that merely failed SPF', () => {
    // A forwarded message breaks SPF routinely. Filing it as spam on that alone
    // would put mailing lists and forwarded client threads in the spam folder.
    const v = scoreMessage(msg('Re: contract', 'Sounds good, thanks.'), { spf: 'fail', dmarc: 'pass' }, ['godwinausten.org']);
    expect(v.verdict).not.toBe('spam');
  });

  it('reports unknown rather than ham when nothing authenticated', () => {
    const v = scoreMessage(msg('Hello', 'A normal note.'), {}, ['godwinausten.org']);
    expect(v.verdict).toBe('unknown');
  });
});

// ── Delivery ────────────────────────────────────────────────────────────────

function fakeMessage(to: string, from: string, content: string) {
  return {
    from,
    to,
    rawSize: content.length,
    raw: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(content));
        controller.close();
      },
    }),
  };
}

async function deliver(to: string, from: string, headers: Record<string, string>, body: string) {
  const { env } = await import('cloudflare:test');
  const { handleInbound } = await import('../src/email/inbound');
  await handleInbound(fakeMessage(to, from, raw({ From: from, To: to, ...headers }, body)), env);
}

async function rows(mailboxId: string) {
  const { env } = await import('cloudflare:test');
  const { results } = await env.DB.prepare(
    'SELECT message_id, folder, subject, from_address, thread_id, body_text, raw_key, spam_verdict FROM email_messages WHERE mailbox_id = ? AND direction = ?',
  ).bind(mailboxId, 'inbound').all<Record<string, string>>();
  return results;
}

beforeAll(async () => {
  await resetDatabase();
});

describe('inbound delivery', () => {
  it('files a message into the addressed mailbox', async () => {
    await deliver('hr@godwinausten.org', 'delivered+applicant@resend.dev', { Subject: 'Application' }, 'CV attached, thanks.');
    const found = (await rows('mbx_hr')).find((r) => r.subject === 'Application');
    expect(found).toBeTruthy();
    expect(found!.folder).toBe('inbox');
    expect(found!.from_address).toBe('delivered+applicant@resend.dev');
    expect(found!.body_text).toContain('CV attached');
  });

  it('follows an alias one hop into its target', async () => {
    // info@ is an alias for hr@ in the fixture.
    await deliver('info@godwinausten.org', 'delivered+curious@resend.dev', { Subject: 'Question' }, 'What do you do?');
    const found = (await rows('mbx_hr')).find((r) => r.subject === 'Question');
    expect(found).toBeTruthy();
  });

  it('sends mail for an unknown address to the catch-all rather than bouncing', async () => {
    // A bounce tells a stranger which of our addresses exist.
    await deliver('nobody-here@godwinausten.org', 'delivered+typo@resend.dev', { Subject: 'Mistyped' }, 'oops');
    const found = (await rows('mbx_catchall')).find((r) => r.subject === 'Mistyped');
    expect(found).toBeTruthy();
  });

  it('discards mail addressed to the system mailbox', async () => {
    await deliver('no-reply@godwinausten.org', 'delivered+chatty@resend.dev', { Subject: 'thanks!' }, 'ok');
    const found = (await rows('mbx_system')).find((r) => r.subject === 'thanks!');
    expect(found).toBeUndefined();
  });

  it('threads a reply onto the message it answers', async () => {
    const { env } = await import('cloudflare:test');
    // Stand in for a message we sent, recording the Message-ID a reply will quote.
    await env.DB.prepare(
      "INSERT INTO email_threads (thread_id, mailbox_id, subject, last_message_at, message_count, created_at) " +
      "VALUES ('thr_known','mbx_hr','Offer',0,1,0)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO email_messages (message_id, mailbox_id, thread_id, direction, folder, from_address, to_addresses, subject, body_text, message_id_header, is_read, is_starred, created_at) " +
      "VALUES ('eml_sent','mbx_hr','thr_known','outbound','sent','hr@godwinausten.org','[]','Offer','the offer','<offer-1@godwinausten.org>',1,0,0)",
    ).run();

    await deliver(
      'hr@godwinausten.org',
      'delivered+candidate@resend.dev',
      { Subject: 'Re: Offer', 'In-Reply-To': '<offer-1@godwinausten.org>', References: '<offer-1@godwinausten.org>' },
      'I accept.',
    );

    const found = (await rows('mbx_hr')).find((r) => r.subject === 'Re: Offer');
    expect(found).toBeTruthy();
    expect(found!.thread_id).toBe('thr_known');
  });

  it('files an unmatchable message rather than dropping it', async () => {
    await deliver(
      'hr@godwinausten.org',
      'delivered+ghost@resend.dev',
      { Subject: 'Out of nowhere', 'In-Reply-To': '<never-sent@elsewhere.test>' },
      'no thread for this',
    );
    const found = (await rows('mbx_hr')).find((r) => r.subject === 'Out of nowhere');
    expect(found).toBeTruthy();
    // A new thread of its own, not null and not somebody else's.
    expect(found!.thread_id).toBeTruthy();
    expect(found!.thread_id).not.toBe('thr_known');
  });

  it('files suspected spam in the spam folder instead of discarding it', async () => {
    await deliver(
      'hr@godwinausten.org',
      'ceo@godwinausten.org',
      { Subject: 'Urgent wire transfer', 'Authentication-Results': 'mx; dmarc=fail' },
      'Please act now and wire transfer the unclaimed funds.',
    );
    const found = (await rows('mbx_hr')).find((r) => r.subject === 'Urgent wire transfer');
    expect(found).toBeTruthy();
    expect(found!.folder).toBe('spam');
    expect(found!.spam_verdict).toBe('spam');
  });

  it('stores an unparseable message rather than losing it', async () => {
    const { env } = await import('cloudflare:test');
    const { handleInbound } = await import('../src/email/inbound');
    await handleInbound(fakeMessage('hr@godwinausten.org', 'delivered+odd@resend.dev', 'not a message at all'), env);
    const all = await rows('mbx_hr');
    // It lands with the raw text as its body: a message that arrived and could not
    // be read is still a message that arrived.
    expect(all.some((r) => (r.body_text ?? '').includes('not a message at all'))).toBe(true);
  });

  it('never throws, whatever it is handed', async () => {
    const { env } = await import('cloudflare:test');
    const { handleInbound } = await import('../src/email/inbound');
    const controlChars = String.fromCharCode(0, 1, 2);
    // A thrown email() handler bounces or loses real mail.
    await expect(handleInbound(fakeMessage('', '', ''), env)).resolves.toBeUndefined();
    await expect(
      handleInbound(fakeMessage('hr@godwinausten.org', 'x@y.test', `${controlChars} binary garbage`), env),
    ).resolves.toBeUndefined();
  });
});

describe('stored mail is readable only through its mailbox', () => {
  it('refuses a guessed key that no message row claims', async () => {
    const { SELF } = await import('cloudflare:test');
    const res = await SELF.fetch(
      `https://test.local/api/assets/download/${encodeURIComponent('email-raw/mbx_hr/raw_guessed.eml')}`,
      { headers: { Authorization: `Bearer ${await tokenFor('ceo')}` } },
    );
    // An orphan in the bucket is not something to reason about, so even a
    // superadmin is refused rather than served.
    expect(res.status).toBe(403);
  });
});

describe('the Free plan CPU budget', () => {
  it('stores an oversized message with a placeholder body rather than risking a timeout', async () => {
    const { env } = await import('cloudflare:test');
    const { handleInbound } = await import('../src/email/inbound');

    // Workers Free allows 10ms CPU per invocation. Being killed mid-parse leaves
    // the raw message in R2 with no row behind it — received, stored, and
    // invisible. A placeholder row is strictly better than that gamble.
    const huge = raw(
      { From: 'delivered+bulk@resend.dev', To: 'hr@godwinausten.org', Subject: 'Big attachment' },
      'x'.repeat(700 * 1024),
    );
    await handleInbound(fakeMessage('hr@godwinausten.org', 'delivered+bulk@resend.dev', huge), env);

    const found = (await rows('mbx_hr')).find((r) => r.subject === 'Big attachment');
    expect(found).toBeTruthy();
    expect(found!.body_text).toContain('too large to render');
    // The headers were still read, so authentication and threading are intact.
    expect(found!.from_address).toBe('delivered+bulk@resend.dev');
  });
});
