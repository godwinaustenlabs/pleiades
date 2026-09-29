import { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { UserPayload } from '../middleware/auth';
import { actorEmployeeId, checkFeaturePermission } from '../middleware/rbac';

/**
 * Who may use which mailbox.
 *
 * There is exactly one implementation of this question, for the same reason
 * `rbac.ts` is the only authorization path in the system: two of them is two
 * answers, and the one that is wrong is the one nobody tested. Every route,
 * every R2 read rule and the inbound handler go through `canUseMailbox`.
 *
 * Access has three sources and they are not a fallback chain — the order below is
 * load-bearing:
 *
 *   1. A personal mailbox is reachable by the person it belongs to. No grant is
 *      involved; ownership *is* the permission. This is the same reasoning that
 *      makes `dashboard` app-gated rather than feature-gated — every handler
 *      already filters on the caller's own id.
 *   1b. An APPOINTMENT mailbox (cto@) is reachable by whoever holds that
 *      appointment right now. Also ownership rather than a grant, and it takes no
 *      `mailbox_grants` rows at all — the entire point is that appointing
 *      somebody confers the mailbox, so a grant list able to deny the holder
 *      would reinstate the manual step this model removes. Somebody holding two
 *      posts reads both addresses in one workspace, which is what it is for.
 *   2. If any `mailbox_grants` row exists for an APP mailbox, those rows are the
 *      only thing that decides and the app grant stops applying. That is what lets
 *      `payroll@` be narrower than `hr/email` without requiring a row for the
 *      ninety per cent of mailboxes that need no exception.
 *   3. Otherwise an app mailbox is reachable through `<app>/email`, which is an
 *      ordinary feature managed on the Access page like every other one.
 *
 * Anything else is refused. A `kind` this function does not recognise is not
 * reachable, rather than being waved through on the assumption it is harmless.
 */

/**
 * `bulk` is a third level rather than a fourth feature, so it rides the existing
 * view/edit/delete ladder instead of adding `<app>/email_bulk` to every app.
 * Mailing fifty strangers at once is the act most likely to cost the company its
 * sending reputation, and it should not be the same permission as answering one
 * client.
 */
export type MailboxAccess = 'read' | 'send' | 'bulk';

/** More than this many recipients in one action needs `bulk`. */
export const BULK_RECIPIENT_THRESHOLD = 10;

type MailboxRow = typeof schema.mailboxes.$inferSelect;
type MailCtx = Context<{ Bindings: Env; Variables: { user: UserPayload } }>;

/** read→view, send→edit, bulk→delete. checkFeaturePermission already does delete⊃edit⊃view. */
const levelFor = (access: MailboxAccess) =>
  access === 'read' ? 'view' as const : access === 'send' ? 'edit' as const : 'delete' as const;

export async function loadMailbox(env: Env, mailboxId: string): Promise<MailboxRow | null> {
  const db = getDb(env);
  const row = await db.query.mailboxes.findFirst({ where: eq(schema.mailboxes.id, mailboxId) });
  return row ?? null;
}

/**
 * Resolves a recipient address to the mailbox that should store it.
 *
 * Follows an alias exactly one hop. A chain longer than that is not supported on
 * purpose: two hops is a graph, a graph admits a cycle, and a cycle in the
 * inbound path is an infinite loop inside a handler that is not allowed to throw.
 *
 * Returns the catch-all when nothing matches, and null only when there is no
 * catch-all either — in which case the caller stores the message against nothing
 * and logs it, rather than rejecting a stranger's mail.
 */
export async function resolveInboundMailbox(env: Env, address: string): Promise<MailboxRow | null> {
  const db = getDb(env);
  const wanted = address.trim().toLowerCase();

  const direct = await db.query.mailboxes.findFirst({
    where: and(eq(schema.mailboxes.address, wanted), eq(schema.mailboxes.isActive, true)),
  });

  if (direct) {
    if (direct.kind !== 'alias') return direct;
    if (!direct.forwardsToMailboxId) return direct;
    const target = await loadMailbox(env, direct.forwardsToMailboxId);
    // An alias pointing at another alias, or at nothing, resolves to itself
    // rather than walking further. The message still lands somewhere.
    return target && target.kind !== 'alias' && target.isActive ? target : direct;
  }

  const catchall = await db.query.mailboxes.findFirst({
    where: and(eq(schema.mailboxes.kind, 'catchall'), eq(schema.mailboxes.isActive, true)),
  });
  return catchall ?? null;
}

/**
 * The authorization decision. Never throws; an unreadable database is a refusal.
 */
export async function canUseMailbox(
  c: MailCtx,
  mailboxId: string,
  access: MailboxAccess,
): Promise<boolean> {
  const user = c.get('user');
  if (!user) return false;

  const box = await loadMailbox(c.env, mailboxId);
  if (!box) return false;

  // A deactivated mailbox can still be READ — deactivating one is how you stop
  // it sending, not how you erase what it already received, and hiding the
  // history would make the kill switch destructive.
  if (!box.isActive && access !== 'read') return false;

  if (user.isSuperadmin) return true;

  // no-reply@ and friends are machine identities. Nothing in a UI should list
  // them and no person should be able to send as one, because a message from
  // `no-reply@` is exactly what a recipient has been taught to trust as
  // automated rather than as somebody typing.
  if (box.kind === 'system') return false;

  if (box.kind === 'personal') {
    return box.ownerUserId === user.id;
  }

  /**
   * A post's mail. The holder reads and sends; nobody else does.
   *
   * The employee id comes from `actorEmployeeId`, which reads the database — NOT
   * from the JWT, whose copy was made when the token was signed and can be over
   * a week old. Somebody unlinked from an employee, or relinked to a different
   * one, would otherwise keep reading the old post's mail for the rest of their
   * session.
   *
   * A vacant or deactivated appointment reaches `admin/mailboxes` and nobody
   * else. Mail keeps arriving at cto@ while the post is empty and somebody has to
   * be able to see it; when it is filled again the whole history is there. This is
   * the same reasoning as the catch-all, and the same grant.
   */
  if (box.kind === 'appointment') {
    if (!box.appointmentId) return false;
    const db = getDb(c.env);
    const appointment = await db.query.appointments.findFirst({
      where: eq(schema.appointments.id, box.appointmentId),
      columns: { employeeId: true, isActive: true },
    });
    if (!appointment) return false;

    if (appointment.isActive !== true || !appointment.employeeId) {
      return checkFeaturePermission(c, 'admin', 'mailboxes', levelFor(access));
    }

    const mine = await actorEmployeeId(c);
    return !!mine && mine === appointment.employeeId;
  }

  // An alias has no storage of its own, so reading one is meaningless; sending
  // as one is allowed to whoever may send as its target.
  if (box.kind === 'alias') {
    if (access === 'read') return false;
    if (!box.forwardsToMailboxId) return false;
    return canUseMailbox(c, box.forwardsToMailboxId, access);
  }

  // The catch-all holds mail addressed to nobody in particular, which is as
  // likely to be misdirected payroll as it is to be spam. It is admin-only.
  if (box.kind === 'catchall') {
    return checkFeaturePermission(c, 'admin', 'mailboxes', levelFor(access));
  }

  if (box.kind !== 'app') return false;

  // Step 2: an explicit grant list, when present, is the whole answer. Note this
  // is checked BEFORE the app grant and replaces it — a `mailbox_grants` row
  // that omits somebody who holds `<app>/email` denies them, which is the
  // narrowing the table exists to express.
  const db = getDb(c.env);
  const explicit = await db.query.mailboxGrants.findMany({
    where: eq(schema.mailboxGrants.mailboxId, mailboxId),
  });

  if (explicit.length > 0) {
    const mine = explicit.find((g) => g.userId === user.id);
    if (!mine) return false;
    // An explicit grant carries no bulk bit: a mailbox narrow enough to need a
    // row here is not one to blast fifty recipients from, and adding a column for
    // it would mean answering that question for every mailbox that has a row.
    if (access === 'bulk') return false;
    return access === 'read' ? !!mine.canRead : !!mine.canSend;
  }

  if (!box.appName) return false;
  return checkFeaturePermission(c, box.appName, 'email', levelFor(access));
}

/**
 * Every mailbox the caller may read, which is what a UI needs to render a
 * picker. Filtered by asking `canUseMailbox` per row rather than by rebuilding
 * its logic as a WHERE clause — a second expression of the same rule is how the
 * two drift apart, and grants are already cached per request in a WeakMap, so
 * this costs one query rather than one per mailbox.
 */
export type MailboxScope =
  | { kind: 'personal' }
  /**
   * Everything that is the caller's OWN mail: their personal box plus every
   * appointment box they hold. This is what the workspace shows, and it is the
   * scope this whole change exists for — somebody who is PM of one thing and
   * director of another reads ahmad@ and cto@ side by side instead of signing out
   * of one account to reach the other.
   *
   * `personal` stays strict, so an administrative screen can still ask the
   * narrower question.
   */
  | { kind: 'mine' }
  | { kind: 'appointment' }
  | { kind: 'app'; app: string }
  | { kind: 'catchall' };

export async function listReadableMailboxes(
  c: MailCtx,
  scope?: MailboxScope,
): Promise<MailboxRow[]> {
  const db = getDb(c.env);
  const all = await db.query.mailboxes.findMany();

  const candidates = all.filter((box) => {
    if (box.kind === 'system') return false;
    if (!scope) return true;
    if (scope.kind === 'personal') return box.kind === 'personal';
    if (scope.kind === 'appointment') return box.kind === 'appointment';
    if (scope.kind === 'mine') return box.kind === 'personal' || box.kind === 'appointment';
    /**
     * The catch-all needed a scope of its own, because it belongs to no app and no
     * person and was therefore excluded by both of the other two — so it collected
     * everything addressed to nobody and there was no screen that could open it.
     */
    if (scope.kind === 'catchall') return box.kind === 'catchall';
    return box.kind === 'app' && box.appName === scope.app;
  });

  const out: MailboxRow[] = [];
  for (const box of candidates) {
    if (await canUseMailbox(c, box.id, 'read')) out.push(box);
  }
  return out;
}
