import { describe, it, expect, beforeAll } from 'vitest';
import { SELF } from 'cloudflare:test';
import { resetDatabase, tokenFor, type FixtureUser } from './helpers';

/**
 * Create → read → update → delete against each module that had no coverage.
 *
 * This is the layer the golden manifest cannot replace. The manifest fetches
 * every GET and records the shape it gets back, which proves a SELECT compiles
 * — but a column mapped to the wrong name in an INSERT is invisible to it,
 * because the read path never touches the bad column. Only a real write does.
 *
 * Drizzle maps camelCase in TS to snake_case in SQL, and the primary key is
 * often not called `id` in the DDL, so this class of bug is a live risk here
 * rather than a theoretical one.
 *
 * One representative entity per module: enough to exercise the mapping, cheap
 * enough to stay fast.
 */

type Spec = {
  module: string;
  /** Collection path under /api. */
  path: string;
  /** Body for the create, minus anything the handler stamps server-side. */
  create: Record<string, unknown>;
  /** Body for the update. */
  update: Record<string, unknown>;
  /** A field on the read-back row that should reflect `update`. */
  check: [field: string, value: unknown];
  /** A user with no grant on this module, for the refusal case. */
  denied: FixtureUser;
};

const SPECS: Spec[] = [
  {
    module: 'tech',
    path: '/api/tech/projects',
    create: { projectName: 'Regression Project', status: 'active' },
    update: { status: 'archived' },
    check: ['status', 'archived'],
    denied: 'none',
  },
  {
    module: 'legal',
    path: '/api/legal/templates',
    create: { documentName: 'Regression NDA', jurisdiction: 'PK' },
    update: { jurisdiction: 'AE' },
    check: ['jurisdiction', 'AE'],
    denied: 'none',
  },
  {
    module: 'acquisition',
    path: '/api/acquisition/campaigns',
    create: { campaignName: 'Regression Campaign', status: 'draft' },
    update: { status: 'live' },
    check: ['status', 'live'],
    denied: 'none',
  },
];

async function req(user: FixtureUser, method: string, path: string, body?: unknown) {
  return SELF.fetch(`https://test.local${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await tokenFor(user)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// resetDatabase() replays the production DDL, which uses bare CREATE TABLE —
// so it must run exactly once per file, not once per describe block.
beforeAll(async () => {
  await resetDatabase();
});

describe('module round-trips', () => {
  describe.each(SPECS)('$module', (spec) => {
    it('creates, reads, updates and deletes', async () => {
      const createRes = await req('ceo', 'POST', spec.path, spec.create);
      expect(createRes.status, `create ${spec.path}`).toBe(201);
      const { data } = await createRes.json<{ data: { id: string } }>();
      const id = data.id;
      expect(id, 'create returned no id').toBeTruthy();

      // Appears in the collection.
      const listRes = await req('ceo', 'GET', spec.path);
      expect(listRes.status).toBe(200);
      const list = await listRes.json<{ data: Array<{ id: string }> }>();
      expect(list.data.some((r) => r.id === id), 'created row missing from list').toBe(true);

      // Reads back by id.
      const getRes = await req('ceo', 'GET', `${spec.path}/${id}`);
      expect(getRes.status).toBe(200);

      // Updates, and the change is visible on read-back. This is the assertion
      // that catches a bad column mapping: a write to the wrong column still
      // returns 200, and only the read-back disagrees.
      const patchRes = await req('ceo', 'PATCH', `${spec.path}/${id}`, spec.update);
      expect(patchRes.status).toBe(200);
      const after = await (await req('ceo', 'GET', `${spec.path}/${id}`)).json<{ data: Record<string, unknown> }>();
      expect(after.data[spec.check[0]]).toBe(spec.check[1]);

      // Deletes, and is then gone.
      const delRes = await req('ceo', 'DELETE', `${spec.path}/${id}`);
      expect(delRes.status).toBe(200);
      expect((await req('ceo', 'GET', `${spec.path}/${id}`)).status).toBe(404);
    });

    it('refuses a caller with no grant', async () => {
      const res = await req(spec.denied, 'GET', spec.path);
      expect(res.status, `${spec.path} should be forbidden for ${spec.denied}`).toBe(403);
    });
  });
});


/**
 * The modules whose surface is not a CRUD collection, so they get bespoke
 * round-trips rather than a row in SPECS.
 */
describe('module round-trips (non-CRUD)', () => {
  it('messages: post, list, resolve, delete', async () => {
    const created = await req('ceo', 'POST', '/api/messages', {
      senderApp: 'tech',
      targetApp: 'ops',
      type: 'request',
      title: 'Regression',
      message: 'hello',
    });
    expect(created.status).toBe(201);
    const { data } = await created.json<{ data: { id: string } }>();

    const list = await req('ceo', 'GET', '/api/messages');
    expect(list.status).toBe(200);

    expect((await req('ceo', 'PATCH', `/api/messages/${data.id}/resolve`)).status).toBe(200);
    expect((await req('ceo', 'DELETE', `/api/messages/${data.id}`)).status).toBe(200);
  });

  it('notifications: send, list, mark read, clear', async () => {
    // /send is gated on admin/users edit, not on a notifications feature.
    const sent = await req('ceo', 'POST', '/api/notifications/send', {
      userId: 'u_tech',
      title: 'Regression',
      message: 'hello',
    });
    // created() — 201, not 200.
    expect(sent.status).toBe(201);

    const list = await req('tech', 'GET', '/api/notifications');
    expect(list.status).toBe(200);
    const rows = await list.json<{ data: Array<{ id: string }> }>();
    expect(rows.data.length).toBeGreaterThan(0);

    expect((await req('tech', 'PATCH', `/api/notifications/${rows.data[0].id}/read`)).status).toBe(200);
    expect((await req('tech', 'DELETE', '/api/notifications')).status).toBe(200);
  });

  it('notifications: refuses a forged recipient', async () => {
    // The handler only notifies accounts that exist, so this cannot be used to
    // seed rows against arbitrary ids.
    const res = await req('ceo', 'POST', '/api/notifications/send', {
      userId: 'u_does_not_exist',
      title: 'x',
      message: 'y',
    });
    expect(res.status).toBe(404);
  });

  it('crm: creates a ticket scoped to a committee and reads it back', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT INTO committees (committee_id, committee_name, created_at, updated_at) VALUES ('cmt_regression', 'Regression Committee', 0, 0)",
    ).run();

    const created = await req('ceo', 'POST', '/api/crm/committees/cmt_regression/tickets', {
      title: 'Regression ticket',
      description: 'raised by the suite',
    });
    expect(created.status).toBe(201);
    const { data } = await created.json<{ data: { id: string } }>();

    const read = await req('ceo', 'GET', `/api/crm/tickets/${data.id}`);
    expect(read.status).toBe(200);
    const row = await read.json<{ data: Record<string, unknown> }>();
    // committeeId is stamped server-side from the path, never taken from the
    // body — the same rule company_documents.department follows.
    expect(row.data.committeeId).toBe('cmt_regression');
    expect(row.data.status).toBe('open');
  });

  it('public calendar: serves a feed for a valid token and 404s otherwise', async () => {
    const { env } = await import('cloudflare:test');
    await env.DB.prepare(
      "INSERT INTO calendar_feeds (id, user_id, token, created_at, updated_at) VALUES ('cf_reg', 'u_ceo', 'regression-token', 0, 0)",
    ).run();

    // Unauthenticated on purpose: the token in the path is the credential.
    const good = await SELF.fetch('https://test.local/api/public/calendar/feed/regression-token.ics');
    expect(good.status).toBe(200);
    const body = await good.text();
    expect(body).toContain('BEGIN:VCALENDAR');

    const bad = await SELF.fetch('https://test.local/api/public/calendar/feed/not-a-real-token.ics');
    expect(bad.status).toBe(404);
  });

  it('portal is a separate auth world from staff', async () => {
    // /api/portal has its own clientAuth and JWTs of type 'client'. A staff
    // token — even a superadmin's — must not open it, or the client portal
    // would inherit the whole staff surface.
    for (const path of ['/api/portal/whoami', '/api/portal/tickets', '/api/portal/committees']) {
      const res = await req('ceo', 'GET', path);
      expect(res.status, `${path} accepted a staff token`).toBe(401);
    }
  });
});
