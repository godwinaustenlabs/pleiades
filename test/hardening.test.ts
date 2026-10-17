import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, reseed, forgedToken } from './helpers';
import { hashPassword } from '../src/utils/password';
import { sha256hex } from '../src/utils/token';
import { hit, sweepRateLimits } from '../src/utils/rate-limit';

/**
 * The October 2026 hardening pass — see SECURITY.md, "Audit — October 2026".
 * Each block is one finding, written as the attack it stops.
 */

const ORIGIN = 'https://pleiades.galabs.workers.dev';

async function call(path: string, init: RequestInit & { ip?: string; token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.ip) headers.set('cf-connecting-ip', init.ip);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return SELF.fetch(`https://test.local${path}`, { ...init, headers });
}

const login = (email: string, password: string, ip = '198.51.100.1') =>
  call('/api/auth/login', { method: 'POST', ip, body: JSON.stringify({ email, password }) });

async function setPassword(userId: string, password: string) {
  await env.DB.prepare('UPDATE users_logins SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?')
    .bind(await hashPassword(password), userId).run();
}

beforeAll(resetDatabase);
beforeEach(reseed);

describe('login cannot be sprayed or used to discover accounts', () => {
  it('limits attempts per IP across all accounts, and says when to retry', async () => {
    for (let i = 0; i < 20; i++) expect((await login(`nobody${i}@test.local`, 'x', '203.0.113.9')).status).toBe(401);
    const blocked = await login('u_ceo@test.local', 'x', '203.0.113.9');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Another address is unaffected.
    expect((await login('u_ceo@test.local', 'x', '203.0.113.10')).status).toBe(401);
  });

  it('answers an unknown account exactly as it answers a wrong password', async () => {
    await setPassword('u_tech', 'right-password-1');
    const unknown = await login('nobody@test.local', 'whatever');
    const wrong = await login('u_tech@test.local', 'whatever');
    expect(unknown.status).toBe(wrong.status);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it('says an account is deactivated only to somebody who knows its password', async () => {
    await setPassword('u_tech', 'right-password-1');
    await env.DB.prepare('UPDATE users_logins SET is_active = 0 WHERE id = ?').bind('u_tech').run();
    const guess = await (await login('u_tech@test.local', 'a-guess')).json() as any;
    expect(guess.error).toBe('Invalid credentials');
    const owner = await (await login('u_tech@test.local', 'right-password-1')).json() as any;
    expect(owner.error).toBe('Account is deactivated');
  });
});

describe('a session token alone cannot take the account', () => {
  const profile = async (body: object) =>
    call('/api/auth/profile', { method: 'PATCH', token: await forgedToken({ id: 'u_tech' }), body: JSON.stringify(body) });

  beforeEach(() => setPassword('u_tech', 'current-pass-1'));

  it('needs the current password to change the password', async () => {
    expect((await profile({ password: 'new-pass-123' })).status).toBe(403);
    expect((await profile({ password: 'new-pass-123', currentPassword: 'wrong' })).status).toBe(403);
    expect((await profile({ password: 'new-pass-123', currentPassword: 'current-pass-1' })).status).toBe(200);
    expect((await login('u_tech@test.local', 'new-pass-123')).status).toBe(200);
  });

  it('needs the current password to change the sign-in email, but not the name', async () => {
    expect((await profile({ email: 'elsewhere@test.local' })).status).toBe(403);
    expect((await profile({ name: 'Renamed' })).status).toBe(200);
    expect((await profile({ email: 'elsewhere@test.local', currentPassword: 'current-pass-1' })).status).toBe(200);
  });

  it('will not let one account\'s username shadow another\'s email', async () => {
    const r = await profile({ username: 'u_ceo@test.local' });
    expect(r.status).toBe(400); // contains @
    expect((await profile({ username: 'u_ceo' })).status).toBe(409);
    expect((await profile({ email: 'u_ceo@test.local', currentPassword: 'current-pass-1' })).status).toBe(409);
  });
});

describe('a reset link is spent exactly once', () => {
  it('two requests racing on one link set the password once', async () => {
    const raw = 'race-token-abc';
    await env.DB.prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, requested_at, expires_at, status) VALUES ('prt_race','u_tech',?,?,?, 'approved')`,
    ).bind(await sha256hex(raw), Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 600).run();
    const complete = (pw: string) => call('/api/auth/complete-reset', { method: 'POST', body: JSON.stringify({ token: raw, newPassword: pw }) });
    const results = await Promise.all([complete('first-pass-11'), complete('second-pass-22')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });
});

describe('ownership boundaries', () => {
  it('a note cannot be moved into somebody else\'s workspace', async () => {
    await env.DB.prepare(`INSERT INTO user_notes (note_id,user_id,title,content,created_at,updated_at) VALUES ('note_x','u_tech','Mine','',0,0)`).run();
    const r = await call('/api/dashboard/notes/note_x', {
      method: 'PATCH', token: await forgedToken({ id: 'u_tech' }), body: JSON.stringify({ title: 'Still mine', userId: 'u_ceo', id: 'note_hijack' }),
    });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare(`SELECT note_id, user_id, title FROM user_notes WHERE note_id = 'note_x'`).first()).toEqual({ note_id: 'note_x', user_id: 'u_tech', title: 'Still mine' });
  });

  it('a task cannot be moved into a department the caller cannot edit, nor its creator rewritten', async () => {
    const token = await forgedToken({ id: 'u_tech' });
    const created = await (await call('/api/tasks', { method: 'POST', token, body: JSON.stringify({ title: 'T', department: 'Tech' }) })).json() as any;
    const id = created.data.id;
    expect((await call(`/api/tasks/${id}`, { method: 'PATCH', token, body: JSON.stringify({ department: 'HR' }) })).status).toBe(403);
    expect((await call(`/api/tasks/${id}`, { method: 'PATCH', token, body: JSON.stringify({ creatorId: 'u_ceo', title: 'T2' }) })).status).toBe(200);
    expect(await env.DB.prepare('SELECT department, creator_id FROM universal_tasks WHERE task_id = ?').bind(id).first()).toEqual({ department: 'Tech', creator_id: 'u_tech' });
  });
});

describe('errors do not describe the database', () => {
  it('a server error carries a reference, not the SQL', async () => {
    // A note insert with a title of the wrong type fails inside D1.
    const r = await call('/api/dashboard/notes', { method: 'POST', token: await forgedToken({ id: 'u_tech' }), body: JSON.stringify({ title: { nested: true } }) });
    expect(r.status).toBe(500);
    const body = await r.json() as any;
    expect(body.error).toMatch(/^Something went wrong \(ref [0-9a-f]{8}\)$/);
  });
});

describe('where a token is accepted', () => {
  it('not in the query string of an ordinary API call', async () => {
    const t = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    expect((await call(`/api/tasks?token=${t}`)).status).toBe(401);
    expect((await call(`/api/tasks?token=${t}`, { method: 'POST', body: JSON.stringify({ title: 'x', department: 'Tech' }) })).status).toBe(401);
  });

  it('in the query string of a file download, where a header is impossible', async () => {
    const t = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    expect((await call(`/api/assets/download/profiles/none.png?token=${t}`)).status).not.toBe(401);
  });

  it('never from a cookie', async () => {
    const t = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    expect((await call('/api/tasks', { headers: { Cookie: `auth_token=${t}` } })).status).toBe(401);
  });
});

describe('browser boundaries', () => {
  it('CORS answers only this app\'s own origin', async () => {
    const evil = await call('/api/health', { headers: { Origin: 'https://evil.example' } });
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const own = await call('/api/health', { headers: { Origin: ORIGIN } });
    expect(own.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('every API response carries the security headers', async () => {
    const r = await call('/api/health');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(r.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('a calendar feed token is a real random secret', async () => {
    const r = await call('/api/dashboard/calendar/token/reset', { method: 'POST', token: await forgedToken({ id: 'u_tech' }) });
    const token = ((await r.json()) as any).data?.token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the rate limiter itself', () => {
  it('is atomic: ten racing hits against a limit of five admit exactly five', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => hit(env.DB, 'test:race', { max: 5, windowMs: 60_000 })));
    expect(results.filter((r) => r.allowed).length).toBe(5);
  });

  it('opens a fresh window once the old one ends, and sweeps old ones', async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) await hit(env.DB, 'test:window', { max: 3, windowMs: 1000 }, t0);
    expect((await hit(env.DB, 'test:window', { max: 3, windowMs: 1000 }, t0 + 10)).allowed).toBe(false);
    expect((await hit(env.DB, 'test:window', { max: 3, windowMs: 1000 }, t0 + 1001)).allowed).toBe(true);
    expect(await sweepRateLimits(env.DB, t0 + 1001 + 2 * 86_400_000)).toBeGreaterThan(0);
  });
});

describe('bugs found by sweeping every page and tab in a browser', () => {
  it('Ops monthly reports can be listed, created, edited and deleted (the tab called a route that never existed)', async () => {
    const token = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    const made = await (await call('/api/ops/reports', { method: 'POST', token, body: JSON.stringify({ reportName: 'September', reportMonth: '2026-09' }) })).json() as any;
    const id = made.data.id;
    expect((await call(`/api/ops/reports/${id}`, { method: 'PATCH', token, body: JSON.stringify({ opsNotes: 'Reviewed', id: 'rpt_hijack' }) })).status).toBe(200);
    const list = await (await call('/api/ops/reports', { token })).json() as any;
    expect(list.data.find((r: any) => r.id === id)).toMatchObject({ reportName: 'September', opsNotes: 'Reviewed' });
    expect((await call(`/api/ops/reports/${id}`, { method: 'DELETE', token })).status).toBe(200);
    expect((await call(`/api/ops/reports/${id}`, { method: 'DELETE', token })).status).toBe(404);
  });
});

describe('outreach tracker', () => {
  it('records calls made beside DMs and emails, and reports them', async () => {
    const token = await forgedToken({ id: 'u_ceo', isSuperadmin: true });
    const made = await (await call('/api/acquisition/outreach', { method: 'POST', token, body: JSON.stringify({ date: '2026-10-17', dmsSent: 3, emailsSent: 2, callsMade: 4 }) })).json() as any;
    expect((await call(`/api/acquisition/outreach/${made.data.id}`, { method: 'PATCH', token, body: JSON.stringify({ callsMade: 6 }) })).status).toBe(200);
    const day = await (await call('/api/acquisition/outreach?date=2026-10-17', { token })).json() as any;
    expect(day.data[0]).toMatchObject({ dmsSent: 3, emailsSent: 2, callsMade: 6 });
  });
});
