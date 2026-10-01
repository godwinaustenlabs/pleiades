import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { SELF } from 'cloudflare:test';
import { resetDatabase, reseed, tokenFor, type FixtureUser } from './helpers';

/**
 * Mail that belongs to a post.
 *
 * Read this next to test/email-rbac.test.ts, which covers the other four branches
 * of `canUseMailbox`. The `appointment` branch is the one that makes a single
 * workspace possible: cto@ is attached to the Director Tech appointment rather
 * than to a login, so the person holding that post reads it beside their own
 * address — and, crucially, somebody holding TWO posts reads both without signing
 * out of anything.
 *
 * Fixtures (test/seed.sql):
 *   mbx_cto     appointment ap_pm, held by emp_dual (= u_dual)
 *   mbx_vacant  appointment ap_vacant, held by nobody
 *   mbx_dual    u_dual's personal box
 *   mbx_hr      an app box, so "an app grant cannot reach a post's mail" is testable
 */

async function readMessages(user: FixtureUser, mailboxId: string): Promise<number> {
  const res = await SELF.fetch(`https://test.local/api/email/mailboxes/${mailboxId}/messages`, {
    headers: { Authorization: `Bearer ${await tokenFor(user)}` },
  });
  return res.status;
}

async function mine(user: FixtureUser, query = ''): Promise<{ id: string; kind: string; canSend: boolean; appointmentTitle: string | null }[]> {
  const res = await SELF.fetch(`https://test.local/api/email/mine${query}`, {
    headers: { Authorization: `Bearer ${await tokenFor(user)}` },
  });
  return (await res.json() as any).data;
}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return SELF.fetch(`https://test.local${path}`, {
    method,
    headers: { Authorization: `Bearer ${await tokenFor('ceo')}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeAll(async () => {
  await resetDatabase();
});

describe("a post's mailbox is reached by whoever holds the post", () => {
  it('the holder can read it', async () => {
    expect(await readMessages('dual', 'mbx_cto')).toBe(200);
  });

  it('the holder can send as it', async () => {
    const boxes = await mine('dual', '?app=mine');
    expect(boxes.find((b) => b.id === 'mbx_cto')?.canSend).toBe(true);
  });

  it('nobody else can, however many app grants they hold', async () => {
    expect(await readMessages('tech', 'mbx_cto')).toBe(403);
    expect(await readMessages('mkt', 'mbx_cto')).toBe(403);
    expect(await readMessages('hold', 'mbx_cto')).toBe(403);
    // Administering mailboxes is not reading them — the same rule as a personal box.
    expect(await readMessages('mailAdmin', 'mbx_cto')).toBe(403);
  });

  it('is labelled with the post it belongs to', async () => {
    // Otherwise a second inbox simply appears, and the reader's first guess is that
    // they are looking at somebody else's mail.
    const box = (await mine('dual', '?app=mine')).find((b) => b.id === 'mbx_cto');
    expect(box?.appointmentTitle).toBe('PM Aureline');
  });

  it('takes no per-user grant rows at all', async () => {
    /**
     * A `mailbox_grants` list REPLACES the ordinary rule rather than adding to it,
     * so a list that omitted the current holder would lock them out of their own
     * official address. That is precisely the manual per-post access step this
     * model exists to delete, so the route refuses the rows outright.
     */
    const res = await api('PUT', '/api/email/mailboxes/mbx_cto/grants', {
      grants: [{ userId: 'u_tech', canRead: true, canSend: true }],
    });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain('appointment');
    expect(await readMessages('tech', 'mbx_cto')).toBe(403);
  });
});

describe('the workspace shows one person all of their mail', () => {
  it('?app=mine returns the personal box and every post box they hold, together', async () => {
    const ids = (await mine('dual', '?app=mine')).map((b) => b.id).sort();
    expect(ids).toEqual(['mbx_cto', 'mbx_dual']);
  });

  it('?app=personal stays strict, so an administrative screen can ask the narrower question', async () => {
    expect((await mine('dual', '?app=personal')).map((b) => b.id)).toEqual(['mbx_dual']);
  });

  it("a post's box never appears in a department listing", async () => {
    // cto@ is not tech@. If `?app=tech` surfaced it, everybody with tech/email would
    // be looking at the Director of Tech's correspondence.
    expect((await mine('dual', '?app=tech')).map((b) => b.id)).not.toContain('mbx_cto');
    expect((await mine('tech', '?app=hr')).map((b) => b.id)).not.toContain('mbx_cto');
  });

  it('somebody holding no post sees only their own mail', async () => {
    expect(await mine('hold', '?app=mine')).toEqual([]);
  });
});

describe('a vacant post keeps its mail, reachable by an administrator', () => {
  it('reaches nobody through holding', async () => {
    expect(await readMessages('dual', 'mbx_vacant')).toBe(403);
    expect(await readMessages('hold', 'mbx_vacant')).toBe(403);
    expect(await readMessages('tech', 'mbx_vacant')).toBe(403);
  });

  it('reaches admin/mailboxes, because mail keeps arriving at an empty post', async () => {
    // The same reasoning as the catch-all, and the same grant: somebody has to be
    // able to see what came in, and when the post is filled again the whole history
    // is there waiting.
    expect(await readMessages('mailAdmin', 'mbx_vacant')).toBe(200);
  });
});

describe('a handover moves the mailbox with the post', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('the successor reads it and the predecessor stops', async () => {
    expect(await readMessages('dual', 'mbx_cto')).toBe(200);
    expect(await readMessages('hold', 'mbx_cto')).toBe(403);

    // One edit, to the appointment. The mailbox is not touched.
    await api('PATCH', '/api/appointments/ap_pm', { employeeId: 'emp_hold' });

    expect(await readMessages('hold', 'mbx_cto')).toBe(200);
    expect(await readMessages('dual', 'mbx_cto')).toBe(403);
  });

  it('the successor keeps the stored correspondence', async () => {
    await api('PATCH', '/api/appointments/ap_pm', { employeeId: 'emp_hold' });
    const ids = (await mine('hold', '?app=mine')).map((b) => b.id);
    expect(ids).toContain('mbx_cto');
  });

  it('ending the post makes its mail administrative rather than nobody’s', async () => {
    await api('PATCH', '/api/appointments/ap_pm', { isActive: false });
    expect(await readMessages('dual', 'mbx_cto')).toBe(403);
    expect(await readMessages('mailAdmin', 'mbx_cto')).toBe(200);
  });
});

describe('creating one', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('needs an appointment that exists', async () => {
    const res = await api('POST', '/api/email/mailboxes', {
      address: 'nobody@godwinausten.org', kind: 'appointment', appointmentId: 'ap_nonexistent',
    });
    expect(res.status).toBe(404);
  });

  it('refuses a kind of appointment with no appointment named', async () => {
    const res = await api('POST', '/api/email/mailboxes', {
      address: 'shapeless@godwinausten.org', kind: 'appointment',
    });
    expect(res.status).toBe(400);
  });

  it('allows one address per post', async () => {
    const res = await api('POST', '/api/email/mailboxes', {
      address: 'cto2@godwinausten.org', kind: 'appointment', appointmentId: 'ap_pm',
    });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain('cto@godwinausten.org');
  });

  it('confers access the moment it is created, with no grant to write', async () => {
    const res = await api('POST', '/api/email/mailboxes', {
      address: 'cmo@godwinausten.org', kind: 'appointment', appointmentId: 'ap_cmo',
    });
    expect(res.status).toBe(201);
    const id = (await res.json() as any).data.id;
    expect(await readMessages('dual', id)).toBe(200);
    expect(await readMessages('hold', id)).toBe(403);
  });
});
