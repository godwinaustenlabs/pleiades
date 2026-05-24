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

  // 2. Check x-slack-id header for Slack-originated agent/bot requests
  const slackId = c.req.header('x-slack-id');
  if (slackId) {
    const db = getDb(c.env);
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(schema.employees.slackId, slackId),
        eq(schema.employees.employmentStatus, 'active')
      ),
    });

    if (employee) {
      const login = await db.query.usersLogins.findFirst({
        where: eq(schema.usersLogins.employeeId, employee.id),
        with: {
          role: true,
        },
      });

      if (login) {
        // @ts-ignore
        c.set('user', {
          id: login.id,
          // @ts-ignore
          roleId: login.roleId || '',
          // @ts-ignore
          roleName: login.role?.name || 'Employee',
          employeeId: employee.id,
          isSuperadmin: !!login.isSuperadmin,
          type: 'human',
        });
        return await next();
      }
    }
    // If Slack ID was supplied but no matching active employee was found, deny access
    return c.json({ error: 'Unauthorized: No active account found for this Slack identity' }, 401);
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

