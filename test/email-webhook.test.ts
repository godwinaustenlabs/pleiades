import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { STATUS_RANK, RESEND_EVENT_STATUS, verifyResendSignature } from '../src/email/webhook';
import { resetDatabase } from './helpers';

/**
 * Resend's delivery webhook.
 *
 * `POST /api/webhooks/resend` is **the only unauthenticated route in this system that
 * writes to the database.** There is no session and no grant behind it, so the signature
 * check is the entire authorization, and these tests treat it that way: the forgery cases
 * come first, and each asserts that nothing was written rather than only that the status
 * code was 401.
 *
 * The secret below is a throwaway used solely to compute valid signatures here. It has to
 * be real base64 after the `whsec_` prefix, because that is what the verifier decodes.
 */
const SECRET = 'whsec_cGxlaWFkZXNfdGVzdF9zZWNyZXRfMzJieXRlc19sb25n';

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Signs a body exactly the way Svix does, so a passing test proves interoperability. */
async function sign(body: string, id = 'msg_test', timestamp?: number): Promise<Headers> {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  const raw = atob(SECRET.replace(/^whsec_/, ''));
  const keyBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) keyBytes[i] = raw.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));

  return new Headers({
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': ts,
    'svix-signature': `v1,${b64(mac)}`,
  });
}

/**
 * Posts to the deployed route, the way Resend does.
 *
 * `SELF.fetch` runs the real Worker with its real bindings, so `RESEND_WEBHOOK_SECRET`
 * comes from `vitest.config.mts` and matches `SECRET` above. A binding cannot be unset
 * from in here, which is why the fail-closed case is asserted on the verifier directly.
 */
async function post(body: string, headers: Headers): Promise<Response> {
  const { SELF } = await import('cloudflare:test');
  return SELF.fetch('https://test.local/api/webhooks/resend', { method: 'POST', body, headers });
}

/** A message plus its delivery row, sitting at `sent` the way a real send leaves it. */
async function givenSentMessage(providerMessageId: string, status = 'sent') {
  const db = getDb(env);
  const id = `eml_wh_${providerMessageId}`;
  const box = await db.query.mailboxes.findFirst();
  await db.insert(schema.emailMessages).values({
    id,
    mailboxId: box!.id,
    direction: 'outbound',
    folder: 'sent',
    fromAddress: box!.address,
    toAddresses: JSON.stringify([{ email: 'someone@example.com' }]),
    subject: 'webhook fixture',
    bodyText: 'x',
    isRead: true,
    createdAt: new Date(),
  });
  await db.insert(schema.emailDelivery).values({
    messageId: id,
    status,
    attempts: 1,
    providerMessageId,
    idempotencyKey: `wh:${providerMessageId}`,
    queuedAt: new Date(),
    sentAt: new Date(),
  });
  return id;
}

const delivery = (id: string) =>
  getDb(env).query.emailDelivery.findFirst({ where: eq(schema.emailDelivery.messageId, id) });

const event = (type: string, emailId: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: emailId, ...extra },
  });

beforeAll(async () => { await resetDatabase(); });

describe('signature verification is the authorization', () => {
  it('refuses an unsigned request', async () => {
    const id = await givenSentMessage('re_unsigned');
    const res = await post(event('email.bounced', 're_unsigned'), new Headers({ 'content-type': 'application/json' }));
    expect(res.status).toBe(401);
    // The point: not merely refused, but nothing written.
    expect((await delivery(id))!.status).toBe('sent');
  });

  it('refuses a forged signature', async () => {
    const id = await givenSentMessage('re_forged');
    const body = event('email.bounced', 're_forged');
    const headers = new Headers({
      'content-type': 'application/json',
      'svix-id': 'msg_x',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const res = await post(body, headers);
    expect(res.status).toBe(401);
    expect((await delivery(id))!.status).toBe('sent');
  });

  /**
   * The body is signed, so altering it after signing must invalidate the signature.
   * This is what stops an attacker who has captured one genuine webhook from replaying
   * it with a different `email_id`.
   */
  it('refuses a body altered after signing', async () => {
    const id = await givenSentMessage('re_tampered');
    const original = event('email.delivered', 're_tampered');
    const headers = await sign(original);
    const altered = event('email.bounced', 're_tampered');
    const res = await post(altered, headers);
    expect(res.status).toBe(401);
    expect((await delivery(id))!.status).toBe('sent');
  });

  /** A captured request must not stay usable. */
  it('refuses a stale timestamp', async () => {
    const id = await givenSentMessage('re_stale_ts');
    const body = event('email.bounced', 're_stale_ts');
    const old = Math.floor(Date.now() / 1000) - 60 * 30;
    const res = await post(body, await sign(body, 'msg_old', old));
    expect(res.status).toBe(401);
    expect((await delivery(id))!.status).toBe('sent');
  });

  it('refuses a timestamp from the future beyond tolerance', async () => {
    const body = event('email.bounced', 're_future');
    const future = Math.floor(Date.now() / 1000) + 60 * 30;
    expect((await post(body, await sign(body, 'msg_f', future))).status).toBe(401);
  });

  /**
   * The most important test in the file.
   *
   * A missing secret is a misconfiguration, and the tempting graceful degradation —
   * accept it, log a warning — would let anyone on the internet rewrite delivery status.
   */
  it('refuses a perfectly signed request when the secret is not configured', async () => {
    const body = event('email.bounced', 're_nosecret');
    const headers = await sign(body);
    // Asserted on the verifier because a Worker binding cannot be unset from a test —
    // and the verifier is what the route's 401 depends on.
    await expect(verifyResendSignature(undefined, headers, body))
      .resolves.toMatchObject({ ok: false });
    await expect(verifyResendSignature('', headers, body))
      .resolves.toMatchObject({ ok: false });
    // Same request with the secret present is accepted, so the refusal is the secret's
    // absence and nothing else about the request.
    await expect(verifyResendSignature(SECRET, headers, body)).resolves.toEqual({ ok: true });
  });

  it('accepts a correctly signed request', async () => {
    const body = event('email.delivered', 're_good');
    await givenSentMessage('re_good');
    const res = await post(body, await sign(body));
    expect(res.status).toBe(200);
  });

  it('accepts the unprefixed webhook-* header spelling', async () => {
    const id = await givenSentMessage('re_altheaders');
    const body = event('email.delivered', 're_altheaders');
    const signed = await sign(body, 'msg_alt');
    const headers = new Headers({
      'content-type': 'application/json',
      'webhook-id': 'msg_alt',
      'webhook-timestamp': signed.get('svix-timestamp')!,
      'webhook-signature': signed.get('svix-signature')!,
    });
    expect((await post(body, headers)).status).toBe(200);
    expect((await delivery(id))!.status).toBe('delivered');
  });

  /** Rejections must not explain themselves to whoever is probing. */
  it('never explains why it refused', async () => {
    const res = await post(event('email.bounced', 're_x'), new Headers());
    const json = await res.json() as Record<string, unknown>;
    expect(json).toEqual({ ok: false });
    expect(JSON.stringify(json)).not.toMatch(/secret|signature|timestamp/i);
  });

  it('verifies against the real Svix construction', async () => {
    const body = '{"hello":"world"}';
    const headers = await sign(body, 'msg_direct');
    await expect(verifyResendSignature(SECRET, headers, body)).resolves.toEqual({ ok: true });
    // Same signature, different id — the id is part of the signed content.
    headers.set('svix-id', 'msg_other');
    await expect(verifyResendSignature(SECRET, headers, body)).resolves.toMatchObject({ ok: false });
  });
});

describe('applying events', () => {
  it('records delivery, which is the whole point', async () => {
    const id = await givenSentMessage('re_delivered');
    const body = event('email.delivered', 're_delivered');
    expect((await post(body, await sign(body))).status).toBe(200);

    const row = await delivery(id);
    expect(row!.status).toBe('delivered');
    expect(row!.deliveredAt).toBeInstanceOf(Date);
    // `sent_at` is when we handed it over and must survive as a separate fact.
    expect(row!.sentAt).toBeInstanceOf(Date);
  });

  it('records a hard bounce with a reason a person can act on', async () => {
    const id = await givenSentMessage('re_hard');
    const body = event('email.bounced', 're_hard', {
      bounce: { type: 'Hard', subType: 'General', message: 'The email account does not exist.' },
    });
    await post(body, await sign(body));

    const row = await delivery(id);
    expect(row!.status).toBe('bounced');
    expect(row!.errorCode).toBe('E_BOUNCE_HARD');
    expect(row!.errorMessage).toContain('does not exist');
  });

  it('distinguishes a soft bounce from a hard one', async () => {
    const id = await givenSentMessage('re_soft');
    const body = event('email.bounced', 're_soft', {
      bounce: { type: 'Soft', subType: 'MailboxFull', message: 'Mailbox full' },
    });
    await post(body, await sign(body));
    expect((await delivery(id))!.errorCode).toBe('E_BOUNCE_SOFT');
  });

  /**
   * A bounce is the receiving server's verdict and a complaint is worse than a bounce;
   * `next_attempt_at` must be null so the sweep leaves both alone. Retrying a complaint
   * is how a sending domain's reputation is destroyed.
   */
  it('does not leave a bounce or a complaint eligible for retry', async () => {
    for (const [pid, type] of [['re_nr1', 'email.bounced'], ['re_nr2', 'email.complained']] as const) {
      const id = await givenSentMessage(pid);
      const body = event(type, pid);
      await post(body, await sign(body));
      const row = await delivery(id);
      expect(row!.nextAttemptAt).toBeNull();
    }
  });

  it('records a complaint distinctly from a bounce', async () => {
    const id = await givenSentMessage('re_spam');
    const body = event('email.complained', 're_spam');
    await post(body, await sign(body));
    const row = await delivery(id);
    expect(row!.status).toBe('complained');
    expect(row!.errorCode).toBe('E_COMPLAINT');
  });

  it('clears a stale error once the message actually arrives', async () => {
    const db = getDb(env);
    const id = await givenSentMessage('re_recovered');
    await db.update(schema.emailDelivery)
      .set({ errorCode: 'E_TIMEOUT', errorMessage: 'transient' })
      .where(eq(schema.emailDelivery.messageId, id));

    const body = event('email.delivered', 're_recovered');
    await post(body, await sign(body));
    const row = await delivery(id);
    expect(row!.status).toBe('delivered');
    expect(row!.errorCode).toBeNull();
  });
});

describe('out-of-order and repeated delivery', () => {
  /**
   * Webhooks are redelivered on any non-2xx and are not ordered, so this is the ordinary
   * case rather than an exotic one. A bounce must not be cleared by a `delivered` that
   * was already superseded.
   */
  it('does not let a replayed delivered overwrite a bounce', async () => {
    const id = await givenSentMessage('re_order');

    const bounced = event('email.bounced', 're_order', { bounce: { type: 'Hard' } });
    await post(bounced, await sign(bounced, 'msg_b'));
    expect((await delivery(id))!.status).toBe('bounced');

    const delivered = event('email.delivered', 're_order');
    expect((await post(delivered, await sign(delivered, 'msg_d'))).status).toBe(200);
    expect((await delivery(id))!.status).toBe('bounced');
  });

  it('does not let a late sent event undo a delivery', async () => {
    const id = await givenSentMessage('re_late_sent');
    const delivered = event('email.delivered', 're_late_sent');
    await post(delivered, await sign(delivered, 'msg_1'));

    const sent = event('email.sent', 're_late_sent');
    await post(sent, await sign(sent, 'msg_2'));
    expect((await delivery(id))!.status).toBe('delivered');
  });

  it('is idempotent when the same event arrives twice', async () => {
    const id = await givenSentMessage('re_twice');
    const body = event('email.delivered', 're_twice');
    const headers = await sign(body, 'msg_same');
    await post(body, headers);
    const first = await delivery(id);
    await post(body, await sign(body, 'msg_same'));
    const second = await delivery(id);
    expect(second!.status).toBe(first!.status);
    expect(second!.deliveredAt?.getTime()).toBe(first!.deliveredAt?.getTime());
  });

  it('ranks a complaint above a bounce, and both above delivered', () => {
    expect(STATUS_RANK.complained).toBeGreaterThan(STATUS_RANK.bounced);
    expect(STATUS_RANK.bounced).toBeGreaterThan(STATUS_RANK.delivered);
    expect(STATUS_RANK.delivered).toBeGreaterThan(STATUS_RANK.sent);
    expect(STATUS_RANK.sent).toBeGreaterThan(STATUS_RANK.queued);
  });
});

describe('what it deliberately ignores', () => {
  /**
   * Read receipts were excluded from this system on purpose. They are dropped here rather
   * than stored and hidden — data that does not exist cannot leak, and this is the same
   * tracking the reader's blocked remote images refuse on the way in.
   */
  it('stores nothing for opens and clicks', async () => {
    for (const type of ['email.opened', 'email.clicked']) {
      const pid = `re_${type.replace('.', '_')}`;
      const id = await givenSentMessage(pid);
      const body = event(type, pid);
      expect((await post(body, await sign(body))).status).toBe(200);
      const row = await delivery(id);
      expect(row!.status).toBe('sent');
      expect(row!.lastEventAt).toBeNull();
      expect(row!.deliveredAt).toBeNull();
    }
  });

  it('never maps an open or a click to a status', () => {
    expect(RESEND_EVENT_STATUS['email.opened']).toBeUndefined();
    expect(RESEND_EVENT_STATUS['email.clicked']).toBeUndefined();
    expect(Object.values(RESEND_EVENT_STATUS)).not.toContain('opened');
  });

  /**
   * 200, not 500. Resend retries on a non-2xx, and a message can legitimately be absent
   * — pruned by retention, or sent by something else on the same domain. Retrying would
   * never make it appear.
   */
  it('accepts an event for a message it has no record of', async () => {
    const body = event('email.delivered', 're_nonexistent_id');
    expect((await post(body, await sign(body))).status).toBe(200);
  });

  it('accepts a signed payload that is not JSON rather than looping', async () => {
    const body = 'not json at all';
    expect((await post(body, await sign(body))).status).toBe(200);
  });

  it('accepts an unknown event type', async () => {
    const body = event('email.something_new', 're_unknown_type');
    expect((await post(body, await sign(body))).status).toBe(200);
  });
});
