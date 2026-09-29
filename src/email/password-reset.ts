import { eq, gte } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { generateId } from '../utils/id';
import { generateToken, sha256hex } from '../utils/token';
import { appUrl, dispatch } from './events';

/**
 * Self-service password reset.
 *
 * A person who has forgotten their password types their email or username, and a
 * single-use link arrives at their address. There is no approval step: the earlier
 * design queued the request for an HR manager, which meant somebody locked out at
 * 9pm stayed locked out until a colleague noticed a queue.
 *
 * Removing that step took a protection with it, and the replacement matters. HR
 * approval was the reason an unauthenticated stranger could not cause mail to be
 * sent — every request went into a queue and nothing left the building until a
 * human acted. Now a request sends mail immediately, so this endpoint is a thing a
 * stranger can point at a colleague's inbox. Two things bound that: a per-account
 * rate limit here, and the fact that each new request supersedes the previous
 * token, so spamming it produces one usable link rather than a drawer full.
 *
 * Three properties are load-bearing and each has a test:
 *
 *  1. **The response never reveals whether an account exists.** Identical bytes for
 *     a real address, an unknown one, a rate-limited one and a superadmin.
 *  2. **A superadmin is never resettable this way.** See the note on
 *     `issueResetLink` — removing the approval step made that escalation path
 *     SHORTER, not longer.
 *  3. **The link goes to an address the person can read while locked out.** Which
 *     is not their company address, now that Pleiades holds the mail for it.
 */

/** How long a link lives. Short on purpose: it is a bearer credential in an inbox. */
const TOKEN_MINUTES = 10;

/** Requests per account per hour before further ones are quietly ignored. */
const MAX_REQUESTS_PER_HOUR = 3;

/** Domains whose mail this system holds, and which therefore cannot receive a reset. */
const SELF_HOSTED_DOMAINS = ['godwinausten.org'];

export type ResetOutcome =
  | { sent: true; messageId: string }
  /**
   * `reason` is for the log, never for the response. Every caller returns the same
   * bytes to the client whatever this says — see property 1.
   */
  | { sent: false; reason: string };

function isSelfHosted(address: string): boolean {
  const domain = address.slice(address.lastIndexOf('@') + 1).toLowerCase();
  return SELF_HOSTED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Checks an address is usable for recovery. Exported so the admin route that SETS
 * `recovery_email` can refuse a bad one at the point of entry, rather than storing
 * it and failing months later when somebody is locked out.
 */
export function validateRecoveryAddress(address: string | null | undefined): string | null {
  if (!address || !address.includes('@')) return 'A recovery address is required, and must be a valid email address.';
  if (isSelfHosted(address)) {
    return `${address} is on a domain this system hosts the mail for. A recovery address has to be reachable when Pleiades is not — otherwise resetting a password requires already being able to log in.`;
  }
  return null;
}

/**
 * Where a reset link can actually be read.
 *
 * `recovery_email` first, because somebody who set one meant it. Otherwise the login
 * address, but only when it is NOT on a domain this system holds the mail for —
 * sending a reset to a Pleiades-hosted mailbox tells a locked-out person to log in
 * to read the email that lets them log in.
 *
 * That distinction is live rather than theoretical here: six of the nine accounts
 * log in on an external domain and work with no setup at all, while the ones on
 * godwinausten.org need a recovery address on file.
 */
export function resetDestination(user: { email: string; recoveryEmail?: string | null }):
  { address: string } | { problem: string } {
  if (user.recoveryEmail) {
    const bad = validateRecoveryAddress(user.recoveryEmail);
    return bad ? { problem: bad } : { address: user.recoveryEmail };
  }
  if (!isSelfHosted(user.email)) return { address: user.email };
  return {
    problem: `${user.email} is on a domain this system hosts the mail for, so a reset sent there could not be read while locked out. Set a recovery address on this account.`,
  };
}

/**
 * Mints a single-use link and sends it. Assumes the caller has already resolved the
 * account; it makes no decision about whether the request was legitimate.
 *
 * Never throws, and never reports anything the caller should pass to a client.
 */
export async function issueResetLink(
  env: Env,
  user: { id: string; name?: string | null; email: string; recoveryEmail?: string | null; isActive?: boolean | null; isSuperadmin?: boolean | null },
): Promise<ResetOutcome> {
  try {
    const db = getDb(env);

    if (user.isActive === false) return { sent: false, reason: 'Account is deactivated.' };

    /**
     * A superadmin's password is never reset by email, and this guard matters MORE
     * now than it did under the approval flow, not less.
     *
     * The escalation chain used to be four steps and needed two grants: point a
     * superadmin's `recovery_email` at your own inbox (admin/users edit), request a
     * reset, approve it yourself (admin/resets edit), collect the token. With
     * approval gone it is three steps and needs ONE grant — the approval step was
     * the second permission. So removing it shortened the path, and this is what
     * closes it, together with the refusal in PATCH /admin/users/:id to let anybody
     * but the account itself change a superadmin's recovery address.
     *
     * `is_superadmin` is set only by direct database access. So is a superadmin's
     * password.
     */
    if (user.isSuperadmin) {
      return { sent: false, reason: 'Superadmin accounts are reset by direct database access only.' };
    }

    // Rate limit, counted from the rows rather than tracked, so it cannot drift.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await db.query.passwordResetTokens.findMany({
      where: gte(schema.passwordResetTokens.requestedAt, hourAgo),
    });
    if (recent.filter((r) => r.userId === user.id).length >= MAX_REQUESTS_PER_HOUR) {
      return { sent: false, reason: `More than ${MAX_REQUESTS_PER_HOUR} requests in an hour for this account.` };
    }

    const destination = resetDestination(user);
    if ('problem' in destination) return { sent: false, reason: destination.problem };

    /**
     * Supersede every earlier token for this account before minting a new one, so
     * that repeated requests leave exactly one usable link rather than a drawer of
     * them. This is also what makes the rate limit safe to set low: a second request
     * is never the thing that rescues a person whose first link went astray, because
     * it invalidates the first.
     */
    for (const prior of recent.filter((r) => r.userId === user.id && r.status !== 'used')) {
      await db.update(schema.passwordResetTokens)
        .set({ status: 'expired' })
        .where(eq(schema.passwordResetTokens.id, prior.id));
    }

    const rawToken = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_MINUTES * 60 * 1000);
    const id = generateId('rst');

    await db.insert(schema.passwordResetTokens).values({
      id,
      userId: user.id,
      tokenHash: await sha256hex(rawToken),
      requestedAt: now,
      expiresAt,
      /**
       * Recorded as `approved` with no approver, which is what self-service means in
       * this table. `complete-reset` accepts only that status, and the null
       * `approved_by_user_id` is what distinguishes these rows from the ones a human
       * signed off under the old flow.
       */
      status: 'approved',
      approvedByUserId: null,
      approvedAt: now,
    });

    const result = await dispatch(env, {
      event: 'password_reset',
      to: [{ email: destination.address, ...(user.name ? { name: user.name } : {}) }],
      values: {
        userName: user.name ?? 'there',
        resetUrl: appUrl(env, `/reset?token=${rawToken}`),
        expiresAt: `in ${TOKEN_MINUTES} minutes`,
      },
      idempotencyKey: `password_reset:${id}`,
      recipientUserId: user.id,
    });

    if (!result.sent) {
      // The token is already minted and unusable by anybody, which is the safe
      // direction to fail in.
      return { sent: false, reason: result.reason };
    }
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    console.error('[email] issueResetLink failed:', err);
    return { sent: false, reason: 'Internal error while issuing the reset link.' };
  }
}
