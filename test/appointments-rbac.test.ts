import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { resetDatabase, reseed, tokenFor, forgedToken, getWithToken, type FixtureUser } from './helpers';

/**
 * Access that belongs to a POST rather than to a person.
 *
 * This is the file to read before changing `collectGrantSources` in
 * src/middleware/rbac.ts. The model it implements is: one login per person, and
 * what that person can reach is their own grants UNIONED with the grants of every
 * active appointment they hold.
 *
 * The cases below are the ones the union can plausibly be got wrong in, and one
 * of them — the handover — is the entire reason the indirection exists. If
 * reassigning an appointment stopped moving access with it, appointment-level
 * grants would be pure overhead over per-user ones.
 *
 * Fixtures are in test/seed.sql:
 *   u_dual / emp_dual   ap_cmo (acquisition/campaigns) + ap_pm (tech/projects,
 *                       tech/issues delete-only) + ap_ended (INACTIVE,
 *                       finance/transactions) + ap_chair (committee cmt_test)
 *                       + one direct grant, dashboard/overview
 *   u_hold / emp_hold   nothing at all
 *   ap_vacant           legal/agreements, held by nobody
 */

/** A route is authorized iff it does not 403. A 500 from the handler still counts — this tests gates. */
async function allowed(user: FixtureUser, path: string): Promise<boolean> {
  const res = await SELF.fetch(`https://test.local${path}`, {
    headers: { Authorization: `Bearer ${await tokenFor(user)}` },
  });
  return res.status !== 403;
}

async function grantsOf(user: FixtureUser): Promise<{ appName: string; feature: string; canView: boolean; canEdit: boolean; canDelete: boolean }[]> {
  const res = await SELF.fetch('https://test.local/api/permissions/me', {
    headers: { Authorization: `Bearer ${await tokenFor(user)}` },
  });
  const body = await res.json() as { data: any[] };
  return body.data;
}

const has = (
  grants: { appName: string; feature: string; canView: boolean; canEdit: boolean; canDelete: boolean }[],
  app: string,
  feature: string,
) => grants.find((g) => g.appName === app && g.feature === feature);

/** Writes through the real route, as the superadmin, so the tests drive the API rather than the table. */
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

describe('a person holds the union of their appointments', () => {
  it('reaches what every active appointment grants, at once, in one login', async () => {
    const grants = await grantsOf('dual');
    // From ap_cmo.
    expect(has(grants, 'acquisition', 'campaigns')?.canEdit).toBe(true);
    // From ap_pm. Both, simultaneously — this is the CMO-and-project-manager case.
    expect(has(grants, 'tech', 'projects')?.canEdit).toBe(true);
  });

  it('also reaches what is granted to the person directly', async () => {
    // Direct grants are not replaced by appointment grants, in either direction:
    // the two are unioned, so there is no precedence rule that could drop one.
    expect(has(await grantsOf('dual'), 'dashboard', 'overview')?.canEdit).toBe(true);
  });

  it('opens the modules those appointments belong to', async () => {
    expect(await allowed('dual', '/api/acquisition/campaigns')).toBe(true);
    expect(await allowed('dual', '/api/tech/projects')).toBe(true);
  });

  it('flattens delete into edit and view, the same as a direct grant', async () => {
    // ap_pm holds tech/issues as canDelete ONLY.
    const issues = has(await grantsOf('dual'), 'tech', 'issues');
    expect(issues?.canDelete).toBe(true);
    expect(issues?.canEdit).toBe(true);
    expect(issues?.canView).toBe(true);
  });

  it('reaches nothing from an appointment that has been ended', async () => {
    // ap_ended grants finance/transactions and is is_active = 0.
    expect(has(await grantsOf('dual'), 'finance', 'transactions')).toBeUndefined();
    expect(await allowed('dual', '/api/finance/transactions')).toBe(false);
  });

  it('reaches nothing from an appointment somebody else holds', async () => {
    expect(await allowed('hold', '/api/tech/projects')).toBe(false);
    expect(await allowed('hold', '/api/acquisition/campaigns')).toBe(false);
  });

  it('grants a vacant post to nobody', async () => {
    // ap_vacant carries legal/agreements and has no holder. If an empty post
    // conferred its access on anyone, it would most likely be on whoever held it
    // last — which is the worst outcome available here.
    expect(has(await grantsOf('dual'), 'legal', 'agreements')).toBeUndefined();
    expect(await allowed('dual', '/api/legal/agreements')).toBe(false);
    expect(await allowed('hold', '/api/legal/agreements')).toBe(false);
  });
});

describe('the employee link is read from the database, never from the token', () => {
  it('ignores an employeeId claim the database does not agree with', async () => {
    // A session lasts over a week and its copy of `employee_id` is made when the
    // token is signed. If that claim decided which appointments applied, somebody
    // unlinked from an employee — or relinked to a different one — would keep the
    // old post's access until their token expired. Worse, this shape is forgeable
    // by anyone who can get a token signed for any account.
    const token = await forgedToken({ id: 'u_hold', employeeId: 'emp_dual' });
    const res = await getWithToken(token, '/api/tech/projects');
    expect(res.status).toBe(403);
  });

  it('applies the appointments of the employee the database names, even when the token says none', async () => {
    const token = await forgedToken({ id: 'u_dual', employeeId: null });
    const res = await getWithToken(token, '/api/tech/projects');
    expect(res.status).not.toBe(403);
  });
});

describe('a handover moves access with the post', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('reassigning the appointment grants the successor and revokes the predecessor', async () => {
    expect(await allowed('dual', '/api/tech/projects')).toBe(true);
    expect(await allowed('hold', '/api/tech/projects')).toBe(false);

    const res = await api('PATCH', '/api/hr/appointments/ap_pm', { employeeId: 'emp_hold' });
    expect(res.status).toBe(200);
    expect((await res.json() as any).data.handover).toBe(true);

    // No permission matrix was opened for either person.
    expect(await allowed('hold', '/api/tech/projects')).toBe(true);
    expect(await allowed('dual', '/api/tech/projects')).toBe(false);

    // And only THAT post moved: the other appointment is untouched.
    expect(await allowed('dual', '/api/acquisition/campaigns')).toBe(true);
    expect(await allowed('hold', '/api/acquisition/campaigns')).toBe(false);
  });

  it('takes effect on the next request rather than at token expiry', async () => {
    // Nothing about authorization rides in the JWT, so the token minted before the
    // handover is the same token that is refused after it.
    const token = await tokenFor('dual');
    expect((await getWithToken(token, '/api/tech/projects')).status).not.toBe(403);
    await api('PATCH', '/api/hr/appointments/ap_pm', { employeeId: 'emp_hold' });
    expect((await getWithToken(token, '/api/tech/projects')).status).toBe(403);
  });

  it('deactivating the appointment withdraws its access without deleting anything', async () => {
    await api('PATCH', '/api/hr/appointments/ap_pm', { isActive: false });
    expect(await allowed('dual', '/api/tech/projects')).toBe(false);

    // The grants are still there, so reactivating restores them as they were.
    const rows = await api('GET', '/api/admin/appointments/ap_pm/permissions');
    expect((await rows.json() as any).data.length).toBeGreaterThan(0);

    await api('PATCH', '/api/hr/appointments/ap_pm', { isActive: true });
    expect(await allowed('dual', '/api/tech/projects')).toBe(true);
  });

  it('leaves the holder’s login alone when the post is deleted', async () => {
    // This used to deactivate the account named by `appointments.account_id`, so
    // ending one of somebody's posts locked them out of the system entirely.
    // `?cascade=1` because the post owns grants — see test/deletion.test.ts for why
    // the plain form refuses and what it says.
    const res = await api('DELETE', '/api/hr/appointments/ap_cmo?cascade=1');
    expect(res.status).toBe(200);

    // Still signed in, and still holding everything the OTHER post grants.
    expect(await allowed('dual', '/api/tech/projects')).toBe(true);
    const login = await env.DB.prepare('SELECT is_active FROM users_logins WHERE id = ?').bind('u_dual').first();
    expect(login?.is_active).toBe(1);
  });

  it('deleting the post deletes its grants, so a new post reusing nothing inherits nothing', async () => {
    await api('DELETE', '/api/hr/appointments/ap_cmo?cascade=1');
    const left = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM appointment_app_permissions WHERE appointment_id = ?')
      .bind('ap_cmo').first();
    expect(left?.n).toBe(0);
    expect(await allowed('dual', '/api/acquisition/campaigns')).toBe(false);
  });

  it('will not quietly delete a post that owns a mailbox — it says so first', async () => {
    // This used to be a flat refusal with nothing to do about it. It now reports what
    // is in the way and how to proceed; test/deletion.test.ts covers what the cascade
    // then does with the mailbox, which is keep it rather than delete it.
    const res = await api('DELETE', '/api/hr/appointments/ap_pm');
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.error).toContain('cascade=1');
    expect(JSON.stringify(body.data.impact)).toContain('cto@godwinausten.org');

    // Still there, untouched.
    const still = await env.DB.prepare('SELECT COUNT(*) AS n FROM appointments WHERE appointment_id = ?').bind('ap_pm').first();
    expect(still?.n).toBe(1);
  });

  it('moves the committee seat, because membership is itself access', async () => {
    // Committee membership implies the crm grants in rbac.ts, so a seat left behind
    // on a handover is access left behind.
    await api('PATCH', '/api/hr/appointments/ap_chair', { employeeId: 'emp_hold' });

    const seats = await env.DB
      .prepare('SELECT employee_id FROM committee_members WHERE committee_id = ?')
      .bind('cmt_test').all();
    expect(seats.results.map((r: any) => r.employee_id)).toEqual(['emp_hold']);
  });
});

describe('editing what a post grants is an admin authority, not an HR one', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('is gated on admin/permissions edit', async () => {
    const res = await SELF.fetch('https://test.local/api/admin/appointments/ap_pm/permissions', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${await tokenFor('dual')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: [{ appName: 'finance', feature: 'transactions', canView: true }] }),
    });
    // u_dual can edit nothing in admin, so it cannot even reach the router.
    expect(res.status).toBe(403);
  });

  it('cannot be reached through the HR appointment routes', async () => {
    // `POST /hr/appointments` takes hr/appointments edit. If it also wrote grants,
    // that grant would be an escalation to anything — which is why `PUT
    // /api/permissions/user/:id` was deleted in the first place. A `permissions`
    // key on the body must be ignored, not honoured.
    const res = await api('POST', '/api/hr/appointments', {
      roleOrTitle: 'Invented Post',
      employeeId: 'emp_hold',
      permissions: [{ appName: 'finance', feature: 'transactions', canView: true, canEdit: true }],
    });
    expect(res.status).toBe(201);
    const id = (await res.json() as any).data.id;

    const rows = await api('GET', `/api/admin/appointments/${id}/permissions`);
    expect((await rows.json() as any).data).toEqual([]);
    expect(await allowed('hold', '/api/finance/transactions')).toBe(false);
  });

  it('refuses a grant naming a feature APP_FEATURES does not declare', async () => {
    // Such a row can never satisfy getPerm(), so it would sit in the table looking
    // like access while doing nothing at all.
    const res = await api('PUT', '/api/admin/appointments/ap_pm/permissions', {
      permissions: [{ appName: 'tech', feature: 'not_a_feature', canView: true }],
    });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain('tech/not_a_feature');
  });

  it('replaces the whole set, so unticking actually removes access', async () => {
    await api('PUT', '/api/admin/appointments/ap_pm/permissions', { permissions: [] });
    expect(await allowed('dual', '/api/tech/projects')).toBe(false);
  });

  it('applies immediately to whoever holds the post', async () => {
    expect(await allowed('dual', '/api/legal/agreements')).toBe(false);
    await api('PUT', '/api/admin/appointments/ap_pm/permissions', {
      permissions: [{ appName: 'legal', feature: 'agreements', canView: true, canEdit: true }],
    });
    expect(await allowed('dual', '/api/legal/agreements')).toBe(true);
  });
});

describe('the effective-permissions view says where each grant came from', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('separates the person’s own grants from each post’s', async () => {
    const res = await api('GET', '/api/admin/users/u_dual/effective-permissions');
    const data = (await res.json() as any).data;

    expect(data.employeeId).toBe('emp_dual');
    expect(data.direct.map((g: any) => `${g.appName}/${g.feature}`)).toEqual(['dashboard/overview']);

    // Only the ACTIVE posts. ap_ended must not appear at all — listing it with its
    // grants would read as access the person has.
    const titles = data.appointments.map((a: any) => a.roleOrTitle).sort();
    expect(titles).toEqual(['CMO', 'Committee Chair', 'PM Aureline']);

    const effective = data.effective.map((g: any) => `${g.appName}/${g.feature}`);
    expect(effective).toContain('acquisition/campaigns');
    expect(effective).toContain('tech/projects');
    expect(effective).toContain('dashboard/overview');
    expect(effective).not.toContain('finance/transactions');
  });

  it('reports a superadmin as bypassing rather than as holding everything', async () => {
    const res = await api('GET', '/api/admin/users/u_ceo/effective-permissions');
    expect((await res.json() as any).data.isSuperadmin).toBe(true);
  });

  it('is what /permissions/user/:id agrees with, for somebody else', async () => {
    // These two used to disagree: the other-user branch of listGrants had its own
    // copy of the query and read only user_app_permissions, so it under-reported —
    // which invites granting again, to the person, what the post already grants.
    const res = await api('GET', '/api/permissions/user/u_dual');
    const reported = ((await res.json() as any).data as any[]).map((g) => `${g.appName}/${g.feature}`).sort();

    const eff = await api('GET', '/api/admin/users/u_dual/effective-permissions');
    const effective = ((await eff.json() as any).data.effective as any[]).map((g) => `${g.appName}/${g.feature}`).sort();

    expect(reported).toEqual(effective);
  });
});

describe('one login per person', () => {
  beforeEach(async () => {
    await reseed();
  });

  it('is enforced by the database, not only by the route', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO users_logins (id,email,username,name,password_hash,employee_id,is_active,created_at,failed_attempts) VALUES ('u_second','second@test.local','second','Second','x','emp_dual',1,0,0)",
      ).run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('provisions the account against the employee, and updates that same one', async () => {
    const first = await api('POST', '/api/hr/employees/emp_hold/account', {
      email: 'successor@godwinausten.org', username: 'successor', password: 'correct-horse',
    });
    // emp_hold already has u_hold, so this is an update, not a second login.
    expect(first.status).toBe(200);
    expect((await first.json() as any).data).toMatchObject({ id: 'u_hold', created: false });
  });

  it('refuses to rewrite a superadmin’s credentials', async () => {
    // hr/employees edit is a much weaker permission than the one that should be
    // needed to take over an account. Without this guard, the escalation path to
    // superadmin is one HR grant long.
    await env.DB.prepare("UPDATE users_logins SET employee_id = 'emp_hold' WHERE id = 'u_hold'").run();
    await env.DB.prepare("UPDATE users_logins SET is_superadmin = 1 WHERE id = 'u_hold'").run();

    const res = await api('POST', '/api/hr/employees/emp_hold/account', { password: 'taking-this-over' });
    expect(res.status).toBe(403);
  });

  it('refuses an address that already signs another account in', async () => {
    const res = await api('POST', '/api/hr/employees/emp_hold/account', {
      email: 'u_dual@test.local', username: 'whatever', password: 'correct-horse',
    });
    expect(res.status).toBe(400);
    // Reported, never resolved by reassignment: provisioning a new starter with a
    // colleague's address must not hand over the colleague's account.
    expect((await res.json() as any).error).toContain('another account');
  });
});
