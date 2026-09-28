import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { generateToken, sha256hex } from '../utils/token';
import { appUrl, dispatch } from './events';

/**
 * Password reset, by email.
 *
 * The flow this plugs into already existed in `src/routes/auth.ts` and was well
 * built — a hashed single-use token, an expiry, an HR approval step, and a
 * response that is identical whether or not the account exists so the endpoint
 * cannot be used to enumerate staff. What it never had was delivery: the raw
 * token was generated, hashed, and dropped on the floor, so no reset could
 * actually be completed by anybody.
 *
 * Three decisions here are security decisions, not conveniences:
 *
 *  1. **The email carries a link, never a password.** Mailing a freshly generated
 *     password and setting it live would mean anyone who knows an address can
 *     change someone's credentials without ever reading the mail — locking the
 *     real user out — and would leave a working password sitting in a mailbox
 *     forever. Both are worse in this system than in most, because once the apex
 *     MX moves to Cloudflare that mailbox is a row in D1.
 *
 *  2. **The token is minted at APPROVAL, not at request.** A reset request is
 *     unauthenticated, so anything sent at request time is something a stranger
 *     can cause to be sent to any staff address, repeatedly. Minting at approval
 *     means no token exists in any inbox until a human decided one should. The
 *     row from step 1 stores a hash of a token that is then replaced, which is
 *     why this rewrites `token_hash` rather than reusing it.
 *
 *  3. **It goes to `recovery_email` and nowhere else.** `users_logins.email` is
 *     the login identifier and, after the mail cutover, a mailbox inside
 *     Pleiades — so sending a reset there tells a locked-out person to read a
 *     mailbox they cannot log in to reach. An unset or same-domain recovery
 *     address is refused with a reason, never silently substituted.
 */

/** How long an approved link lives. Short: the 24h on the request row is the
 *  window for HR to act, not the window for a bearer credential to sit in an inbox. */
const APPROVED_TOKEN_MINUTES = 60;

export type ResetMailResult = { sent: true; messageId: string } | { sent: false; reason: string };

/** The domains whose mailboxes this system will itself hold. See decision 3. */
const SELF_HOSTED_DOMAINS = ['godwinausten.org'];

function isSelfHosted(address: string): boolean {
  const domain = address.slice(address.lastIndexOf('@') + 1).toLowerCase();
  return SELF_HOSTED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Checks an address is usable for recovery. Exported so the admin route that
 * *sets* `recovery_email` can refuse a bad one at the point of entry, rather
 * than storing it and failing months later when somebody is locked out.
 */
export function validateRecoveryAddress(address: string | null | undefined): string | null {
  if (!address || !address.includes('@')) return 'A recovery address is required, and must be a valid email address.';
  if (isSelfHosted(address)) {
    return `${address} is on a domain this system hosts the mail for. A recovery address has to be reachable when Pleiades is not — otherwise resetting a password requires already being able to log in.`;
  }
  return null;
}

/**
 * Called when a reset request is approved. Mints the token, shortens the expiry,
 * and mails the link.
 *
 * Returns a reason rather than throwing, so the approving route can tell HR
 * exactly why nothing was sent — "this person has no recovery address on file" is
 * an instruction, whereas a 500 is a mystery.
 */
export async function sendResetApprovedEmail(env: Env, tokenId: string): Promise<ResetMailResult> {
  try {
    const db = getDb(env);

    const record = await db.query.passwordResetTokens.findFirst({
      where: eq(schema.passwordResetTokens.id, tokenId),
    });
    if (!record) return { sent: false, reason: 'That reset request no longer exists.' };
    if (record.status !== 'approved') return { sent: false, reason: `The request is "${record.status}", not approved.` };

    const user = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, record.userId),
      columns: { id: true, name: true, email: true, recoveryEmail: true, isActive: true, isSuperadmin: true },
    });
    if (!user) return { sent: false, reason: 'That user no longer exists.' };
    if (!user.isActive) return { sent: false, reason: 'That account is deactivated; a reset would not let them in anyway.' };

    /**
     * A superadmin's password is never reset by email. This is the last link in an
     * escalation chain that only existed once this file started delivering tokens:
     *
     *   1. `PATCH /admin/users/:id` accepts `recoveryEmail` for ANY user, so a
     *      holder of admin/users edit points a superadmin's recovery address at
     *      their own inbox.
     *   2. `POST /auth/request-reset` is unauthenticated and creates the row.
     *   3. `POST /admin/pending-resets/:id/approve` treats admin/users edit as
     *      blanket authority and skips the user_ownership check.
     *   4. The token arrives at the attacker, who sets the superadmin's password.
     *
     * Both of those grants are handed out through the Access page, so the cost is
     * two ordinary admin permissions and the prize is everything. Before delivery
     * existed the chain was inert — the token was minted and discarded — which is
     * exactly why wiring up the email had to close it.
     *
     * Refused here rather than only at step 1 because this is the narrowest point:
     * it holds however the recovery address came to say what it says. `is_superadmin`
     * is set only by direct database access, and so is a superadmin's password.
     */
    if (user.isSuperadmin) {
      return {
        sent: false,
        reason: 'This account is a superadmin. Its password is reset by direct database access, never by email — the same rule that governs the flag itself.',
      };
    }

    const addressProblem = validateRecoveryAddress(user.recoveryEmail);
    if (addressProblem) {
      return { sent: false, reason: `${addressProblem} Set one on their user record, then approve again.` };
    }

    // Replace the token. The one hashed at request time was never delivered and
    // is now unreachable by design; this is the only token that will ever be in
    // anybody's hands, and it starts its life here.
    const rawToken = generateToken();
    const expiresAt = new Date(Date.now() + APPROVED_TOKEN_MINUTES * 60 * 1000);

    await db.update(schema.passwordResetTokens)
      .set({ tokenHash: await sha256hex(rawToken), expiresAt })
      .where(eq(schema.passwordResetTokens.id, tokenId));

    const result = await dispatch(env, {
      event: 'password_reset',
      to: [{ email: user.recoveryEmail!, ...(user.name ? { name: user.name } : {}) }],
      values: {
        userName: user.name ?? 'there',
        resetUrl: appUrl(env, `/reset?token=${rawToken}`),
        expiresAt: `in ${APPROVED_TOKEN_MINUTES} minutes`,
      },
      // One email per approval. Re-approving an already-approved request does not
      // re-mail; a genuine second attempt is a new request row with a new id.
      idempotencyKey: `password_reset:${tokenId}`,
      recipientUserId: user.id,
    });

    if (!result.sent) {
      // The token has already been rotated at this point, which is the safe
      // direction to fail in: the undelivered token is unusable by anyone.
      return { sent: false, reason: result.reason };
    }
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    console.error('[email] sendResetApprovedEmail failed:', err);
    return { sent: false, reason: 'Internal error while sending the reset email.' };
  }
}

/**
 * Tells HR a request is waiting.
 *
 * Goes to HR's own app mailbox, not to the requester — the requester already got
 * the "queued for approval" response, and a stranger who guessed an address
 * should not be able to make mail appear in that person's inbox. Without this
 * nothing announced a pending request at all: it sat on
 * `GET /admin/pending-resets` until somebody thought to look.
 */
export async function notifyResetRequested(env: Env, userId: string, tokenId: string): Promise<ResetMailResult> {
  try {
    const db = getDb(env);

    const hrMailbox = await db.query.mailboxes.findFirst({
      where: and(
        eq(schema.mailboxes.kind, 'app'),
        eq(schema.mailboxes.appName, 'hr'),
        eq(schema.mailboxes.isActive, true),
      ),
    });
    if (!hrMailbox) return { sent: false, reason: 'No active HR mailbox to notify.' };

    const user = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, userId),
      columns: { name: true, email: true },
    });
    if (!user) return { sent: false, reason: 'That user no longer exists.' };

    return await dispatch(env, {
      event: 'reset_requested',
      to: [{ email: hrMailbox.address, ...(hrMailbox.displayName ? { name: hrMailbox.displayName } : {}) }],
      values: {
        userName: user.name ?? user.email,
        userEmail: user.email,
        approvalUrl: appUrl(env, '/admin'),
        requestedAt: new Date().toISOString(),
      },
      idempotencyKey: `reset_requested:${tokenId}`,
      recipientUserId: null,
    }).then((r) => (r.sent ? { sent: true as const, messageId: r.messageId } : { sent: false as const, reason: r.reason }));
  } catch (err) {
    console.error('[email] notifyResetRequested failed:', err);
    return { sent: false, reason: 'Internal error while notifying HR.' };
  }
}
