import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@ganova/database';
import { schema } from '@ganova/database';
import { Env } from '../index';

export type UserPayload = {
  id: string;
  roleId: string;
  roleName: string;
  employeeId?: string | null;
  isSuperadmin: boolean;
  type: 'human' | 'agent';
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
      with: {
        role: true,
      },
    });

    if (keyRecord && keyRecord.isActive) {
      // Valid Agent
      c.set('user', {
        id: keyRecord.id,
        roleId: keyRecord.roleId,
        // @ts-ignore
        roleName: keyRecord.role?.name || 'Agent',
        isSuperadmin: false, // Agents are never superadmins
        type: 'agent',
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
  // has been verified (src/agents/lib/slack.ts), and the resolved
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
      with: { role: true },
    });

    if (!login || login.isActive === false) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('user', {
      id: login.id,
      roleId: login.roleId,
      // @ts-ignore — role is present via `with`
      roleName: login.role?.name || 'Employee',
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

    c.set('user', {
      id: payload.id as string,
      roleId: payload.roleId as string,
      roleName: payload.roleName as string,
      employeeId: payload.employeeId as string | undefined,
      isSuperadmin: !!payload.isSuperadmin,
      type: 'human',
    });
    return await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}

