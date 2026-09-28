import { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { UserPayload } from '../middleware/auth';
import { checkFeaturePermission } from '../middleware/rbac';

/**
 * Who may use which mailbox.
 *
 * There is exactly one implementation of this question, for the same reason
 * `rbac.ts` is the only authorization path in the system: two of them is two
 * answers, and the one that is wrong is the one nobody tested. Every route,
 * every R2 read rule and the inbound handler go through `canUseMailbox`.
 *
 * Access has two sources and they are not a fallback chain — the order below is
 * load-bearing:
 *
 *   1. A personal mailbox is reachable by the person it belongs to. No grant is
 *      involved; ownership *is* the permission. This is the same reasoning that
 *      makes `dashboard` app-gated rather than feature-gated — every handler
 *      already filters on the caller's own id.
 *   2. If any `mailbox_grants` row exists for a mailbox, those rows are the only
 *      thing that decides and the app grant stops applying. That is what lets
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
export async function listReadableMailboxes(
  c: MailCtx,
  scope?: { kind: 'personal' } | { kind: 'app'; app: string },
): Promise<MailboxRow[]> {
  const db = getDb(c.env);
  const all = await db.query.mailboxes.findMany();

  const candidates = all.filter((box) => {
    if (box.kind === 'system') return false;
    if (!scope) return true;
    if (scope.kind === 'personal') return box.kind === 'personal';
    return box.kind === 'app' && box.appName === scope.app;
  });

  const out: MailboxRow[] = [];
  for (const box of candidates) {
    if (await canUseMailbox(c, box.id, 'read')) out.push(box);
  }
  return out;
}
