import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../../index';

/** Slack rejects/retries requests older than this; we mirror it to stop replays. */
const MAX_REQUEST_AGE_SECONDS = 60 * 5;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time compare over two equal-length hex digests. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies Slack's request signature.
 *
 * IMPORTANT: `rawBody` must be the exact bytes Slack sent. Parsing the body and
 * re-serializing it produces different bytes and every signature fails — read
 * `await c.req.text()` first, verify, then parse.
 *
 * Slack signs the url_verification challenge too, so verify before answering it.
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackSignature(env: Env, req: Request, rawBody: string): Promise<boolean> {
  const secret = env.SLACK_SIGNING_SECRET;
  const timestamp = req.headers.get('x-slack-request-timestamp') || '';
  const signature = req.headers.get('x-slack-signature') || '';

  // Fail closed: an unset signing secret must never mean "allow".
  if (!secret || !timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_REQUEST_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${rawBody}`));

  return timingSafeEqualHex(`v0=${toHex(mac)}`, signature);
}

export type SlackActor = {
  /** users_logins.id — the identity every downstream call is authorized as. */
  userId: string;
  employeeId: string;
  name: string | null;
};

/**
 * Resolves a Slack user id to an officeOS account.
 *
 * Only ever called AFTER the request signature has been verified. The Slack id
 * itself is never trusted as an identity beyond this lookup, and never leaves
 * this module — callers receive a users_logins.id.
 */
export async function resolveSlackActor(env: Env, slackId: string): Promise<SlackActor | null> {
  if (!slackId) return null;
  const db = getDb(env);

  const employee = await db.query.employees.findFirst({
    where: and(
      eq(schema.employees.slackId, slackId),
      eq(schema.employees.employmentStatus, 'active'),
    ),
  });
  if (!employee) return null;

  const login = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.employeeId, employee.id),
  });
  if (!login || login.isActive === false) return null;

  return { userId: login.id, employeeId: employee.id, name: employee.name ?? null };
}

/** Posts a message to a channel using the bot token. */
export async function postToSlack(botToken: string, channel: string, text: string, threadTs?: string) {
  const payload: Record<string, unknown> = { channel, text };
  if (threadTs) payload.thread_ts = threadTs;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { ok?: boolean };
  if (!data.ok) console.error('[postToSlack] Slack API error:', JSON.stringify(data));
  return data;
}

/** Replies to a slash command via its response_url (valid 30 min, 5 uses). */
export async function replyToSlashCommand(responseUrl: string, text: string) {
  const res = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  });
  if (!res.ok) {
    console.error('[replyToSlashCommand] Error:', res.status, await res.text());
  }
}
