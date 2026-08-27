import { Hono } from 'hono';
import { eq, and, or } from 'drizzle-orm';
import { sign } from 'hono/jwt';
import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { checkFeaturePermission } from '../middleware/rbac';
import { ok, badRequest, notFound, forbidden, serverError } from '../utils/response';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { hashPassword, verifyPassword } from '../utils/password';

const authRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

// ── Helpers ─────────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate a cryptographically random URL-safe token string. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS     = 15 * 60; // 15 minutes

// ── POST /auth/login ─────────────────────────────────────────────────────────

/**
 * POST /auth/login
 * Body: { email: string; password: string }
 * Returns a signed JWT valid for 8 hours.
 */
authRouter.post('/login', async (c) => {
  try {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return badRequest(c, 'email and password are required');

    const db = getDb(c.env);

    const user = await db.query.usersLogins.findFirst({
      where: or(
        eq(schema.usersLogins.email, email.toLowerCase().trim()),
        eq(schema.usersLogins.username, email.toLowerCase().trim())
      ),
      with: { employee: true },
    });

    if (!user) return c.json({ success: false, error: 'Invalid credentials' }, 401);
    if (!user.isActive) return c.json({ success: false, error: 'Account is deactivated' }, 401);

    // Lockout check
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return c.json({
        success: false,
        error: 'Account temporarily locked due to too many failed attempts. Try again later.',
      }, 429);
    }

    const { valid, needsUpgrade } = await verifyPassword(password, user.passwordHash);

    if (!valid) {
      // Increment failed attempts
      const attempts = (user.failedAttempts ?? 0) + 1;
      const lockUntil = attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_SECONDS * 1000)
        : null;
      await db.update(schema.usersLogins)
        .set({ failedAttempts: attempts, lockedUntil: lockUntil })
        .where(eq(schema.usersLogins.id, user.id));
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    // Successful login: reset counters + record timestamp. This is also the only
    // point at which the plaintext is available, so a legacy unsalted SHA-256
    // hash is transparently upgraded to PBKDF2 here — no password reset needed.
    const successUpdate: Record<string, unknown> = {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    };
    if (needsUpgrade) {
      successUpdate.passwordHash = await hashPassword(password);
    }
    await db.update(schema.usersLogins)
      .set(successUpdate)
      .where(eq(schema.usersLogins.id, user.id));

    await logAudit(c.env, user.id, 'LOGIN', 'users_logins', user.id, { email });

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      id: user.id,
      // No permission claim of any kind rides in the token. Grants are read
      // from user_app_permissions on every request (see rbac.ts), so narrowing
      // someone's access takes effect immediately rather than at token expiry.
      employeeId: user.employeeId ?? null,
      isSuperadmin: user.isSuperadmin || false,
      type: 'human',
      iat: now,
      exp: now + 60 * 60 * 8, // 8 hours
    };

    if (!c.env.JWT_SECRET) {
      console.error('[ERROR] JWT_SECRET is missing from environment');
      throw new Error('Server configuration error: JWT_SECRET missing');
    }
    const token = await sign(payload, c.env.JWT_SECRET, 'HS256');

    return ok(c, {
      token,
      expiresIn: 60 * 60 * 8,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        // Job title for display only — it grants nothing.
        // @ts-ignore — employee is present via `with`
        title: user.employee?.role || user.employee?.department || 'Staff',
        employeeId: user.employeeId,
        isSuperadmin: user.isSuperadmin || false,
      },
    });
  } catch (err) {
    return serverError(c, err);
  }
});

// ── GET /auth/whoami ─────────────────────────────────────────────────────────

authRouter.get('/whoami', authMiddleware, async (c) => {
  const user = c.get('user')!;
  if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

  const db = getDb(c.env);
  
  const userData = await db.query.usersLogins.findFirst({
    where: eq(schema.usersLogins.id, user.id),
    with: { employee: true }
  });

  if (!userData) return c.json({ success: false, error: 'User not found' }, 404);

  return ok(c, {
    ...user,
    username: userData.username,
    name: userData.name,
    // @ts-ignore — employee is present via `with`
    title: userData.employee?.role || userData.employee?.department || 'Staff',
  });
});

// ── GET /auth/profile ────────────────────────────────────────────────────────

authRouter.get('/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user')!;
    const db = getDb(c.env);
    const userData = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, user.id),
      columns: { passwordHash: false },
      with: {
        employee: {
          columns: { profilePhoto: true }
        }
      }
    });
    if (!userData) return notFound(c);
    
    // Add profilePhoto to the result object
    const result = {
      ...userData,
      profilePhoto: userData.employee?.profilePhoto || null
    };
    
    return ok(c, result);
  } catch (err) { return serverError(c, err); }
});

// ── PATCH /auth/profile ──────────────────────────────────────────────────────

authRouter.patch('/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user')!;
    const db = getDb(c.env);
    const body = await c.req.json<{ name?: string; username?: string; email?: string; phone?: string; password?: string }>();
    
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.username !== undefined) updateData.username = body.username.toLowerCase().trim();
    if (body.email !== undefined) updateData.email = body.email.toLowerCase().trim();
    if (body.phone !== undefined) updateData.phone = body.phone.trim();
    if (body.password) {
      if (body.password.length < 8) return badRequest(c, 'Password must be at least 8 characters');
      updateData.passwordHash = await hashPassword(body.password);
      updateData.passwordUpdatedAt = new Date();
    }

    if (Object.keys(updateData).length === 0) return badRequest(c, 'No changes provided');

    await db.update(schema.usersLogins).set(updateData).where(eq(schema.usersLogins.id, user.id));
    await logAudit(c.env, user.id, 'UPDATE', 'users_logins', user.id, { profile_updated: Object.keys(updateData) });

    return ok(c, { message: 'Profile updated successfully' });
  } catch (err) { return serverError(c, err); }
});

// ── POST /auth/profile/avatar ───────────────────────────────────────────────

authRouter.post('/profile/avatar', authMiddleware, async (c) => {
  try {
    const user = c.get('user')!;
    const body = await c.req.parseBody();
    const file = body.file as File;
    const targetEmployeeId = body.employeeId as string || user.employeeId;

    if (!file) return badRequest(c, 'No file uploaded');
    if (!c.env.CRM_BUCKET) return badRequest(c, 'Storage bucket not configured');

    // If targeting someone else, must be superadmin or hold hr/employees edit.
    // This previously read the deprecated user_app_access table (empty in
    // production) and then called an unimported `forbidden`, so the path threw a
    // ReferenceError and 500'd for every non-superadmin.
    if (targetEmployeeId !== user.employeeId) {
      if (!(await checkFeaturePermission(c, 'hr', 'employees', 'edit'))) {
        return forbidden(c, 'You do not have permission to update other employee photos');
      }
    }

    const extension = file.name.split('.').pop() || 'png';
    const key = `avatars/${targetEmployeeId || user.id}_${Date.now()}.${extension}`;
    
    await c.env.CRM_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type }
    });

    const avatarUrl = `/api/assets/download/${key}`;
    const db = getDb(c.env);
    
    // Sync with employee record
    if (targetEmployeeId) {
      await db.update(schema.employees)
        .set({ profilePhoto: avatarUrl, updatedAt: new Date() })
        .where(eq(schema.employees.id, targetEmployeeId));
    }

    return ok(c, { avatarUrl });
  } catch (err) {
    return serverError(c, err);
  }
});

/**
 * POST /auth/request-reset
 * Body: { email: string }
 *
 * Step 1 of the delegated reset flow.
 * Creates a pending token. The owning HR Manager (or CEO) must approve it
 * before the employee can set a new password.
 *
 * Always returns { submitted: true } — never reveals whether the email exists.
 */
authRouter.post('/request-reset', async (c) => {
  try {
    const { email } = await c.req.json<{ email: string }>();
    if (!email) return badRequest(c, 'email is required');

    const db = getDb(c.env);

    const user = await db.query.usersLogins.findFirst({
      where: eq(schema.usersLogins.email, email.toLowerCase().trim()),
    });

    // Return the same response whether or not the user exists (prevents email enumeration)
    if (!user || !user.isActive) {
      return ok(c, { submitted: true, message: 'If this email exists, a reset request has been queued for HR approval.' });
    }

    // Cancel any existing pending tokens for this user
    await db.update(schema.passwordResetTokens)
      .set({ status: 'expired' })
      .where(and(
        eq(schema.passwordResetTokens.userId, user.id),
        eq(schema.passwordResetTokens.status, 'pending'),
      ));

    const rawToken = generateToken();
    const tokenHash = await sha256hex(rawToken);
    const id = generateId('rst');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 h

    await db.insert(schema.passwordResetTokens).values({
      id,
      userId: user.id,
      tokenHash,
      requestedAt: now,
      expiresAt,
      status: 'pending',
    });

    await logAudit(c.env, user.id, 'RESET', 'password_reset_tokens', id, {
      action: 'reset_requested',
      email,
    });

    // In a production system, notify the owner HR Manager here (email/Slack).
    // The HR Manager finds the request at GET /admin/pending-resets.

    return ok(c, {
      submitted: true,
      message: 'Your password reset request has been queued. Your HR Manager must approve it before you can set a new password.',
      // DO NOT return rawToken here — it is for internal use only when email delivery is wired up
    });
  } catch (err) {
    return serverError(c, err);
  }
});

// ── POST /auth/complete-reset ─────────────────────────────────────────────────

/**
 * POST /auth/complete-reset
 * Body: { token: string; newPassword: string }
 *
 * Step 3 of the delegated reset flow. Called by the employee after their
 * HR Manager has approved the reset (status = 'approved').
 */
authRouter.post('/complete-reset', async (c) => {
  try {
    const { token, newPassword } = await c.req.json<{ token: string; newPassword: string }>();
    if (!token || !newPassword) return badRequest(c, 'token and newPassword are required');
    if (newPassword.length < 8) return badRequest(c, 'Password must be at least 8 characters');

    const db = getDb(c.env);
    const tokenHash = await sha256hex(token);

    const resetRecord = await db.query.passwordResetTokens.findFirst({
      where: eq(schema.passwordResetTokens.tokenHash, tokenHash),
    });

    if (!resetRecord) return c.json({ success: false, error: 'Invalid or unknown token' }, 400);
    if (resetRecord.status !== 'approved') {
      return c.json({
        success: false,
        error: resetRecord.status === 'pending'
          ? 'This reset has not been approved by your HR Manager yet.'
          : `Token is ${resetRecord.status} and cannot be used.`,
      }, 400);
    }
    if (new Date(resetRecord.expiresAt) < new Date()) {
      await db.update(schema.passwordResetTokens)
        .set({ status: 'expired' })
        .where(eq(schema.passwordResetTokens.id, resetRecord.id));
      return c.json({ success: false, error: 'Token has expired. Please request a new reset.' }, 400);
    }

    const newHash = await hashPassword(newPassword);
    await db.update(schema.usersLogins)
      .set({ passwordHash: newHash, passwordUpdatedAt: new Date(), failedAttempts: 0, lockedUntil: null })
      .where(eq(schema.usersLogins.id, resetRecord.userId));

    await db.update(schema.passwordResetTokens)
      .set({ status: 'used' })
      .where(eq(schema.passwordResetTokens.id, resetRecord.id));

    await logAudit(c.env, resetRecord.userId, 'RESET', 'users_logins', resetRecord.userId, {
      action: 'password_reset_completed',
      tokenId: resetRecord.id,
    });

    return ok(c, { reset: true, message: 'Password updated successfully. Please log in with your new password.' });
  } catch (err) {
    return serverError(c, err);
  }
});

export default authRouter;
