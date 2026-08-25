import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@ganova/database';
import { schema } from '@ganova/database';
import { Env } from '../index';

export type UserPayload = {
  /**
   * The users_logins id whose grants apply. For an agent this is the user the
   * API key acts as, not the key's own id — an agent has no permissions of its
   * own, it borrows a person's, so that there is one place access is defined.
   */
  id: string;
  employeeId?: string | null;
  isSuperadmin: boolean;
  type: 'human' | 'agent';
  /** Present only for agents: the api_keys row, for audit and diagnostics. */
  agentKeyId?: string;
  agentName?: string;
};

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time string comparison. Both sides are hashed first so the compare
 * always runs over equal-length input and cannot leak length via early exit.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256hex(a), sha256hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>, next: Next) {
  // 1. Check API Key for Agents
  const apiKey = c.req.header('x-api-key');
  if (apiKey) {
    const db = getDb(c.env);
    // Look the key up by its SHA-256 digest. POST /admin/api-keys stores the
    // digest (and returns the raw key once), but this lookup previously compared
    // the RAW key against the key_hash column, so no key issued by that endpoint
    // could ever authenticate.
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(schema.apiKeys.keyHash, await sha256hex(apiKey)),
      with: { user: true },
    });

    if (keyRecord && keyRecord.isActive && keyRecord.user?.isActive !== false) {
      c.set('user', {
        // The agent acts as this user and resolves that user's grants.
        id: keyRecord.userId,
        employeeId: keyRecord.user?.employeeId ?? null,
        isSuperadmin: false, // Agents are never superadmins, whoever they act as
        type: 'agent',
        agentKeyId: keyRecord.id,
        agentName: keyRecord.ownerName,
      });
      return await next();
    }
  }

  // 2. Internal actor header, used by in-process agent callers.
  //
  // This REPLACES the former `x-slack-id` header, which named a Slack user and
  // was trusted outright — any unauthenticated caller could send
  // `x-slack-id: <someone>` and assume that employee's full RBAC identity.
  // Slack identity is now resolved server-side only AFTER the request signature
  // has been verified (src/agents/slack/lib/slack.ts), and the resolved
  // users_logins.id is passed here alongside a shared secret.
  //
  // The secret is what makes this safe: it never leaves the Worker, so the
  // header cannot be forged from outside.
  const actorId = c.req.header('x-agent-actor');
  if (actorId) {
    const presented = c.req.header('x-agent-secret') || '';
    const expected = c.env.AGENT_INTERNAL_SECRET || '';

    // Present-but-invalid always denies. It must never fall through to another
    // identity source, or a bad secret would silently downgrade to anonymous.
    if (!expected || !(await timingSafeEqual(presented, expected))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const db = getDb(c.env);
    const login = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, actorId),
    });

    if (!login || login.isActive === false) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('user', {
      id: login.id,
      employeeId: login.employeeId,
      isSuperadmin: !!login.isSuperadmin,
      type: 'human',
    });
    return await next();
  }

  // 3. Check JWT for Human Users
  const authHeader = c.req.header('Authorization');
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    // Fallback to cookie
    token = getCookie(c, 'auth_token') || '';
  }

  if (!token) {
    token = c.req.query('token') || '';
  }

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');

    // Reject audience-scoped tokens. Tokens minted for a narrow purpose (e.g.
    // the short-lived agent WebSocket ticket) carry an `aud` claim and must not
    // be usable as general API credentials. Login tokens carry no `aud`, so this
    // is behaviour-preserving for every existing caller.
    if (payload.aud) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // Only the id is taken from the token. Grants are read from the database on
    // every request (see rbac.ts), so a token minted before someone's access
    // was narrowed cannot carry the old access with it.
    c.set('user', {
      id: payload.id as string,
      employeeId: payload.employeeId as string | undefined,
      isSuperadmin: !!payload.isSuperadmin,
      type: 'human',
    });
    return await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

