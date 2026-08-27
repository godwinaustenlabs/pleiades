import { describe, it, expect, beforeAll } from 'vitest';
import { resetDatabase, authedGet, type FixtureUser } from './helpers';

/**
 * Characterization suite: pins the CURRENT effective authorization behaviour of
 * every gated module, so the roles-only refactor can be proven behaviour-preserving.
 *
 * A route is "authorized" iff it does not return 403. A 500 from a handler still
 * counts as authorized — we are testing the gate, not the handler.
 */

const ROUTES: Record<string, string> = {
	hr: '/api/hr/sectors',
	finance: '/api/finance/ledgers',
	legal: '/api/legal/templates',
	tech: '/api/tech/projects',
	acquisition: '/api/acquisition/campaigns',
	ops: '/api/ops/labs',
	crm: '/api/crm/my-committees',
};

/** Expected access per fixture user, derived from the live permission clusters. */
const EXPECTED: Record<FixtureUser, string[]> = {
	ceo: ['hr', 'finance', 'legal', 'tech', 'acquisition', 'ops', 'crm'],
	tech: ['tech', 'crm'],
	mkt: ['acquisition', 'crm'],
	crm: ['crm'],
	none: [],
	// Holds only <app>/tasks. The module data routes are gated on their own
	// features now, so none of these paths are reachable for it.
	tasksOnly: [],
};

async function isAuthorized(user: FixtureUser, path: string): Promise<boolean> {
	const res = await authedGet(user, path);
	return res.status !== 403;
}

beforeAll(async () => {
	await resetDatabase();
});

describe('module gating', () => {
	for (const user of Object.keys(EXPECTED) as FixtureUser[]) {
		for (const [mod, path] of Object.entries(ROUTES)) {
			const shouldAllow = EXPECTED[user].includes(mod);
			it(`${user} is ${shouldAllow ? 'allowed' : 'denied'} ${mod}`, async () => {
				expect(await isAuthorized(user, path)).toBe(shouldAllow);
			});
		}
	}
});

describe('unauthenticated access is rejected', () => {
	for (const [mod, path] of Object.entries(ROUTES)) {
		it(`${mod} requires a token`, async () => {
			const { SELF } = await import('cloudflare:test');
			const res = await SELF.fetch(`https://test.local${path}`);
			expect(res.status).toBe(401);
		});
	}
});

/**
 * Each of these pinned a defect in the pre-refactor code. The expectations below
 * are the FIXED behaviour; the original assertions are quoted so the change is a
 * visible, deliberate flip rather than a silent one.
 */
describe('previously-defective behaviour, now fixed', () => {
	// Was: `none` could read org data (route had no gate at all).
	it('/api/core is gated — a user with no grants is denied', async () => {
		expect(await isAuthorized('none', '/api/core/employees')).toBe(false);
	});

	// Read access to core is preserved for every real role, which the UI depends on.
	it('/api/core stays readable by every role that had it implicitly', async () => {
		for (const u of ['ceo', 'tech', 'mkt', 'crm'] as FixtureUser[]) {
			expect(await isAuthorized(u, '/api/core/employees')).toBe(true);
		}
	});

	// Was: any authenticated user, including one with zero grants.
	it('/api/dashboard requires a dashboard grant', async () => {
		expect(await isAuthorized('none', '/api/dashboard/notes')).toBe(false);
		expect(await isAuthorized('crm', '/api/dashboard/notes')).toBe(true);
	});

	// Was: an IDOR — no authorization check whatsoever.
	it("GET /api/permissions/user/:id no longer leaks another user's permissions", async () => {
		expect(await isAuthorized('none', '/api/permissions/user/u_ceo')).toBe(false);
	});

	it('a user can still read their own permissions', async () => {
		expect(await isAuthorized('crm', '/api/permissions/user/u_crm')).toBe(true);
	});

	// Was: gated on the `hr` module, so any HR-view user could administer roles.
	it('/api/admin is gated on the admin module', async () => {
		expect(await isAuthorized('crm', '/api/admin/roles')).toBe(false);
		expect(await isAuthorized('tech', '/api/admin/roles')).toBe(false);
		expect(await isAuthorized('ceo', '/api/admin/roles')).toBe(true);
	});

	// Was: PUT /permissions/user/:id let anyone with hr/appointments/edit grant
	// themselves every permission. The route no longer exists.
	it('the per-user permission-writing escalation route is gone', async () => {
		const { SELF } = await import('cloudflare:test');
		const { tokenFor } = await import('./helpers');
		const res = await SELF.fetch('https://test.local/api/permissions/user/u_none', {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${await tokenFor('crm')}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ permissions: [{ appName: 'hr', feature: 'employees', canView: true }] }),
		});
		expect(res.status).toBe(404);
	});
});

describe('unscoped task listing is scoped to the caller', () => {
	async function taskIds(user: FixtureUser): Promise<string[]> {
		const res = await authedGet(user, '/api/tasks');
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string }[] };
		return body.data.map((t) => t.id).sort();
	}

	// Was: any authenticated caller got every task in the company.
	it('a CRM-only user sees only CRM tasks', async () => {
		expect(await taskIds('crm')).toEqual(['task_crm']);
	});

	it('a tech lead sees tech and crm tasks but not HR', async () => {
		expect(await taskIds('tech')).toEqual(['task_crm', 'task_tech']);
	});

	it('a user with no grants sees nothing', async () => {
		expect(await taskIds('none')).toEqual([]);
	});

	it('a superadmin still sees everything', async () => {
		expect(await taskIds('ceo')).toEqual(['task_crm', 'task_hr', 'task_tech']);
	});
});

describe('finance documents tab', () => {
	it('is gated on finance/docs — a CRM-only user is denied', async () => {
		expect(await isAuthorized('crm', '/api/finance/documents')).toBe(false);
		expect(await isAuthorized('none', '/api/finance/documents')).toBe(false);
	});

	it('is reachable by a user holding finance', async () => {
		expect(await isAuthorized('ceo', '/api/finance/documents')).toBe(true);
	});

	// company_documents is shared with HR, so the department scope is what keeps
	// one module's documents out of another's list.
	it('returns only finance documents, not HR documents', async () => {
		const res = await authedGet('ceo', '/api/finance/documents');
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string; department: string }[] };
		expect(body.data.map((d) => d.id)).toEqual(['doc_fin']);
	});

	it('leaves the HR documents endpoint returning only HR documents', async () => {
		const res = await authedGet('ceo', '/api/hr/company-documents');
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: { id: string }[] };
		expect(body.data.map((d) => d.id)).toEqual(['doc_hr']);
	});

	it('rejects a write from a user without finance', async () => {
		const { SELF } = await import('cloudflare:test');
		const { tokenFor } = await import('./helpers');
		const res = await SELF.fetch('https://test.local/api/finance/documents', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${await tokenFor('crm')}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ title: 'x', url: '/api/assets/download/x.pdf' }),
		});
		expect(res.status).toBe(403);
	});
});
