import { Hono } from 'hono';
import { Env } from '../index';
import { applyResendEvent, verifyResendSignature } from '../email/webhook';

/**
 * Inbound webhooks from services we call out to.
 *
 * **A separate router, mounted at its own top-level path, because this is a different
 * trust domain from the rest of the API.** Every other router begins with
 * `authMiddleware`; these routes have no session, no user and no grants, and are
 * authorized purely by a signature over the request body. Hanging them off
 * `/api/email` would have meant either an auth exemption inside a router whose whole
 * premise is that everything in it is authenticated, or a path that only works because
 * of Hono's matching order. Neither is something to leave for the next person to
 * discover.
 *
 * Nothing here returns data. A webhook endpoint that answers questions is an
 * unauthenticated read.
 */
export const webhooksRouter = new Hono<{ Bindings: Env }>();

/**
 * Resend delivery events — the difference between "we handed it over" and "it arrived".
 *
 * Two rules govern the responses, and they pull in opposite directions:
 *
 * 1. **A rejected request says nothing.** The body is a bare `ok: false` with no reason,
 *    because the reasons — bad signature, stale timestamp, unconfigured secret — are a
 *    map for anybody probing the endpoint. The detail goes to the logs instead.
 * 2. **An accepted-but-unusable request still answers 200.** Resend retries on any
 *    non-2xx, so returning 500 for an event naming a message we pruned, or for a type we
 *    deliberately ignore, buys an indefinite retry loop and no new information. 4xx/5xx
 *    is reserved for "this was not Resend" and "we failed to write".
 */
webhooksRouter.post('/resend', async (c) => {
  /**
   * The raw bytes, read before anything else. The signature covers exactly what was
   * sent, so parsing first and re-serialising guarantees a mismatch on every request.
   */
  const rawBody = await c.req.text();

  const verified = await verifyResendSignature(
    c.env.RESEND_WEBHOOK_SECRET,
    c.req.raw.headers,
    rawBody,
  );
  if (!verified.ok) {
    console.warn(`[email:webhook] rejected: ${verified.reason}`);
    return c.json({ ok: false }, 401);
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    // Signed by Resend and still not JSON: log it and accept, because a retry will
    // produce the same unparseable bytes.
    console.error('[email:webhook] signed payload was not JSON');
    return c.json({ ok: true }, 200);
  }

  try {
    const result = await applyResendEvent(c.env, event);
    switch (result.outcome) {
      case 'applied':
        console.log(`[email:webhook] ${result.messageId} -> ${result.status}`);
        break;
      case 'unknown':
        console.warn(`[email:webhook] no delivery row for ${result.providerMessageId}`);
        break;
      case 'stale':
        console.log(`[email:webhook] ignored ${result.status}; row already ${result.had}`);
        break;
      case 'ignored':
        // Read receipts land here by design — see src/email/webhook.ts.
        break;
    }
    return c.json({ ok: true }, 200);
  } catch (err) {
    /**
     * The one case that genuinely wants a retry: we could not write. Answering 200 here
     * would silently drop a real bounce, which is the exact failure this endpoint exists
     * to fix.
     */
    console.error('[email:webhook] failed to apply event', err);
    return c.json({ ok: false }, 500);
  }
});
