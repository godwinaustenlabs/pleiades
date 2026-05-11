import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { eq } from 'drizzle-orm';
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

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>, next: Next) {
  // 1. Check API Key for Agents
  const apiKey = c.req.header('x-api-key');
  if (apiKey) {
    const db = getDb(c.env);
    // Find active API key
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(schema.apiKeys.keyHash, apiKey), // In production, hash the incoming key first
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

  // 2. Check JWT for Human Users
  const authHeader = c.req.header('Authorization');
  let token = '';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    // Fallback to cookie
    token = getCookie(c, 'auth_token') || '';
  }

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
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
