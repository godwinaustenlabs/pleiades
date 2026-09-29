import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { Addr } from './transport';
import { drainOne, enqueue } from './outbox';
import { parseVariables, render } from './render';

/**
 * The catalogue of automated emails.
 *
 * Declared in one place for the same reason `APP_FEATURES` is: an event that
 * exists in a handler but nowhere else cannot be listed in a preferences UI, so
 * nobody can turn it off, so the first person it annoys has to ask an engineer.
 * Adding an automated email means adding an entry here and a `scope='system'`
 * template row with a matching key.
 *
 * `transactional` events ignore preferences. There are only ever a few, and the
 * test is not "is it important" but "would the recipient be harmed by not
 * receiving it" — a password reset they asked for, an approval blocking someone
 * else's work. Everything else is `notification` and can be switched off.
 */

export type EmailEventKind = 'transactional' | 'notification';

export type EmailEvent = {
  /** Also the `email_templates.key` this renders through. */
  key: string;
  kind: EmailEventKind;
  description: string;
  /**
   * The rendered body is a credential, so do not keep it.
   *
   * `src/utils/token.ts` stores only a hash of a reset token precisely so that a
   * database read yields nothing usable — and then the sent-mail row kept the
   * rendered message, which contains the live link. For the sixty minutes that
   * token is valid, the hash and a working copy of the secret it guards sat in the
   * same database. The message row is replaced with a placeholder once it has been
   * handed to the transport; there is no version of a sent log that should let
   * somebody read a reset link.
   */
  sensitive?: boolean;
};

export const EMAIL_EVENTS: Record<string, EmailEvent> = {
  task_assigned: {
    key: 'task_assigned',
    kind: 'notification',
    description: 'A task was assigned to this person. Mirrors the Slack post in src/routes/tasks.ts.',
  },
  password_reset: {
    key: 'password_reset',
    kind: 'transactional',
    description: 'A reset request was approved; carries the single-use link. Goes to recovery_email only.',
    sensitive: true,
  },
};

/** The mailbox every automated message sends as. Seeded by migration 0038. */
export const SYSTEM_MAILBOX_ID = 'mbx_system';

export type DispatchRequest = {
  event: keyof typeof EMAIL_EVENTS | string;
  to: Addr[];
  values: Record<string, string | number | null | undefined>;
  /** `<event>:<entity>:<recipient>` — the uniqueness guarantee, see outbox.ts. */
  idempotencyKey: string;
  /**
   * The recipient's `users_logins.id`, when there is one. Used only to honour an
   * opt-out; absent means "cannot be opted out of", which is correct for mail to
   * someone who has no login (a lead, a client contact).
   */
  recipientUserId?: string | null;
  threadId?: string;
};

export type DispatchResult =
  | { sent: true; messageId: string; deduped: boolean }
  | { sent: false; reason: string };

/**
 * Renders and queues one automated email.
 *
 * Never throws, and every "no" is a stated reason rather than a silent return:
 * these are called from inside handlers whose real job is something else, where
 * an exception would fail a task creation because a notification could not be
 * addressed.
 */
export async function dispatch(env: Env, req: DispatchRequest): Promise<DispatchResult> {
  try {
    const spec = EMAIL_EVENTS[req.event];
    if (!spec) return { sent: false, reason: `Unknown email event "${req.event}".` };

    const recipients = req.to.filter((t) => t.email && t.email.includes('@'));
    if (recipients.length === 0) {
      // The overwhelmingly common case, and not an error: `employees.email` is
      // nullable, so plenty of people have no address on file.
      return { sent: false, reason: 'No usable recipient address.' };
    }

    const db = getDb(env);

    if (spec.kind === 'notification' && req.recipientUserId) {
      const pref = await db.query.emailPrefs.findFirst({
        where: and(
          eq(schema.emailPrefs.userId, req.recipientUserId),
          eq(schema.emailPrefs.eventKey, spec.key),
        ),
      });
      // Absence means enabled. Only an explicit row can switch something off.
      if (pref && !pref.enabled) return { sent: false, reason: 'Recipient has opted out of this notification.' };
    }

    const tpl = await db.query.emailTemplates.findFirst({
      where: eq(schema.emailTemplates.key, spec.key),
    });
    if (!tpl) return { sent: false, reason: `No template named "${spec.key}".` };
    if (!tpl.isActive) return { sent: false, reason: `Template "${spec.key}" is switched off.` };

    const result = render(
      {
        subject: tpl.subject,
        bodyText: tpl.bodyText,
        bodyHtml: tpl.bodyHtml,
        variables: parseVariables(tpl.variables),
      },
      req.values,
    );

    if (!result.ok) return { sent: false, reason: result.message };

    const queued = await enqueue(env, {
      mailboxId: SYSTEM_MAILBOX_ID,
      to: recipients,
      subject: result.rendered.subject,
      text: result.rendered.text,
      ...(result.rendered.html ? { html: result.rendered.html } : {}),
      idempotencyKey: req.idempotencyKey,
      eventKey: spec.key,
      ...(req.threadId ? { threadId: req.threadId } : {}),
      actorUserId: null,
    });

    if ('error' in queued) return { sent: false, reason: queued.error };

    /**
     * Send now, awaited, rather than leaving it for the cron.
     *
     * `enqueue` only writes the row; `drainOne` is what hands it to a provider, and
     * nothing here called it — so every automated message waited for the next
     * five-minute sweep. Tolerable for a task notification and not for a password
     * reset, where the recipient is locked out and watching an inbox.
     *
     * Awaiting is right at both call sites: task assignment already runs this inside
     * a `waitUntil`, and the reset approval wants the answer so it can tell the
     * approver whether the mail actually went.
     */
    if (!queued.deduped) {
      await drainOne(env, queued.messageId);
    }

    /**
     * Only now redact a sensitive body — AFTER the transport has read it.
     *
     * The first version of this redacted straight after `enqueue`, which would have
     * delivered the placeholder instead of the reset link: `drainOne` reads the body
     * back out of the row.
     *
     * Why redact at all: `src/utils/token.ts` stores only a hash of a reset token so
     * that a database read yields nothing usable, and then the sent-mail row kept the
     * rendered message containing the live link — for the sixty minutes that token is
     * valid, the hash and a working copy of the secret it guards sat in the same
     * database. What an audit trail needs is that a message was sent, not its
     * contents.
     */
    if (spec.sensitive && !queued.deduped) {
      await db.update(schema.emailMessages)
        .set({
          bodyText: `[redacted: ${spec.key} carries a single-use link and is not retained]`,
          bodyHtml: null,
        })
        .where(eq(schema.emailMessages.id, queued.messageId));
    }

    return { sent: true, messageId: queued.messageId, deduped: queued.deduped };
  } catch (err) {
    console.error(`[email] dispatch("${req.event}") threw:`, err);
    return { sent: false, reason: 'Internal error while queueing the email.' };
  }
}

/** Absolute URL into the app, for links inside a template. */
export function appUrl(env: Env, path: string): string {
  const base = (env.WORKER_ORIGIN ?? '').replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}
