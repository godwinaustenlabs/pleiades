import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { resetDatabase } from './helpers';

/**
 * The union, over a population rather than a handful of cases.
 *
 * `appointments-rbac.test.ts` pins the named behaviours. This one builds a random
 * org — people holding zero to four posts each, active and ended, vacant posts,
 * grants drawn from the real feature catalogue — and checks the server's answer
 * against a union computed independently here, for every person, after every
 * mutation.
 *
 * It exists because the resolver's inputs multiply: two grant tables, an active
 * flag, a nullable holder, the delete⊃edit⊃view implication and a committee rule.
 * Hand-written cases cover the combinations somebody thought of.
 *
 * The randomness is SEEDED. A failure prints the seed and re-running reproduces the
 * exact org — a flaky authorization test would be worse than no test, because the
 * reasonable response to one is to stop believing it.
 */

const SEED = 0x5eed1234;

/** mulberry32. Small, deterministic, and good enough to shuffle a fixture. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Grant = { appName: string; feature: string; canView: boolean; canEdit: boolean; canDelete: boolean };
type Appt = { id: string; holder: string | null; active: boolean; grants: Grant[] };
type Person = { employeeId: string; userId: string; direct: Grant[] };

const PEOPLE = 6;
const APPOINTMENTS = 14;

let people: Person[] = [];
let appts: Appt[] = [];
let catalogue: [string, string][] = [];

const key = (g: { appName: string; feature: string }) => `${g.appName}/${g.feature}`;

/** The expectation, computed here rather than asked of the server. */
function expected(person: Person): Map<string, { view: boolean; edit: boolean; del: boolean }> {
  const out = new Map<string, { view: boolean; edit: boolean; del: boolean }>();
  const add = (g: Grant) => {
    const k = key(g);
    const cur = out.get(k) ?? { view: false, edit: false, del: false };
    cur.del = cur.del || g.canDelete;
    cur.edit = cur.edit || g.canEdit || g.canDelete;
    cur.view = cur.view || g.canView || g.canEdit || g.canDelete;
    out.set(k, cur);
  };

  for (const g of person.direct) add(g);
  // Only ACTIVE posts, and only the ones this person actually holds.
  for (const a of appts) {
    if (!a.active || a.holder !== person.employeeId) continue;
    for (const g of a.grants) add(g);
  }
  return out;
}

async function token(userId: string): Promise<string> {
  return sign(
    { id: userId, isSuperadmin: false, type: 'human', exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_SECRET as string,
    'HS256',
  );
}

async function serverGrants(userId: string): Promise<Map<string, { view: boolean; edit: boolean; del: boolean }>> {
  const res = await SELF.fetch('https://test.local/api/permissions/me', {
    headers: { Authorization: `Bearer ${await token(userId)}` },
  });
  expect(res.status).toBe(200);
  const rows = (await res.json() as { data: Grant[] }).data;
  const out = new Map<string, { view: boolean; edit: boolean; del: boolean }>();
  for (const g of rows) {
    out.set(key(g), { view: g.canView, edit: g.canEdit, del: g.canDelete });
  }
  return out;
}

/** Compares, and reports the seed and the disagreeing feature rather than "not equal". */
async function check(label: string): Promise<void> {
  for (const person of people) {
    const want = expected(person);
    const got = await serverGrants(person.userId);

    for (const [k, levels] of want) {
      const actual = got.get(k);
      expect(actual, `[seed ${SEED.toString(16)}] ${label}: ${person.userId} should hold ${k}`).toBeDefined();
      expect(actual, `[seed ${SEED.toString(16)}] ${label}: ${person.userId} levels on ${k}`).toEqual(levels);
    }

    /**
     * And nothing extra. This is the direction that matters: a missing grant is a
     * person who cannot do their job, an extra one is a person reading somebody
     * else's payroll. `crm` is excluded because the committee rule adds grants from
     * code rather than from either table.
     */
    for (const k of got.keys()) {
      if (k.startsWith('crm/')) continue;
      expect(want.has(k), `[seed ${SEED.toString(16)}] ${label}: ${person.userId} must NOT hold ${k}`).toBe(true);
    }
  }
}

async function build(): Promise<void> {
  const rand = rng(SEED);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

  const res = await SELF.fetch('https://test.local/api/permissions/app-features', {
    headers: { Authorization: `Bearer ${await token('u_ceo')}` },
  });
  const catalog = (await res.json() as { data: Record<string, string[]> }).data;
  // `crm` is left out of the generated grants: the committee rule contributes crm
  // from code, so a generated crm grant would make "nothing extra" ambiguous.
  catalogue = Object.entries(catalog)
    .filter(([app]) => app !== 'crm')
    .flatMap(([app, features]) => features.map((f) => [app, f] as [string, string]));

  const randomGrants = (n: number): Grant[] => {
    const seen = new Map<string, Grant>();
    for (let i = 0; i < n; i++) {
      const [appName, feature] = pick(catalogue);
      const roll = rand();
      const g: Grant = {
        appName,
        feature,
        canView: roll < 0.5,
        canEdit: roll >= 0.5 && roll < 0.8,
        canDelete: roll >= 0.8,
      };
      // A row with no level at all is not stored by either editor, so generating one
      // would test a state the system cannot be in.
      if (!g.canView && !g.canEdit && !g.canDelete) g.canView = true;
      seen.set(key(g), g);
    }
    return [...seen.values()];
  };

  people = [];
  appts = [];

  for (let i = 0; i < PEOPLE; i++) {
    const employeeId = `bf_emp_${i}`;
    const userId = `bf_usr_${i}`;
    await env.DB.prepare(
      'INSERT INTO employees (employee_id,name,department,employment_status,created_at,updated_at) VALUES (?,?,?,?,0,0)',
    ).bind(employeeId, `Person ${i}`, 'Tech', 'active').run();
    await env.DB.prepare(
      'INSERT INTO users_logins (id,email,username,name,password_hash,employee_id,is_active,is_superadmin,created_at,failed_attempts) VALUES (?,?,?,?,?,?,1,0,0,0)',
    ).bind(userId, `${userId}@test.local`, userId, `Person ${i}`, 'x', employeeId).run();

    // Some people get grants of their own; most do not, which is the shape the model
    // is meant to produce.
    const direct = rand() < 0.4 ? randomGrants(1 + Math.floor(rand() * 3)) : [];
    for (const g of direct) {
      await env.DB.prepare(
        'INSERT INTO user_app_permissions (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,0)',
      ).bind(`bf_uap_${userId}_${key(g).replace('/', '_')}`, userId, g.appName, g.feature, +g.canView, +g.canEdit, +g.canDelete).run();
    }
    people.push({ employeeId, userId, direct });
  }

  for (let i = 0; i < APPOINTMENTS; i++) {
    const id = `bf_ap_${i}`;
    // A fifth of posts are vacant and a fifth are ended, so both states are present
    // in every run rather than only when the dice say so.
    const holder = rand() < 0.2 ? null : pick(people).employeeId;
    const active = rand() >= 0.2;
    const grants = randomGrants(1 + Math.floor(rand() * 4));

    await env.DB.prepare(
      'INSERT INTO appointments (appointment_id,role_or_title,is_active,employee_id,created_at) VALUES (?,?,?,?,0)',
    ).bind(id, `Post ${i}`, active ? 1 : 0, holder).run();
    for (const g of grants) {
      await env.DB.prepare(
        'INSERT INTO appointment_app_permissions (id,appointment_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,0)',
      ).bind(`bf_aap_${id}_${key(g).replace('/', '_')}`, id, g.appName, g.feature, +g.canView, +g.canEdit, +g.canDelete).run();
    }
    appts.push({ id, holder, active, grants });
  }
}

/** Mutates through the API, as the superadmin, so the routes are what moves the state. */
async function patch(appointmentId: string, body: Record<string, unknown>): Promise<Response> {
  return SELF.fetch(`https://test.local/api/hr/appointments/${appointmentId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${await token('u_ceo')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await resetDatabase();
  await build();
}, 60_000);

describe(`a random org (seed ${SEED.toString(16)})`, () => {
  it('reports exactly the union of each person’s own grants and their active posts', async () => {
    await check('initial');
  }, 60_000);

  it('still does after every post is handed to the next person in turn', async () => {
    // Every appointment moves, including the vacant and the ended ones, so the
    // handover path runs against all four combinations of held/vacant and
    // active/ended rather than only the ordinary one.
    for (let i = 0; i < appts.length; i++) {
      const next = people[(i + 1) % people.length].employeeId;
      const res = await patch(appts[i].id, { employeeId: next });
      expect(res.status, `handover of ${appts[i].id}`).toBe(200);
      appts[i].holder = next;
    }
    await check('after handovers');
  }, 120_000);

  it('still does after every post is toggled active', async () => {
    for (const a of appts) {
      const res = await patch(a.id, { isActive: !a.active });
      expect(res.status, `toggling ${a.id}`).toBe(200);
      a.active = !a.active;
    }
    await check('after toggles');
  }, 120_000);

  it('still does after every post is vacated', async () => {
    // The end state is every post empty, so nobody should hold anything but their
    // own direct grants. That is the assertion the whole model rests on: access
    // leaves with the post.
    for (const a of appts) {
      const res = await patch(a.id, { employeeId: '' });
      expect(res.status, `vacating ${a.id}`).toBe(200);
      a.holder = null;
    }
    await check('after vacating');

    for (const person of people) {
      const got = await serverGrants(person.userId);
      const own = new Set(person.direct.map(key));
      for (const k of got.keys()) {
        if (k.startsWith('crm/')) continue;
        expect(own.has(k), `${person.userId} kept ${k} after every post was vacated`).toBe(true);
      }
    }
  }, 120_000);
});
