import type { Context } from 'hono';

/**
 * Fixed-window rate limiting, kept in D1.
 *
 * One `rate_limits` row per bucket — `login:ip:203.0.113.7`, say — holding a count
 * and when its window ends. A hit is ONE statement: an upsert that either starts a
 * fresh window or bumps the count, and returns the result. So two requests racing
 * cannot both read "4" and both write "5"; the database serialises them, and the
 * limit holds across every colo, which an in-memory counter in a Worker isolate
 * never could (isolates are many, short-lived and unshared).
 *
 * D1 rather than Cloudflare's Rate Limiting binding because that one is per-colo
 * and approximate by design, and these limits guard credentials and spend, where
 * "approximately five" is the wrong answer. The cost is one write per guarded
 * request, on endpoints that are rare by nature.
 *
 * Expired rows are swept by the five-minute cron (`sweepRateLimits`).
 */

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

/** The limits in force. One place, so they can be read and tuned together. */
export const LIMITS = {
  /** Per client IP, across every account. Account lockout (5 tries) still applies on top. */
  login: { max: 20, windowMs: 15 * 60_000 },
  /** Per client IP. Each request may send mail, and Resend's allowance is 90 a day. */
  resetRequest: { max: 10, windowMs: 60 * 60_000 },
  resetComplete: { max: 20, windowMs: 60 * 60_000 },
  portalLogin: { max: 20, windowMs: 15 * 60_000 },
  /**
   * Per user. A dictation re-sends its audio every few seconds for the live
   * preview, so a five-minute note is ~20 calls; this is generous for a working
   * day and stops a script from spending the shared Workers AI allowance.
   */
  transcribe: { max: 300, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

/** The caller's IP as Cloudflare saw it. Never a client-supplied header. */
export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') || 'unknown';
}

/** Counts one hit. `allowed` is false once the window's allowance is used up. */
export async function hit(
  db: D1Database,
  bucket: string,
  limit: Limit,
  now = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const row = await db.prepare(
    `INSERT INTO rate_limits (bucket, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT (bucket) DO UPDATE SET
       count    = CASE WHEN rate_limits.reset_at <= ?3 THEN 1  ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
  ).bind(bucket, now + limit.windowMs, now).first<{ count: number; reset_at: number }>();
  const count = row?.count ?? 1;
  const resetAt = row?.reset_at ?? now + limit.windowMs;
  return { allowed: count <= limit.max, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
}

/**
 * Checks a named limit and, when it is exceeded, returns the 429 to send.
 * Returns null when the request may proceed.
 */
export async function limited(c: Context, name: LimitName, key: string): Promise<Response | null> {
  const db = (c.env as { DB: D1Database }).DB;
  const { allowed, retryAfterSeconds } = await hit(db, `${name}:${key}`, LIMITS[name]);
  if (allowed) return null;
  c.header('Retry-After', String(retryAfterSeconds));
  return c.json({ success: false, error: 'Too many attempts. Please wait a few minutes and try again.' }, 429);
}

/** Deletes windows that ended more than a day ago. Run from the cron. */
export async function sweepRateLimits(db: D1Database, now = Date.now()): Promise<number> {
  const r = await db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(now - 24 * 60 * 60_000).run();
  return r.meta.changes ?? 0;
}
