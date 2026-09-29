import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNotNull, like, lt, ne, or } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { APP_FEATURES, checkFeaturePermission, requireFeatureAccess } from '../middleware/rbac';
import { ok, created, notFound, badRequest, forbidden, serverError } from '../utils/response';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import {
  BULK_RECIPIENT_THRESHOLD,
  canUseMailbox,
  listReadableMailboxes,
  loadMailbox,
} from '../email/mailboxes';
import { enqueue, drainOne, promoteDraft } from '../email/outbox';
import { parseVariables, render, validateTemplate } from '../email/render';
import { Addr, LIMITS } from '../email/transport';
import { EMAIL_EVENTS, SYSTEM_MAILBOX_ID } from '../email/events';

/**
 * The mail API.
 *
 * Mounted at the top level rather than inside a department, because mail is not
 * one department's concern — `/api/notifications` and `/api/assets` are the same
 * shape. So there is no `requireAppAccess` here: the router carries only
 * `authMiddleware`, and every route states its own gate. Which gate depends on
 * what is being touched, and that is the point of `canUseMailbox`: the route does
 * not know whether a mailbox is somebody's personal inbox or HR's, and must not
 * have to.
 */

const emailRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
emailRouter.use('*', authMiddleware);

/**
 * Domains this Worker is allowed to own a mailbox on.
 *
 * Without this, `admin/mailboxes` would let somebody create a mailbox at
 * `billing@some-bank.example` and send as it. Cloudflare would refuse the send
 * (`E_SENDER_NOT_VERIFIED`) so it is not a live spoofing hole today, but relying
 * on the provider to enforce our own naming rule is how it becomes one the day a
 * second sending domain is onboarded for an unrelated reason.
 */
const SENDABLE_DOMAINS = ['godwinausten.org'];

const KINDS = ['personal', 'appointment', 'app', 'alias', 'catchall', 'system'] as const;
const FOLDERS = ['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'] as const;

function addressIsOurs(address: string): boolean {
  const at = address.lastIndexOf('@');
  if (at < 1 || at === address.length - 1) return false;
  const domain = address.slice(at + 1).toLowerCase();
  return SENDABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * A single address per entry, and nothing that could be read as two.
 *
 * `BULK_RECIPIENT_THRESHOLD` counts array entries, so an entry a provider might
 * split on — `a@x.test, b@y.test` in one string — would let a caller send to more
 * people than the count says while `to.length` stayed under the limit. Whether any
 * provider actually splits there is beside the point: the cheap fix is to refuse
 * the shape, so the count and the recipients cannot disagree.
 */
/** How far ahead a message may be scheduled. Beyond this it is a reminder, not an email. */
const MAX_SCHEDULE_DAYS = 90;

/**
 * Parses and bounds a requested send time.
 *
 * Returns `{ at }`, `{}` for "send now", or `{ problem }`. A time in the past is
 * refused rather than silently sent immediately: somebody who typed yesterday meant
 * something, and quietly sending is the wrong guess.
 */
function parseSchedule(value: unknown): { at?: Date; problem?: string } {
  if (value === undefined || value === null || value === '') return {};
  const at = new Date(String(value));
  if (Number.isNaN(at.getTime())) return { problem: 'scheduledFor is not a valid date.' };
  if (at.getTime() <= Date.now()) return { problem: 'That time has already passed. Leave it empty to send now.' };
  const limit = Date.now() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
  if (at.getTime() > limit) return { problem: `Cannot schedule more than ${MAX_SCHEDULE_DAYS} days ahead.` };
  return { at };
}

function parseAddrs(value: unknown): Addr[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? { email: v } : v))
    .filter((v): v is Addr => !!v
      && typeof v.email === 'string'
      && v.email.includes('@')
      // One @, and no separator or bracket that could restructure the header.
      && v.email.indexOf('@') === v.email.lastIndexOf('@')
      && !/[,;<>\s"]/.test(v.email))
    .map((v) => ({ email: v.email.trim().toLowerCase(), ...(v.name ? { name: String(v.name) } : {}) }));
}

// ── Mailboxes: administration ────────────────────────────────────────────────

/** Every mailbox, for the Access page. Administration, not use. */
emailRouter.get('/mailboxes', requireFeatureAccess('admin', 'mailboxes', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const rows = await db.query.mailboxes.findMany();
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

emailRouter.post('/mailboxes', requireFeatureAccess('admin', 'mailboxes', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();

    const address = String(body.address ?? '').trim().toLowerCase();
    const kind = String(body.kind ?? '');

    if (!address || !address.includes('@')) return badRequest(c, 'A valid address is required.');
    if (!addressIsOurs(address)) {
      return badRequest(c, `${address} is not on a domain this system can send as (${SENDABLE_DOMAINS.join(', ')}).`);
    }
    if (!KINDS.includes(kind as typeof KINDS[number])) {
      return badRequest(c, `kind must be one of: ${KINDS.join(', ')}.`);
    }


    // The invariants the DDL cannot express, since SQLite cannot gain a CHECK
    // constraint without rebuilding the table. A mailbox in the wrong shape is
    // not a validation nicety: a personal box with no owner is reachable by
    // nobody, and an app box with no app is reachable by everybody holding any
    // `email` grant.
    if (kind === 'personal' && !body.ownerUserId) return badRequest(c, 'A personal mailbox needs the person it belongs to.');
    if (kind === 'appointment' && !body.appointmentId) return badRequest(c, 'An appointment mailbox needs the appointment it belongs to.');
    if (kind === 'app' && !body.appName) return badRequest(c, 'An app mailbox needs the app it belongs to.');
    if (kind === 'app' && !APP_FEATURES[String(body.appName)]?.includes('email')) {
      return badRequest(c, `"${body.appName}" is not an app with mail. Apps with mail: ${Object.keys(APP_FEATURES).filter((a) => APP_FEATURES[a].includes('email')).join(', ')}.`);
    }
    if (kind === 'alias' && !body.forwardsToMailboxId) return badRequest(c, 'An alias needs a mailbox to deliver into.');

    if (kind === 'personal') {
      const owner = await db.query.usersLogins.findFirst({ where: eq(schema.usersLogins.id, String(body.ownerUserId)) });
      if (!owner) return notFound(c, 'That user does not exist.');
    }
    if (kind === 'appointment') {
      const appointment = await db.query.appointments.findFirst({
        where: eq(schema.appointments.id, String(body.appointmentId)),
        columns: { id: true },
      });
      if (!appointment) return notFound(c, 'That appointment does not exist.');
      // One address per post. A second mailbox on the same appointment is two
      // inboxes with identical access and no way to tell which one somebody meant.
      const taken = await db.query.mailboxes.findFirst({
        where: eq(schema.mailboxes.appointmentId, String(body.appointmentId)),
        columns: { address: true },
      });
      if (taken) return badRequest(c, `That appointment already has a mailbox (${taken.address}).`);
    }
    if (kind === 'alias') {
      const target = await loadMailbox(c.env, String(body.forwardsToMailboxId));
      if (!target) return notFound(c, 'The mailbox this alias points at does not exist.');
      // One hop only — see resolveInboundMailbox. A chain admits a cycle, and a
      // cycle in the inbound path is a loop inside a handler that cannot throw.
      if (target.kind === 'alias') return badRequest(c, 'An alias cannot point at another alias.');
    }
    if (kind === 'catchall') {
      const existing = await db.query.mailboxes.findFirst({ where: eq(schema.mailboxes.kind, 'catchall') });
      if (existing) return badRequest(c, `There is already a catch-all (${existing.address}). Cloudflare routes unmatched mail to one place.`);
    }

    const clash = await db.query.mailboxes.findFirst({ where: eq(schema.mailboxes.address, address) });
    if (clash) return badRequest(c, `${address} already exists.`);

    const id = generateId('mbx');
    const now = new Date();
    await db.insert(schema.mailboxes).values({
      id,
      address,
      displayName: body.displayName ?? null,
      kind,
      ownerUserId: kind === 'personal' ? String(body.ownerUserId) : null,
      appointmentId: kind === 'appointment' ? String(body.appointmentId) : null,
      appName: kind === 'app' ? String(body.appName) : null,
      forwardsToMailboxId: kind === 'alias' ? String(body.forwardsToMailboxId) : null,
      dailySendCap: Number.isFinite(Number(body.dailySendCap)) ? Number(body.dailySendCap) : 200,
      isActive: true,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(c.env, user.id, 'CREATE', 'mailboxes', id, {
      address, kind,
      appName: body.appName ?? null,
      ownerUserId: body.ownerUserId ?? null,
      appointmentId: body.appointmentId ?? null,
    });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

emailRouter.patch('/mailboxes/:id', requireFeatureAccess('admin', 'mailboxes', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const box = await loadMailbox(c.env, id);
    if (!box) return notFound(c, 'Mailbox not found');

    const body = await c.req.json();

    /**
     * An allowlist, not a denylist — the same lesson as PATCH /admin/users/:id,
     * where spreading the body behind a few `delete`s left `is_superadmin`
     * writable through the API. A denylist's failure mode is silent and arrives
     * with the next column.
     *
     * What is deliberately NOT here:
     *   address, kind   Changing either re-points every message already stored
     *                   against this mailbox — history that claims it arrived
     *                   somewhere it did not.
     *   forwardsTo…     An alias is validated on create to point at a non-alias.
     *                   Allowing it here would let a PATCH build the alias chain
     *                   that create refuses, and a chain admits a cycle.
     *   ownerUserId     Reassigning a personal mailbox hands one person's stored
     *                   mail to another. That should be a deliberate new mailbox,
     *                   not a field edit nobody reviews.
     *
     * `appName` IS here, having started out excluded on the same reasoning. Blocking
     * it outright was too strict: it also blocked fixing a mis-assignment, and the
     * workaround — delete and recreate — loses the stored correspondence, which is
     * worse than the thing being guarded against. It is validated, restricted to app
     * mailboxes, and the previous value goes into the audit entry.
     *
     * `appointmentId` is here for the same reason and with the same guards. Note it
     * is NOT how a handover works: handing cto@ to a new Director of Tech is an edit
     * to the APPOINTMENT's holder, and this mailbox follows without being touched.
     * This is only for correcting which post an address belongs to.
     */
    const ALLOWED = ['displayName', 'dailySendCap', 'isActive', 'appName', 'appointmentId'] as const;
    const patch: Record<string, unknown> = {};
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(body)) {
      if ((ALLOWED as readonly string[]).includes(key)) patch[key] = value;
      else rejected.push(key);
    }

    if (patch.dailySendCap !== undefined && !Number.isFinite(Number(patch.dailySendCap))) {
      return badRequest(c, 'dailySendCap must be a number.');
    }

    /**
     * Moving a mailbox between departments.
     *
     * Everyone holding the new app's `email` grant gains access to everything this
     * mailbox has already received, and everyone holding the old one loses it — so
     * it is validated against the same list `POST` uses, refused on anything that is
     * not an app mailbox, and recorded with the value it replaced.
     */
    if (patch.appName !== undefined) {
      if (box.kind !== 'app') {
        return badRequest(c, `Only an app mailbox belongs to a department; this one is "${box.kind}".`);
      }
      const nextApp = String(patch.appName);
      if (!APP_FEATURES[nextApp]?.includes('email')) {
        return badRequest(c, `"${nextApp}" is not an app with mail. Apps with mail: ${Object.keys(APP_FEATURES).filter((a) => APP_FEATURES[a].includes('email')).join(', ')}.`);
      }
      patch.appName = nextApp;
    }

    if (patch.appointmentId !== undefined) {
      if (box.kind !== 'appointment') {
        return badRequest(c, `Only an appointment mailbox belongs to a post; this one is "${box.kind}".`);
      }
      const nextId = String(patch.appointmentId);
      const appointment = await db.query.appointments.findFirst({
        where: eq(schema.appointments.id, nextId),
        columns: { id: true },
      });
      if (!appointment) return notFound(c, 'That appointment does not exist.');
      const taken = await db.query.mailboxes.findFirst({
        where: and(eq(schema.mailboxes.appointmentId, nextId), ne(schema.mailboxes.id, id)),
        columns: { address: true },
      });
      if (taken) return badRequest(c, `That appointment already has a mailbox (${taken.address}).`);
      patch.appointmentId = nextId;
    }

    if (Object.keys(patch).length === 0) {
      return badRequest(c, `Nothing to change. This route accepts: ${ALLOWED.join(', ')}.`);
    }

    await db.update(schema.mailboxes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.mailboxes.id, id));

    await logAudit(c.env, user.id, 'UPDATE', 'mailboxes', id, {
      ...patch,
      address: box.address,
      // Who could read this mailbox before, so a reassignment is reconstructable.
      ...(patch.appName !== undefined ? { previousAppName: box.appName } : {}),
      ...(patch.appointmentId !== undefined ? { previousAppointmentId: box.appointmentId } : {}),
      ...(rejected.length ? { rejectedFields: rejected } : {}),
    });
    return ok(c, { updated: true, ...(rejected.length ? { ignored: rejected } : {}) });
  } catch (err) { return serverError(c, err); }
});

/**
 * Deactivates. Deliberately not a delete.
 *
 * A mailbox owns stored mail, and rows in `email_messages` reference it, so a
 * real delete is either a foreign-key error or a cascade that destroys
 * correspondence. `is_active = 0` stops it sending while leaving what it received
 * readable, which is what "turn this mailbox off" should mean.
 */
emailRouter.delete('/mailboxes/:id', requireFeatureAccess('admin', 'mailboxes', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const box = await loadMailbox(c.env, id);
    if (!box) return notFound(c, 'Mailbox not found');
    if (box.kind === 'system') return badRequest(c, 'The system mailbox cannot be deactivated — every automated message sends as it.');

    await db.update(schema.mailboxes).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.mailboxes.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'mailboxes', id, { deactivated: true, address: box.address });
    return ok(c, { deactivated: true });
  } catch (err) { return serverError(c, err); }
});

// ── Per-mailbox grants ──────────────────────────────────────────────────────

emailRouter.get('/mailboxes/:id/grants', requireFeatureAccess('admin', 'mailboxes', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const rows = await db.query.mailboxGrants.findMany({ where: eq(schema.mailboxGrants.mailboxId, c.req.param('id')) });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/**
 * Replaces the grant list for one mailbox.
 *
 * Sending `[]` removes every row, which returns the mailbox to being governed by
 * its app grant — it does NOT lock everybody out. That is worth stating because
 * the opposite reading is the intuitive one, and it is the difference between
 * "remove the exception" and "remove all access".
 */
emailRouter.put('/mailboxes/:id/grants', requireFeatureAccess('admin', 'mailboxes', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const box = await loadMailbox(c.env, id);
    if (!box) return notFound(c, 'Mailbox not found');
    /**
     * Only an app mailbox takes per-user grants.
     *
     * A personal mailbox belongs to its owner, and an APPOINTMENT mailbox to
     * whoever holds the post — in both cases ownership is the permission. Allowing
     * rows here for an appointment would be worse than redundant: because a grant
     * list REPLACES the ordinary rule rather than adding to it, one that omitted
     * the current holder would lock them out of their own official address, which
     * is exactly the manual per-post access step this model exists to delete.
     */
    if (box.kind !== 'app') {
      return badRequest(c, `Only an app mailbox takes per-user grants; this one is "${box.kind}", and it belongs to ${box.kind === 'appointment' ? 'whoever holds that appointment' : 'its owner'}.`);
    }

    const body = await c.req.json<{ grants?: { userId: string; canRead?: boolean; canSend?: boolean }[] }>();
    const wanted = Array.isArray(body.grants) ? body.grants : [];

    // Validate everything before writing anything: a partial save would leave the
    // administrator guessing which half of their edit landed. Same rule as
    // PUT /api/agent/config.
    const errors: string[] = [];
    if (wanted.length) {
      const ids = wanted.map((g) => String(g.userId));
      const found = await db.query.usersLogins.findMany({ where: inArray(schema.usersLogins.id, ids) });
      for (const g of wanted) {
        if (!found.some((u) => u.id === g.userId)) errors.push(`No such user: ${g.userId}`);
        if (g.canSend && !g.canRead) errors.push(`${g.userId} cannot send without reading — a reply needs the thread.`);
      }
    }
    if (errors.length) return badRequest(c, errors.join('; '));

    await db.delete(schema.mailboxGrants).where(eq(schema.mailboxGrants.mailboxId, id));
    const now = new Date();
    for (const g of wanted) {
      await db.insert(schema.mailboxGrants).values({
        mailboxId: id,
        userId: String(g.userId),
        canRead: g.canRead !== false,
        canSend: !!g.canSend,
        createdBy: user.id,
        createdAt: now,
      });
    }

    await logAudit(c.env, user.id, 'UPDATE', 'mailbox_grants', id, { address: box.address, grants: wanted });
    return ok(c, { count: wanted.length, governedByAppGrant: wanted.length === 0 });
  } catch (err) { return serverError(c, err); }
});

// ── Mailboxes: use ──────────────────────────────────────────────────────────

/**
 * The mailboxes the caller can actually open. What every Email tab loads first.
 * `?app=hr` scopes it to one department; no query returns personal and every app
 * box they can read, which is what a unified view needs.
 */
emailRouter.get('/mine', async (c) => {
  try {
    /**
     * `mine`, `personal`, `appointment` and `catchall` are reserved values of
     * `?app=`, not app names. None exists in APP_FEATURES, so there is nothing for
     * them to shadow.
     *
     * `mine` is what the workspace asks for: the caller's personal box AND every
     * appointment box they hold, in one list. `personal` stays strict so an
     * administrative screen can still ask the narrower question.
     */
    const app = c.req.query('app');
    const scope = app === 'mine'
      ? { kind: 'mine' as const }
      : app === 'personal'
        ? { kind: 'personal' as const }
        : app === 'appointment'
          ? { kind: 'appointment' as const }
          : app === 'catchall'
            ? { kind: 'catchall' as const }
            : app
              ? { kind: 'app' as const, app }
              : undefined;
    const boxes = await listReadableMailboxes(c, scope);

    /**
     * The post each appointment mailbox belongs to, by name.
     *
     * One query for the whole list rather than one per box: the workspace needs to
     * label cto@ as "Director Tech", and a reader who sees an unexplained second
     * inbox will assume it is somebody else's mail.
     */
    const appointmentIds = [...new Set(boxes.map((b) => b.appointmentId).filter((v): v is string => !!v))];
    const titles = new Map<string, string | null>();
    if (appointmentIds.length > 0) {
      const rows = await getDb(c.env).query.appointments.findMany({
        where: inArray(schema.appointments.id, appointmentIds),
        columns: { id: true, roleOrTitle: true },
      });
      for (const row of rows) titles.set(row.id, row.roleOrTitle ?? null);
    }

    // Say what they may do with each, so the UI does not have to guess whether to
    // render a Compose button and then discover it was wrong on submit.
    const out = [];
    for (const box of boxes) {
      out.push({
        id: box.id,
        address: box.address,
        displayName: box.displayName,
        kind: box.kind,
        appName: box.appName,
        // So the workspace can label cto@ with the post it belongs to rather than
        // leaving the reader to work out why a second inbox appeared.
        appointmentId: box.appointmentId,
        appointmentTitle: box.appointmentId ? titles.get(box.appointmentId) ?? null : null,
        isActive: box.isActive,
        canSend: await canUseMailbox(c, box.id, 'send'),
        canBulk: await canUseMailbox(c, box.id, 'bulk'),
      });
    }
    return ok(c, out);
  } catch (err) { return serverError(c, err); }
});

emailRouter.get('/mailboxes/:id/messages', async (c) => {
  try {
    const id = c.req.param('id');
    if (!(await canUseMailbox(c, id, 'read'))) return forbidden(c, 'You cannot read that mailbox.');

    const folder = c.req.query('folder') ?? 'inbox';
    if (!FOLDERS.includes(folder as typeof FOLDERS[number])) {
      return badRequest(c, `folder must be one of: ${FOLDERS.join(', ')}.`);
    }

    const db = getDb(c.env);
    const rows = await db.query.emailMessages.findMany({
      where: and(eq(schema.emailMessages.mailboxId, id), eq(schema.emailMessages.folder, folder)),
      orderBy: [desc(schema.emailMessages.createdAt)],
      limit: 100,
    });

    /**
     * Delivery state for the outbound rows on this page, in ONE query.
     *
     * The list is where a bounce has to be visible: a failure you only discover by
     * opening the message is a failure nobody discovers. Fetched as a single
     * `inArray` rather than per row — a hundred messages would otherwise be a hundred
     * round trips, and D1 charges for each.
     */
    const outboundIds = rows.filter((m) => m.direction === 'outbound').map((m) => m.id);
    const deliveries = outboundIds.length
      ? await db.select({
        messageId: schema.emailDelivery.messageId,
        status: schema.emailDelivery.status,
        errorCode: schema.emailDelivery.errorCode,
      })
        .from(schema.emailDelivery)
        .where(inArray(schema.emailDelivery.messageId, outboundIds))
      : [];
    const byMessage = new Map(deliveries.map((d) => [d.messageId, d]));

    // Bodies are deliberately omitted from a list. A hundred full messages is a
    // response measured in megabytes, and the list only renders a preview.
    return ok(c, rows.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      direction: m.direction,
      folder: m.folder,
      fromAddress: m.fromAddress,
      fromName: m.fromName,
      toAddresses: m.toAddresses,
      subject: m.subject,
      preview: m.bodyText.slice(0, 160),
      isRead: m.isRead,
      isStarred: m.isStarred,
      spamVerdict: m.spamVerdict,
      /** Null on anything inbound, and on a draft, which has no delivery row. */
      deliveryStatus: byMessage.get(m.id)?.status ?? null,
      deliveryError: byMessage.get(m.id)?.errorCode ?? null,
      receivedAt: m.receivedAt,
      createdAt: m.createdAt,
    })));
  } catch (err) { return serverError(c, err); }
});

/**
 * Every message in one conversation, oldest first.
 *
 * Authorised through the thread's own mailbox rather than per message: a thread
 * belongs to exactly one mailbox by construction — `inbound.ts` refuses to attach a
 * message to a thread in a different one — so one check covers the set.
 */
emailRouter.get('/threads/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const thread = await db.query.emailThreads.findFirst({
      where: eq(schema.emailThreads.id, c.req.param('id')),
    });
    if (!thread) return notFound(c, 'Thread not found');
    if (!(await canUseMailbox(c, thread.mailboxId, 'read'))) return forbidden(c, 'You cannot read that mailbox.');

    const messages = await db.query.emailMessages.findMany({
      where: eq(schema.emailMessages.threadId, thread.id),
      orderBy: [asc(schema.emailMessages.createdAt)],
    });

    const attachments = messages.length
      ? await db.query.emailAttachments.findMany({
        where: inArray(schema.emailAttachments.messageId, messages.map((m) => m.id)),
      })
      : [];

    return ok(c, {
      thread: {
        id: thread.id, subject: thread.subject, messageCount: thread.messageCount,
        lastMessageAt: thread.lastMessageAt,
      },
      messages: messages.map((m) => ({
        ...m,
        attachments: attachments.filter((a) => a.messageId === m.id).map((a) => ({
          id: a.id, filename: a.filename, contentType: a.contentType, sizeBytes: a.sizeBytes,
          url: `/api/assets/download/${encodeURIComponent(a.r2Key)}`,
        })),
      })),
    });
  } catch (err) { return serverError(c, err); }
});

emailRouter.get('/messages/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const msg = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, c.req.param('id')) });
    if (!msg) return notFound(c, 'Message not found');
    if (!(await canUseMailbox(c, msg.mailboxId, 'read'))) return forbidden(c, 'You cannot read that mailbox.');

    const attachments = await db.query.emailAttachments.findMany({
      where: eq(schema.emailAttachments.messageId, msg.id),
    });
    const delivery = msg.direction === 'outbound'
      ? await db.query.emailDelivery.findFirst({ where: eq(schema.emailDelivery.messageId, msg.id) })
      : null;

    return ok(c, {
      ...msg,
      /**
       * `bodyHtml` is returned raw and is never put in the DOM directly. It is
       * rendered inside a sandboxed iframe with no `allow-scripts` and no
       * `allow-same-origin` — see `components/MailHtml.tsx`, which is the only
       * place in the app permitted to render it.
       */
      attachments: attachments.map((a) => ({
        id: a.id, filename: a.filename, contentType: a.contentType, sizeBytes: a.sizeBytes,
        /**
         * `disposition` and `contentId` are what make an inline image resolvable.
         * A `cid:` URL in the HTML names a Content-ID, and without these two fields
         * the client cannot tell which attachment that is — nor which attachments are
         * part of the message body rather than files to download.
         */
        disposition: a.disposition,
        contentId: a.contentId,
        url: `/api/assets/download/${encodeURIComponent(a.r2Key)}`,
      })),
      delivery: delivery ? {
        status: delivery.status, attempts: delivery.attempts, sentAt: delivery.sentAt,
        /**
         * `deliveredAt` is the receiving server's acceptance, from Resend's webhook,
         * and is what separates "we handed it over" from "it arrived" — which is all
         * `sentAt` ever meant, while the UI called it Sent.
         */
        deliveredAt: delivery.deliveredAt,
        errorCode: delivery.errorCode, errorMessage: delivery.errorMessage,
      } : null,
    });
  } catch (err) { return serverError(c, err); }
});

/** Read/starred/folder. The only fields a reader may change on a stored message. */
emailRouter.patch('/messages/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const msg = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, c.req.param('id')) });
    if (!msg) return notFound(c, 'Message not found');
    if (!(await canUseMailbox(c, msg.mailboxId, 'read'))) return forbidden(c, 'You cannot read that mailbox.');

    const body = await c.req.json();
    const patch: Record<string, unknown> = {};

    // Read/starred at read level. They are stored on the message rather than per
    // viewer, so on a shared mailbox they are shared state — but they are
    // conveniences, and anybody who can open the thread can already see it.
    if (typeof body.isRead === 'boolean') patch.isRead = body.isRead;
    if (typeof body.isStarred === 'boolean') patch.isStarred = body.isStarred;

    /**
     * Moving a message needs `send`, not `read`.
     *
     * This accepted a folder change at read level, which meant a view-only holder
     * of `<app>/email` could move a department's correspondence to the trash —
     * destructive, and the opposite of what view-only means. Filing mail is
     * working the mailbox, so it sits at the same level as answering it.
     */
    if (typeof body.folder === 'string') {
      if (!FOLDERS.includes(body.folder)) return badRequest(c, `folder must be one of: ${FOLDERS.join(', ')}.`);
      if (!(await canUseMailbox(c, msg.mailboxId, 'send'))) {
        return forbidden(c, 'Moving a message needs send access to its mailbox, not just read.');
      }
      patch.folder = body.folder;
    }
    if (Object.keys(patch).length === 0) return badRequest(c, 'Nothing to change. Accepts isRead, isStarred, folder.');

    await db.update(schema.emailMessages).set(patch).where(eq(schema.emailMessages.id, msg.id));
    // Moving mail to trash is the one of these worth an audit line.
    if (patch.folder) await logAudit(c.env, user.id, 'UPDATE', 'email_messages', msg.id, patch);
    return ok(c, { updated: true });
  } catch (err) { return serverError(c, err); }
});


// ── Drafts ──────────────────────────────────────────────────────────────────

/**
 * A draft is an `email_messages` row with `folder='drafts'` and NO `email_delivery`
 * row — the delivery row is what makes something a send, so a draft is simply a
 * message that has not acquired one. That is why drafts need no table of their own,
 * why the sweep cannot accidentally send one (it selects from email_delivery), and why
 * `enqueue`'s daily cap explicitly excludes them: an outbound row that has spent no
 * quota must not count against it.
 *
 * Saving is idempotent on the draft id, so the composer can autosave as often as it
 * likes without accumulating rows.
 */
emailRouter.put('/drafts/:id?', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();

    const mailboxId = String(body.mailboxId ?? '');
    if (!mailboxId) return badRequest(c, 'mailboxId is required.');
    if (!(await canUseMailbox(c, mailboxId, 'send'))) return forbidden(c, 'You cannot send from that mailbox.');

    const box = await loadMailbox(c.env, mailboxId);
    if (!box) return notFound(c, 'Mailbox not found');

    const existingId = c.req.param('id');
    const fields = {
      mailboxId,
      threadId: body.threadId ? String(body.threadId) : null,
      direction: 'outbound' as const,
      folder: 'drafts' as const,
      fromAddress: box.address,
      fromName: box.displayName ?? null,
      toAddresses: JSON.stringify(parseAddrs(body.to)),
      ccAddresses: JSON.stringify(parseAddrs(body.cc)),
      bccAddresses: JSON.stringify(parseAddrs(body.bcc)),
      subject: typeof body.subject === 'string' ? body.subject : '',
      // NOT NULL in the DDL, and a draft legitimately has an empty body.
      bodyText: typeof body.text === 'string' ? body.text : '',
      /**
       * A rich-text draft is HTML, and this was hardcoded null — so formatting was
       * silently lost the moment a draft was saved and reopened. Stored as authored;
       * it is sanitised when rendered, like every other body in the system.
       */
      bodyHtml: typeof body.html === 'string' && body.html.trim() ? body.html : null,
      inReplyToHeader: body.inReplyTo ? String(body.inReplyTo) : null,
      referencesHeader: body.references ? String(body.references) : null,
      isRead: true,
      createdBy: user.id,
    };

    if (existingId) {
      const prior = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, existingId) });
      if (!prior) return notFound(c, 'Draft not found');
      if (prior.folder !== 'drafts') return badRequest(c, 'That message has already been sent and cannot be edited.');
      // Its own mailbox, not the one in the body — otherwise a caller could move
      // somebody else's draft into a mailbox they hold.
      if (!(await canUseMailbox(c, prior.mailboxId, 'send'))) return forbidden(c, 'You cannot edit that draft.');

      await db.update(schema.emailMessages).set(fields).where(eq(schema.emailMessages.id, existingId));
      return ok(c, { id: existingId });
    }

    const id = generateId('eml');
    await db.insert(schema.emailMessages).values({ ...fields, id, createdAt: new Date() });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

emailRouter.get('/drafts', async (c) => {
  try {
    const db = getDb(c.env);
    const boxes = await listReadableMailboxes(c);
    const sendable: string[] = [];
    for (const b of boxes) if (await canUseMailbox(c, b.id, 'send')) sendable.push(b.id);
    if (sendable.length === 0) return ok(c, []);

    const rows = await db.query.emailMessages.findMany({
      where: and(
        inArray(schema.emailMessages.mailboxId, sendable),
        eq(schema.emailMessages.folder, 'drafts'),
      ),
      orderBy: [desc(schema.emailMessages.createdAt)],
      limit: 100,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/**
 * Sends a draft: gives it a delivery row and drains it.
 *
 * Everything the compose path checks is checked HERE rather than at save time — the
 * daily cap, the bulk threshold, a body that is actually present — because a draft may
 * sit for a week and the answers change. Keyed on the draft id so a double-click
 * cannot send twice.
 */
emailRouter.post('/drafts/:id/send', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');

    const draft = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, id) });
    if (!draft) return notFound(c, 'Draft not found');
    if (draft.folder !== 'drafts') return badRequest(c, 'That message has already been sent.');
    if (!(await canUseMailbox(c, draft.mailboxId, 'send'))) return forbidden(c, 'You cannot send from that mailbox.');

    const to = JSON.parse(draft.toAddresses || '[]') as Addr[];
    const cc = JSON.parse(draft.ccAddresses || '[]') as Addr[];
    const bcc = JSON.parse(draft.bccAddresses || '[]') as Addr[];
    if (to.length === 0) return badRequest(c, 'Add at least one recipient before sending.');
    if (!draft.subject?.trim()) return badRequest(c, 'Add a subject before sending.');
    if (!draft.bodyText.trim()) return badRequest(c, 'Write a message before sending.');

    const total = to.length + cc.length + bcc.length;
    if (total > BULK_RECIPIENT_THRESHOLD && !(await canUseMailbox(c, draft.mailboxId, 'bulk'))) {
      return forbidden(c, `Sending to ${total} recipients at once needs bulk permission on this mailbox.`);
    }

    const attachments = await db.query.emailAttachments.findMany({
      where: eq(schema.emailAttachments.messageId, id),
    });

    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const schedule = parseSchedule((body as Record<string, unknown>).scheduledFor);
    if (schedule.problem) return badRequest(c, schedule.problem);

    const queued = await promoteDraft(c.env, draft, attachments.length, schedule.at);
    if ('error' in queued) return badRequest(c, queued.error);

    await logAudit(c.env, user.id, 'CREATE', 'email_messages', id, {
      fromDraft: true, mailboxId: draft.mailboxId, to: to.map((t) => t.email),
      bccCount: bcc.length, subject: draft.subject, attachments: attachments.length,
    });

    if (!queued.deduped && !schedule.at) c.executionCtx.waitUntil(drainOne(c.env, id));
    return ok(c, {
      id,
      sent: !schedule.at,
      scheduled: !!schedule.at,
      ...(schedule.at ? { scheduledFor: schedule.at.toISOString() } : {}),
      deduped: queued.deduped,
    });
  } catch (err) { return serverError(c, err); }
});

emailRouter.delete('/drafts/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');
    const draft = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, id) });
    if (!draft) return notFound(c, 'Draft not found');
    if (draft.folder !== 'drafts') return badRequest(c, 'That message has been sent; it is not a draft.');
    if (!(await canUseMailbox(c, draft.mailboxId, 'send'))) return forbidden(c, 'You cannot delete that draft.');

    // Its attachments go with it, rows and objects both — an orphaned R2 object is
    // unreachable but still billed and still holds somebody's file.
    const attachments = await db.query.emailAttachments.findMany({
      where: eq(schema.emailAttachments.messageId, id),
    });
    for (const a of attachments) {
      if (c.env.CRM_BUCKET) await c.env.CRM_BUCKET.delete(a.r2Key).catch(() => {});
    }
    await db.delete(schema.emailAttachments).where(eq(schema.emailAttachments.messageId, id));
    await db.delete(schema.emailMessages).where(eq(schema.emailMessages.id, id));

    await logAudit(c.env, user.id, 'DELETE', 'email_messages', id, { draft: true });
    return ok(c, { deleted: true });
  } catch (err) { return serverError(c, err); }
});

// ── Scheduled ───────────────────────────────────────────────────────────────

/**
 * Messages waiting for their time.
 *
 * Not a folder: a scheduled message lives in `sent` with a `scheduled_for` on its
 * delivery row, because it IS sent as far as the writer is concerned — they are done
 * with it. Making it a folder would mean a message whose folder disagreed with its
 * delivery state, which is the class of thing that later reads as a bug.
 */
emailRouter.get('/scheduled', async (c) => {
  try {
    const db = getDb(c.env);
    const boxes = await listReadableMailboxes(c);
    if (boxes.length === 0) return ok(c, []);

    const rows = await db
      .select({
        id: schema.emailMessages.id,
        mailboxId: schema.emailMessages.mailboxId,
        subject: schema.emailMessages.subject,
        toAddresses: schema.emailMessages.toAddresses,
        preview: schema.emailMessages.bodyText,
        scheduledFor: schema.emailDelivery.scheduledFor,
        status: schema.emailDelivery.status,
      })
      .from(schema.emailDelivery)
      .innerJoin(schema.emailMessages, eq(schema.emailMessages.id, schema.emailDelivery.messageId))
      .where(and(
        inArray(schema.emailMessages.mailboxId, boxes.map((b) => b.id)),
        isNotNull(schema.emailDelivery.scheduledFor),
        inArray(schema.emailDelivery.status, ['queued', 'sending']),
      ))
      .orderBy(asc(schema.emailDelivery.scheduledFor))
      .limit(100);

    return ok(c, rows.map((r) => ({ ...r, preview: (r.preview ?? '').slice(0, 160) })));
  } catch (err) { return serverError(c, err); }
});

/**
 * Cancels a scheduled message by returning it to drafts.
 *
 * Deleting the delivery row rather than setting `status='cancelled'` is what makes it
 * editable again — a draft is defined by NOT having one. The alternative leaves a dead
 * row that can never send and can never be fixed, which is a worse answer to "actually,
 * change that first".
 */
emailRouter.post('/scheduled/:id/cancel', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');

    const msg = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, id) });
    if (!msg) return notFound(c, 'Message not found');
    if (!(await canUseMailbox(c, msg.mailboxId, 'send'))) return forbidden(c, 'You cannot change that mailbox.');

    const delivery = await db.query.emailDelivery.findFirst({
      where: eq(schema.emailDelivery.messageId, id),
    });
    if (!delivery) return badRequest(c, 'That message is not scheduled.');
    if (!delivery.scheduledFor) return badRequest(c, 'That message was not scheduled; it has already gone out.');
    if (delivery.status === 'sent') return badRequest(c, 'That message has already been sent.');

    await db.delete(schema.emailDelivery).where(eq(schema.emailDelivery.messageId, id));
    await db.update(schema.emailMessages)
      .set({ folder: 'drafts' })
      .where(eq(schema.emailMessages.id, id));

    await logAudit(c.env, user.id, 'UPDATE', 'email_messages', id, { action: 'schedule_cancelled' });
    return ok(c, { cancelled: true, returnedToDrafts: true });
  } catch (err) { return serverError(c, err); }
});

// ── Sending ─────────────────────────────────────────────────────────────────

emailRouter.post('/send', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();

    const mailboxId = String(body.mailboxId ?? '');
    if (!mailboxId) return badRequest(c, 'mailboxId is required — which mailbox this is sent from.');

    // Authorization before anything else is read out of the body, and note what
    // is NOT taken from it: there is no `from`. The From line is the mailbox row,
    // which is why a caller cannot send as an address they do not hold.
    if (!(await canUseMailbox(c, mailboxId, 'send'))) return forbidden(c, 'You cannot send from that mailbox.');

    const to = parseAddrs(body.to);
    const cc = parseAddrs(body.cc);
    const bcc = parseAddrs(body.bcc);
    if (to.length === 0) return badRequest(c, 'At least one valid recipient is required.');

    const total = to.length + cc.length + bcc.length;
    if (total > BULK_RECIPIENT_THRESHOLD && !(await canUseMailbox(c, mailboxId, 'bulk'))) {
      return forbidden(c, `Sending to ${total} recipients at once needs bulk permission on this mailbox (more than ${BULK_RECIPIENT_THRESHOLD}).`);
    }

    let subject = typeof body.subject === 'string' ? body.subject : '';
    let text = typeof body.text === 'string' ? body.text : '';
    let html: string | undefined = typeof body.html === 'string' ? body.html : undefined;

    // A template is an alternative to typing the body, not a second source of
    // truth layered over it.
    if (body.templateKey) {
      const tpl = await db.query.emailTemplates.findFirst({ where: eq(schema.emailTemplates.key, String(body.templateKey)) });
      if (!tpl) return notFound(c, `No template named "${body.templateKey}".`);
      if (!tpl.isActive) return badRequest(c, `Template "${tpl.key}" is switched off.`);
      /**
       * A system template cannot be sent by hand. At all, by anybody.
       *
       * This branch used to read `if (tpl.scope === 'app' && tpl.appName && !perm)`,
       * so a `system` template fell through with no check whatsoever — and the
       * seeded ones include `password_reset`, whose `{{resetUrl}}` is a required
       * variable the caller supplies. Any user who could send from any mailbox,
       * including their own personal one with no department grant at all, could
       * therefore emit the company's own reset email, verbatim, DKIM-signed and
       * DMARC-aligned, from a real @godwinausten.org address, pointing anywhere
       * they liked — and have it stored in the recipient's Pleiades inbox as a
       * legitimate internal message. Sending one to themselves also dumped the
       * text of every system template that `GET /templates` withholds.
       *
       * Refused outright rather than gated on admin/email_config, because there is
       * no legitimate reason to hand-send one: EMAIL_EVENTS renders these, and a
       * password-reset mail that a person composed is a phishing mail by
       * definition.
       */
      if (tpl.scope === 'system') {
        return forbidden(c, `"${tpl.key}" backs an automated email and cannot be sent by hand.`);
      }

      /**
       * And an app template needs that app's grant. Note this is no longer
       * conditional on `tpl.appName` being set: the old `&& tpl.appName` short-
       * circuit waved through any row with a null app, which nothing creates today
       * but which a future migration or a hand-edited row would.
       */
      if (!tpl.appName || !(await checkFeaturePermission(c, tpl.appName, 'email_templates', 'view'))) {
        return forbidden(c, `You cannot use that template.`);
      }
      const result = render(
        { subject: tpl.subject, bodyText: tpl.bodyText, bodyHtml: tpl.bodyHtml, variables: parseVariables(tpl.variables) },
        (body.values ?? {}) as Record<string, string>,
      );
      if (!result.ok) return badRequest(c, result.message);
      subject = result.rendered.subject;
      text = result.rendered.text;
      html = result.rendered.html;
    }

    if (!subject.trim()) return badRequest(c, 'A subject is required.');
    if (!text.trim()) return badRequest(c, 'A plain-text body is required.');

    /**
     * Replying to a stored message.
     *
     * `replyTo` names one of OUR messages, and the threading headers are derived from
     * it server-side rather than taken from the body — a client that got them wrong
     * would break threading silently at both ends, and a client that supplied them
     * freely could graft its message onto any conversation.
     *
     * The message must be one the caller can read, checked through canUseMailbox like
     * everything else, so this is not a way to learn what is in a mailbox you cannot
     * open.
     */
    let inReplyTo: string | undefined;
    let references: string | undefined;
    let threadId: string | undefined = typeof body.threadId === 'string' ? body.threadId : undefined;

    if (body.replyTo) {
      const parent = await db.query.emailMessages.findFirst({
        where: eq(schema.emailMessages.id, String(body.replyTo)),
      });
      if (!parent) return notFound(c, 'The message being replied to does not exist.');
      if (!(await canUseMailbox(c, parent.mailboxId, 'read'))) {
        return forbidden(c, 'You cannot read the message you are replying to.');
      }

      const parentId = parent.messageIdHeader;
      if (parentId) {
        inReplyTo = parentId;
        // References is the whole chain, oldest first, with the parent appended —
        // which is what lets a client that joins late still assemble the thread.
        references = [parent.referencesHeader, parentId].filter(Boolean).join(' ');
      }
      // Keep the reply in the same conversation even when the parent carried no
      // Message-ID, which is common on mail from poorly behaved senders.
      threadId = parent.threadId ?? threadId;
    }

    const schedule = parseSchedule(body.scheduledFor);
    if (schedule.problem) return badRequest(c, schedule.problem);

    const queued = await enqueue(c.env, {
      mailboxId,
      to, cc, bcc,
      ...(schedule.at ? { scheduledFor: schedule.at } : {}),
      subject, text,
      ...(html ? { html } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references ? { references } : {}),
      // Client-supplied when present, so a double-clicked Send is one message.
      // Server-generated otherwise, because absent a key every retry is a new
      // message and the column would be pointless.
      idempotencyKey: typeof body.idempotencyKey === 'string' && body.idempotencyKey
        ? `manual:${mailboxId}:${body.idempotencyKey}`
        : `manual:${generateId('snd')}`,
      ...(threadId ? { threadId } : {}),
      actorUserId: user.id,
    });

    if ('error' in queued) return badRequest(c, queued.error);

    await logAudit(c.env, user.id, 'CREATE', 'email_messages', queued.messageId, {
      mailboxId, to: to.map((t) => t.email), cc: cc.map((t) => t.email), bccCount: bcc.length, subject,
      templateKey: body.templateKey ?? null, deduped: queued.deduped,
    });

    /**
     * Send now unless it is scheduled. `drainOne` refuses a future message anyway, so
     * calling it would be harmless — but not calling it makes the intent obvious and
     * saves a claim-and-release round trip.
     */
    if (!queued.deduped && !schedule.at) c.executionCtx.waitUntil(drainOne(c.env, queued.messageId));

    return created(c, {
      id: queued.messageId,
      deduped: queued.deduped,
      ...(schedule.at ? { scheduledFor: schedule.at.toISOString() } : {}),
    });
  } catch (err) { return serverError(c, err); }
});


/**
 * Attaching a file to a draft.
 *
 * Deliberately NOT through `PUT /api/assets/upload/*`. That route's allowlist has no
 * `email-att/` entry, and adding one would let any caller who can upload write into
 * the prefix that holds RECEIVED mail — forging a message that appears to have arrived
 * from anybody. This route writes to `email-out/` instead, a prefix nothing else
 * writes, and only ever against a draft the caller may send from.
 *
 * Requiring a draft first is what makes that possible: the attachment needs a
 * `message_id`, so the composer saves a draft as soon as the first file is chosen.
 */
emailRouter.post('/drafts/:id/attachments', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');

    const draft = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, id) });
    if (!draft) return notFound(c, 'Draft not found');
    if (draft.folder !== 'drafts') return badRequest(c, 'That message has been sent and cannot take new attachments.');
    if (!(await canUseMailbox(c, draft.mailboxId, 'send'))) return forbidden(c, 'You cannot edit that draft.');
    if (!c.env.CRM_BUCKET) return badRequest(c, 'No document bucket is configured on this Worker.');

    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return badRequest(c, 'Attach a file in the `file` field.');

    const bytes = await file.arrayBuffer();

    /**
     * Resend caps a whole message at 5 MiB including attachments, and the message is
     * base64-encoded on the way out — which costs about a third. Checked against the
     * running total for this draft rather than per file, because three 2 MiB files
     * pass individually and fail together.
     */
    const existing = await db.query.emailAttachments.findMany({
      where: eq(schema.emailAttachments.messageId, id),
    });
    const already = existing.reduce((n, a) => n + (a.sizeBytes ?? 0), 0);
    const projected = Math.ceil((already + bytes.byteLength) * 1.37) + draft.bodyText.length;
    if (projected > LIMITS.messageBytes) {
      return badRequest(
        c,
        `That would make the message about ${Math.round(projected / 1024)} KiB once encoded, over the ${LIMITS.messageBytes / 1024 / 1024} MiB limit. Send a link instead, or split it across messages.`,
      );
    }
    if (existing.length >= 20) return badRequest(c, 'A message can carry at most 20 attachments.');

    // Server-constructed key — no byte of the filename reaches it, so there is no
    // traversal and no way to land in another mailbox's prefix.
    const attachmentId = generateId('eatt');
    const key = `email-out/${draft.mailboxId}/${id}/${attachmentId}`;
    await c.env.CRM_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    await db.insert(schema.emailAttachments).values({
      id: attachmentId,
      messageId: id,
      // Kept for display only; it is never used to build a path.
      filename: file.name || 'attachment',
      contentType: file.type || 'application/octet-stream',
      sizeBytes: bytes.byteLength,
      r2Key: key,
      disposition: 'attachment',
      contentId: null,
      createdAt: new Date(),
    });

    await logAudit(c.env, user.id, 'CREATE', 'email_attachments', attachmentId, {
      draft: id, filename: file.name, bytes: bytes.byteLength,
    });

    return created(c, {
      id: attachmentId, filename: file.name, sizeBytes: bytes.byteLength,
      url: `/api/assets/download/${encodeURIComponent(key)}`,
    });
  } catch (err) { return serverError(c, err); }
});

emailRouter.delete('/drafts/:id/attachments/:attachmentId', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const id = c.req.param('id');

    const draft = await db.query.emailMessages.findFirst({ where: eq(schema.emailMessages.id, id) });
    if (!draft) return notFound(c, 'Draft not found');
    if (!(await canUseMailbox(c, draft.mailboxId, 'send'))) return forbidden(c, 'You cannot edit that draft.');

    const att = await db.query.emailAttachments.findFirst({
      where: and(
        eq(schema.emailAttachments.id, c.req.param('attachmentId')),
        // Scoped to this draft, so an id from another message cannot be removed here.
        eq(schema.emailAttachments.messageId, id),
      ),
    });
    if (!att) return notFound(c, 'Attachment not found');

    if (c.env.CRM_BUCKET) await c.env.CRM_BUCKET.delete(att.r2Key).catch(() => {});
    await db.delete(schema.emailAttachments).where(eq(schema.emailAttachments.id, att.id));
    await logAudit(c.env, user.id, 'DELETE', 'email_attachments', att.id, { draft: id });
    return ok(c, { deleted: true });
  } catch (err) { return serverError(c, err); }
});

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Searches the mailboxes the caller can read.
 *
 * `LIKE` rather than FTS5, deliberately. D1 supports FTS5 but it needs a virtual table
 * and triggers to stay in sync, and at this volume — hundreds of messages, not millions
 * — a scan is imperceptible. The note is here so the next person knows it is a chosen
 * trade rather than an oversight: when a mailbox passes tens of thousands of messages,
 * add the FTS table and change this function.
 *
 * The term is escaped and bound. `%` and `_` are LIKE wildcards, and a generated id is
 * full of underscores — an unescaped term of `task_` would match far too much, and D1
 * refuses a pattern with too many wildcards outright.
 */
emailRouter.get('/search', async (c) => {
  try {
    const term = (c.req.query('q') ?? '').trim();
    if (term.length < 2) return badRequest(c, 'Search for at least two characters.');

    const boxes = await listReadableMailboxes(c);
    if (boxes.length === 0) return ok(c, []);

    const db = getDb(c.env);
    const escaped = term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const pattern = `%${escaped}%`;

    const rows = await db.query.emailMessages.findMany({
      where: and(
        inArray(schema.emailMessages.mailboxId, boxes.map((b) => b.id)),
        ne(schema.emailMessages.folder, 'trash'),
        or(
          like(schema.emailMessages.subject, pattern),
          like(schema.emailMessages.bodyText, pattern),
          like(schema.emailMessages.fromAddress, pattern),
          like(schema.emailMessages.toAddresses, pattern),
        ),
      ),
      orderBy: [desc(schema.emailMessages.createdAt)],
      limit: 60,
    });

    return ok(c, rows.map((m) => ({
      id: m.id,
      mailboxId: m.mailboxId,
      threadId: m.threadId,
      direction: m.direction,
      folder: m.folder,
      fromAddress: m.fromAddress,
      fromName: m.fromName,
      toAddresses: m.toAddresses,
      subject: m.subject,
      preview: m.bodyText.slice(0, 160),
      isRead: m.isRead,
      isStarred: m.isStarred,
      createdAt: m.createdAt,
    })));
  } catch (err) { return serverError(c, err); }
});

// ── Export ──────────────────────────────────────────────────────────────────

/**
 * Exports mail as an mbox archive.
 *
 * mbox rather than JSON because the point of an export is that it outlives this system:
 * every mail client on earth imports mbox, and a JSON dump is only readable by code
 * somebody would have to write. For received mail it is byte-perfect — `inbound.ts`
 * writes the original MIME to R2 before parsing anything, so the export is the message
 * as it actually arrived, headers, signatures and all. Sent mail has no original (the
 * provider built it), so a minimal RFC 5322 message is synthesised from the row and the
 * export says so in a header.
 *
 * **It respects `canUseMailbox`, which means an administrator does not get everybody's
 * personal mail.** That is deliberate and it is the whole reason this is not a
 * superadmin-only bulk dump: ownership of a personal mailbox has been the one thing no
 * grant can override, and an export route is exactly where that invariant would quietly
 * die. A superadmin bypasses it as they bypass everything, which is the honest place for
 * that power to live.
 *
 * Streamed rather than assembled, so a large archive does not have to fit in memory,
 * and paginated internally so one slow R2 read cannot stall the whole thing. Capped —
 * the response says when it truncated and gives the cursor to continue from.
 */
const EXPORT_MAX = 500;

emailRouter.get('/export', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');

    const wanted = c.req.query('mailbox');
    const boxes = (await listReadableMailboxes(c)).filter((b) => !wanted || b.id === wanted);
    if (boxes.length === 0) return badRequest(c, 'No mailbox you can read matches that request.');

    // `before` continues a truncated export; ids are not ordered, so the cursor is a time.
    const before = c.req.query('before') ? new Date(String(c.req.query('before'))) : null;
    if (before && Number.isNaN(before.getTime())) return badRequest(c, 'before is not a valid date.');

    const rows = await db.query.emailMessages.findMany({
      where: and(
        inArray(schema.emailMessages.mailboxId, boxes.map((b) => b.id)),
        // A draft was never a message. Including them would make the archive disagree
        // with what was actually sent or received.
        ne(schema.emailMessages.folder, 'drafts'),
        ...(before ? [lt(schema.emailMessages.createdAt, before)] : []),
      ),
      orderBy: [desc(schema.emailMessages.createdAt)],
      limit: EXPORT_MAX + 1,
    });

    const truncated = rows.length > EXPORT_MAX;
    const batch = rows.slice(0, EXPORT_MAX);

    await logAudit(c.env, user.id, 'READ', 'email_messages', 'export', {
      mailboxes: boxes.map((b) => b.address),
      count: batch.length,
      truncated,
      // An export is bulk access to correspondence. Who took what, and when.
      before: before?.toISOString() ?? null,
    });

    const byId = new Map(boxes.map((b) => [b.id, b.address]));
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const push = (text: string) => controller.enqueue(encoder.encode(text));
        try {
          for (const m of batch) {
            const stamp = (m.receivedAt ?? m.createdAt) ?? new Date();
            /**
             * The `From ` line separates messages in an mbox and is not a header. A body
             * line that happens to begin `From ` has to be escaped or the next importer
             * treats it as the start of a new message — the classic mbox corruption.
             */
            push(`From ${m.fromAddress} ${new Date(stamp).toUTCString()}\n`);
            push(`X-Pleiades-Mailbox: ${byId.get(m.mailboxId) ?? m.mailboxId}\n`);
            push(`X-Pleiades-Folder: ${m.folder}\n`);
            push(`X-Pleiades-Message-Id: ${m.id}\n`);

            let raw: string | null = null;
            if (m.rawKey && c.env.CRM_BUCKET) {
              const obj = await c.env.CRM_BUCKET.get(m.rawKey);
              if (obj) raw = await obj.text();
            }

            if (raw) {
              push('X-Pleiades-Fidelity: original\n');
              push(raw.replace(/^From /gm, '>From ').replace(/\r\n/g, '\n'));
              push('\n\n');
            } else {
              // Synthesised. Said out loud, so nobody auditing this mistakes it for the
              // bytes that crossed the wire.
              push('X-Pleiades-Fidelity: reconstructed\n');
              push(`Date: ${new Date(stamp).toUTCString()}\n`);
              push(`From: ${m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress}\n`);
              const addrs = (json: string | null) => {
                try { return (JSON.parse(json ?? '[]') as Addr[]).map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', '); }
                catch { return ''; }
              };
              push(`To: ${addrs(m.toAddresses)}\n`);
              if (m.ccAddresses) push(`Cc: ${addrs(m.ccAddresses)}\n`);
              if (m.messageIdHeader) push(`Message-ID: ${m.messageIdHeader}\n`);
              if (m.inReplyToHeader) push(`In-Reply-To: ${m.inReplyToHeader}\n`);
              if (m.referencesHeader) push(`References: ${m.referencesHeader}\n`);
              push(`Subject: ${(m.subject ?? '').replace(/[\r\n]/g, ' ')}\n`);
              push('MIME-Version: 1.0\n');
              push('Content-Type: text/plain; charset=utf-8\n');
              push('\n');
              push(m.bodyText.replace(/^From /gm, '>From '));
              push('\n\n');
            }
          }

          if (truncated) {
            const last = batch[batch.length - 1];
            const cursor = new Date(last.createdAt as unknown as Date).toISOString();
            push(`From export@pleiades ${new Date().toUTCString()}\n`);
            push('Subject: This archive was truncated\n\n');
            push(`${EXPORT_MAX} messages were exported, and there are older ones.\n`);
            push(`Continue with ?before=${cursor}\n\n`);
          }
          controller.close();
        } catch (err) {
          // Close rather than error: a partial archive the importer can read beats a
          // broken download with nothing in it.
          console.error('[email] export stream failed partway:', err);
          controller.close();
        }
      },
    });

    const name = wanted ? (byId.get(wanted) ?? 'mailbox') : 'all-mailboxes';
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/mbox',
        'Content-Disposition': `attachment; filename="pleiades-${name}-${new Date().toISOString().slice(0, 10)}.mbox"`,
        'Cache-Control': 'private, no-store',
        'X-Pleiades-Exported': String(batch.length),
        'X-Pleiades-Truncated': String(truncated),
      },
    });
  } catch (err) { return serverError(c, err); }
});

// ── Templates ───────────────────────────────────────────────────────────────

emailRouter.get('/templates', async (c) => {
  try {
    const db = getDb(c.env);
    const all = await db.query.emailTemplates.findMany();

    // Filter rather than refuse — the reports.ts idiom. Somebody with HR's
    // templates but not Legal's simply is not told Legal's exist, which is a
    // better answer than a 403 on a page that would otherwise work.
    const out = [];
    for (const t of all) {
      if (t.scope === 'system') {
        if (await checkFeaturePermission(c, 'admin', 'email_config', 'view')) out.push(t);
        continue;
      }
      if (t.appName && await checkFeaturePermission(c, t.appName, 'email_templates', 'view')) out.push(t);
    }
    return ok(c, out);
  } catch (err) { return serverError(c, err); }
});

emailRouter.post('/templates', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json();

    const appName = String(body.appName ?? '');
    // Only an app-scoped template can be created. A `system` template backs a
    // code path in EMAIL_EVENTS, so one created here would be a row no code ever
    // reads — and the ones that ARE read are seeded by migration 0038.
    if (!appName) return badRequest(c, 'appName is required. System templates are seeded by migration, not created here.');
    if (!(await checkFeaturePermission(c, appName, 'email_templates', 'edit'))) {
      return forbidden(c, `You cannot author ${appName} templates.`);
    }

    const key = String(body.key ?? '').trim();
    if (!/^[a-z0-9_]+$/.test(key)) return badRequest(c, 'key must be lower-case letters, digits and underscores.');
    if (EMAIL_EVENTS[key]) return badRequest(c, `"${key}" is the key of an automated email; pick another so the two cannot be confused.`);
    const clash = await db.query.emailTemplates.findFirst({ where: eq(schema.emailTemplates.key, key) });
    if (clash) return badRequest(c, `A template with key "${key}" already exists.`);

    const variables = Array.isArray(body.variables) ? body.variables : [];
    const errors = validateTemplate({
      subject: String(body.subject ?? ''),
      bodyText: String(body.bodyText ?? ''),
      bodyHtml: body.bodyHtml ?? null,
      variables,
    });
    if (errors.length) return badRequest(c, errors.join(' '));

    const id = generateId('tpl');
    const now = new Date();
    await db.insert(schema.emailTemplates).values({
      id, key, scope: 'app', appName,
      name: String(body.name ?? key),
      description: body.description ?? null,
      subject: String(body.subject), bodyText: String(body.bodyText), bodyHtml: body.bodyHtml ?? null,
      variables: JSON.stringify(variables),
      isActive: true, updatedBy: user.id, createdAt: now, updatedAt: now,
    });

    await logAudit(c.env, user.id, 'CREATE', 'email_templates', id, { key, appName });
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

emailRouter.patch('/templates/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const tpl = await db.query.emailTemplates.findFirst({ where: eq(schema.emailTemplates.id, c.req.param('id')) });
    if (!tpl) return notFound(c, 'Template not found');

    // A system template is the one every department's automated mail renders
    // through, so editing it reaches everybody. admin/email_config, not the
    // department's own grant.
    const allowed = tpl.scope === 'system'
      ? await checkFeaturePermission(c, 'admin', 'email_config', 'edit')
      : !!tpl.appName && await checkFeaturePermission(c, tpl.appName, 'email_templates', 'edit');
    if (!allowed) return forbidden(c, 'You cannot edit that template.');

    const body = await c.req.json();

    /**
     * Allowlisted for the same reason as the mailbox route above.
     *
     * `key` and `scope` and `appName` are absent on purpose: code looks a template
     * up by key, and re-scoping one would change who is allowed to edit it from
     * inside the edit that changes it — a caller with `acquisition/email_templates`
     * could otherwise promote a template to `scope='system'` and own every
     * department's automated mail.
     */
    const ALLOWED_T = ['name', 'description', 'subject', 'bodyText', 'bodyHtml', 'variables', 'isActive'] as const;
    const patch: Record<string, unknown> = {};
    const rejected: string[] = [];
    for (const [key, value] of Object.entries(body)) {
      if ((ALLOWED_T as readonly string[]).includes(key)) patch[key] = value;
      else rejected.push(key);
    }
    if (Object.keys(patch).length === 0) {
      return badRequest(c, `Nothing to change. This route accepts: ${ALLOWED_T.join(', ')}.`);
    }

    const merged = {
      subject: (patch.subject as string) ?? tpl.subject,
      bodyText: (patch.bodyText as string) ?? tpl.bodyText,
      bodyHtml: patch.bodyHtml !== undefined ? (patch.bodyHtml as string | null) : tpl.bodyHtml,
      variables: (patch.variables as { name: string; label: string; required?: boolean }[]) ?? parseVariables(tpl.variables),
    };
    const errors = validateTemplate(merged);
    if (errors.length) return badRequest(c, errors.join(' '));

    await db.update(schema.emailTemplates)
      .set({
        ...patch,
        ...(patch.variables ? { variables: JSON.stringify(patch.variables) } : {}),
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailTemplates.id, tpl.id));

    await logAudit(c.env, user.id, 'UPDATE', 'email_templates', tpl.id, {
      key: tpl.key, fields: Object.keys(patch), ...(rejected.length ? { rejectedFields: rejected } : {}),
    });
    return ok(c, { updated: true });
  } catch (err) { return serverError(c, err); }
});

emailRouter.delete('/templates/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const tpl = await db.query.emailTemplates.findFirst({ where: eq(schema.emailTemplates.id, c.req.param('id')) });
    if (!tpl) return notFound(c, 'Template not found');
    // Editable, never deletable: deleting one breaks the code path that renders
    // through it, and the failure surfaces as mail silently not being sent.
    if (tpl.scope === 'system') return badRequest(c, `"${tpl.key}" backs an automated email and cannot be deleted. Switch it off instead.`);
    if (!tpl.appName || !(await checkFeaturePermission(c, tpl.appName, 'email_templates', 'delete'))) {
      return forbidden(c, 'You cannot delete that template.');
    }

    await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, tpl.id));
    await logAudit(c.env, user.id, 'DELETE', 'email_templates', tpl.id, { key: tpl.key });
    return ok(c, { deleted: true });
  } catch (err) { return serverError(c, err); }
});

// ── Notification preferences ────────────────────────────────────────────────

/** The caller's own. There is no route to read or set anybody else's. */
emailRouter.get('/prefs', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const rows = await db.query.emailPrefs.findMany({ where: eq(schema.emailPrefs.userId, user.id) });
    const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.eventKey));

    // Rendered from the catalogue rather than from the table, so an event nobody
    // has an opinion about still appears with its default.
    return ok(c, Object.values(EMAIL_EVENTS).map((e) => ({
      key: e.key,
      kind: e.kind,
      description: e.description,
      enabled: e.kind === 'transactional' ? true : !off.has(e.key),
      // Transactional mail cannot be switched off, and saying so is better than
      // offering a toggle that silently does nothing.
      changeable: e.kind === 'notification',
    })));
  } catch (err) { return serverError(c, err); }
});

emailRouter.put('/prefs', async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const body = await c.req.json<{ prefs?: Record<string, boolean> }>();
    const wanted = body.prefs ?? {};

    const errors: string[] = [];
    for (const key of Object.keys(wanted)) {
      const spec = EMAIL_EVENTS[key];
      if (!spec) errors.push(`Unknown event "${key}".`);
      else if (spec.kind === 'transactional') errors.push(`"${key}" cannot be switched off — it is only ever sent because you asked for it.`);
    }
    if (errors.length) return badRequest(c, errors.join(' '));

    const now = new Date();
    for (const [key, enabled] of Object.entries(wanted)) {
      await db.insert(schema.emailPrefs)
        .values({ userId: user.id, eventKey: key, enabled, updatedAt: now })
        .onConflictDoUpdate({
          target: [schema.emailPrefs.userId, schema.emailPrefs.eventKey],
          set: { enabled, updatedAt: now },
        });
    }
    return ok(c, { updated: Object.keys(wanted).length });
  } catch (err) { return serverError(c, err); }
});

// ── Automations ─────────────────────────────────────────────────────────────

/**
 * What the system sends by itself, and whether it is working.
 *
 * Every automated message goes out as `no-reply@`, which means nobody reads a copy
 * and nobody notices when one stops. This is the answer to "what is that mailbox
 * doing" — the catalogue in EMAIL_EVENTS joined against what actually left,
 * counted from the rows rather than trusted from the code.
 *
 * Read-only, and gated on admin/email_config because it exposes recipient
 * addresses and failure reasons across every department.
 */
emailRouter.get('/automations', requireFeatureAccess('admin', 'email_config', 'view'), async (c) => {
  try {
    const db = getDb(c.env);

    const sender = await db.query.mailboxes.findFirst({
      where: eq(schema.mailboxes.id, SYSTEM_MAILBOX_ID),
    });

    const templates = await db.query.emailTemplates.findMany({
      where: eq(schema.emailTemplates.scope, 'system'),
    });

    // One pass over the automated messages rather than a query per event: there
    // are a handful of events and potentially many messages, and N+1 here would
    // grow with the mail rather than with the catalogue.
    const { results: stats } = await c.env.DB.prepare(
      `SELECT m.event_key           AS eventKey,
              count(*)              AS total,
              sum(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END)       AS sent,
              sum(CASE WHEN d.status IN ('failed','suppressed') THEN 1 ELSE 0 END) AS failed,
              max(m.created_at)     AS lastAt
         FROM email_messages m
         LEFT JOIN email_delivery d ON d.message_id = m.message_id
        WHERE m.event_key IS NOT NULL
        GROUP BY m.event_key`,
    ).all<{ eventKey: string; total: number; sent: number; failed: number; lastAt: number }>();

    const byEvent = new Map(stats.map((r) => [r.eventKey, r]));

    // The most recent failures, which is what somebody opening this page is
    // actually looking for.
    const { results: recentFailures } = await c.env.DB.prepare(
      `SELECT m.event_key AS eventKey, m.to_addresses AS toAddresses, m.created_at AS createdAt,
              d.status AS status, d.error_code AS errorCode, d.error_message AS errorMessage,
              d.attempts AS attempts, d.transport AS transport
         FROM email_delivery d
         JOIN email_messages m ON m.message_id = d.message_id
        WHERE m.event_key IS NOT NULL AND d.status IN ('failed','suppressed')
        ORDER BY m.created_at DESC
        LIMIT 20`,
    ).all();

    return ok(c, {
      sender: sender
        ? { address: sender.address, isActive: sender.isActive, dailySendCap: sender.dailySendCap }
        : null,
      events: Object.values(EMAIL_EVENTS).map((e) => {
        const tpl = templates.find((t) => t.key === e.key);
        const stat = byEvent.get(e.key);
        return {
          key: e.key,
          kind: e.kind,
          description: e.description,
          // A catalogued event with no template can never send, and says so here
          // rather than failing silently at the moment it is needed.
          template: tpl
            ? { id: tpl.id, subject: tpl.subject, isActive: tpl.isActive, updatedAt: tpl.updatedAt, updatedBy: tpl.updatedBy }
            : null,
          total: Number(stat?.total ?? 0),
          sent: Number(stat?.sent ?? 0),
          failed: Number(stat?.failed ?? 0),
          lastAt: stat?.lastAt ?? null,
        };
      }),
      recentFailures,
    });
  } catch (err) { return serverError(c, err); }
});

// ── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Sends one message and reports exactly what the transport said.
 *
 * This exists for the question that has to be answered before any of the above
 * matters: does mail from this Worker actually arrive, and does it pass DMARC?
 * The apex publishes `p=reject` with strict alignment on both mechanisms while
 * Cloudflare rewrites the return-path to a `cf-bounce` subdomain — so SPF cannot
 * align strictly and the whole thing rests on DKIM signing with `d=` at the apex.
 * Cloudflare documents where the key lives but not the `d=` tag, which makes that
 * an inference until a real `Authentication-Results` header confirms it.
 *
 * Superadmin only, and it goes through the outbox like everything else so a test
 * send is as auditable as a real one.
 */
emailRouter.post('/test', async (c) => {
  try {
    const user = c.get('user');
    if (!user.isSuperadmin) return forbidden(c, 'Diagnostics are superadmin-only.');

    const body = await c.req.json<{ to?: string }>();
    const to = String(body.to ?? '').trim().toLowerCase();
    if (!to.includes('@')) return badRequest(c, 'to is required — an external address you can read the headers of.');

    const stamp = new Date().toISOString();
    const queued = await enqueue(c.env, {
      mailboxId: SYSTEM_MAILBOX_ID,
      to: [{ email: to }],
      subject: `Pleiades delivery test ${stamp}`,
      text: [
        'This is a delivery test from Pleiades.',
        '',
        'View the raw source of this message and read the Authentication-Results',
        'header. All three of spf, dkim and dmarc should say pass, and the',
        'DKIM-Signature d= tag should read godwinausten.org rather than',
        'cf-bounce.godwinausten.org — if it reads the latter, the apex DMARC',
        'policy needs aspf=r before anything else is built on this.',
        '',
        `Sent ${stamp} by ${user.id}.`,
      ].join('\n'),
      idempotencyKey: `diagnostic:${stamp}:${to}`,
      actorUserId: user.id,
    });

    if ('error' in queued) return badRequest(c, queued.error);

    await logAudit(c.env, user.id, 'CREATE', 'email_messages', queued.messageId, { diagnostic: true, to });

    // Awaited, not waitUntil: the whole point is to report what happened.
    const outcome = await drainOne(c.env, queued.messageId);
    const db = getDb(c.env);
    const delivery = await db.query.emailDelivery.findFirst({
      where: eq(schema.emailDelivery.messageId, queued.messageId),
    });

    return ok(c, {
      id: queued.messageId,
      outcome,
      status: delivery?.status ?? 'unknown',
      providerMessageId: delivery?.providerMessageId ?? null,
      errorCode: delivery?.errorCode ?? null,
      errorMessage: delivery?.errorMessage ?? null,
      // Says plainly when nothing left the machine, so a passing call is not
      // mistaken for a delivered message.
      note: delivery?.providerMessageId?.startsWith('console_')
        ? 'No EMAIL binding on this deployment: the message was logged, not sent.'
        : 'Check the Authentication-Results header on the received message.',
    });
  } catch (err) { return serverError(c, err); }
});

export default emailRouter;
