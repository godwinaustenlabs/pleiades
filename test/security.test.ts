import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import { resetDatabase, tokenFor, authedGet, USERS } from './helpers';

/**
 * Regression pins for fixed authentication vulnerabilities.
 *
 * Every test here corresponds to something that was exploitable. They are
 * deliberately blunt: if one of these starts failing, a hole has reopened.
 */

const AGENT_SECRET = 'test-agent-internal-secret';
const SLACK_SECRET = 'test-slack-signing-secret';

/** A finance route — authorized callers get non-401; anonymous ones get 401. */
const PROTECTED = 'https://test.local/api/finance/ledgers';

beforeAll(async () => {
	await resetDatabase();
});

describe('x-slack-id impersonation (removed)', () => {
	// Was: this header named a Slack user and was trusted outright, so anyone
	// could assume that employee's full RBAC identity with no credential.
	it('no longer authenticates anything', async () => {
		const res = await SELF.fetch(PROTECTED, { headers: { 'x-slack-id': 'U_CEO' } });
		expect(res.status).toBe(401);
	});

	it('does not authenticate even with a real employee slack id', async () => {
		const res = await SELF.fetch(PROTECTED, { headers: { 'x-slack-id': 'U_REAL_EMPLOYEE' } });
		expect(res.status).toBe(401);
	});
});

describe('internal agent actor header', () => {
	it('is rejected without the shared secret', async () => {
		const res = await SELF.fetch(PROTECTED, { headers: { 'x-agent-actor': USERS.ceo.id } });
		expect(res.status).toBe(401);
	});

	it('is rejected with a wrong secret', async () => {
		const res = await SELF.fetch(PROTECTED, {
			headers: { 'x-agent-actor': USERS.ceo.id, 'x-agent-secret': 'not-the-secret' },
		});
		expect(res.status).toBe(401);
	});

	it('authorizes as the named user with the correct secret', async () => {
		const res = await SELF.fetch(PROTECTED, {
			headers: { 'x-agent-actor': USERS.ceo.id, 'x-agent-secret': AGENT_SECRET },
		});
		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(403);
	});

	it('carries that user\'s permissions, not more — a CRM user is still denied finance', async () => {
		const res = await SELF.fetch(PROTECTED, {
			headers: { 'x-agent-actor': USERS.crm.id, 'x-agent-secret': AGENT_SECRET },
		});
		expect(res.status).toBe(403);
	});

	it('rejects an unknown user id even with the correct secret', async () => {
		const res = await SELF.fetch(PROTECTED, {
			headers: { 'x-agent-actor': 'usr_does_not_exist', 'x-agent-secret': AGENT_SECRET },
		});
		expect(res.status).toBe(401);
	});
});

describe('audience-scoped tokens', () => {
	// Short-lived tickets (e.g. for an agent WebSocket) carry `aud`. Without this
	// check such a ticket would work as a full API credential.
	it('cannot be used as an API credential', async () => {
		const ticket = await sign(
			{ sub: USERS.ceo.id, aud: 'agent-ws', exp: Math.floor(Date.now() / 1000) + 60 },
			env.JWT_SECRET as string,
			'HS256',
		);
		const res = await SELF.fetch(PROTECTED, { headers: { Authorization: `Bearer ${ticket}` } });
		expect(res.status).toBe(401);
	});

	it('leaves ordinary login tokens working', async () => {
		const res = await SELF.fetch(PROTECTED, {
			headers: { Authorization: `Bearer ${await tokenFor('ceo')}` },
		});
		expect(res.status).not.toBe(401);
	});
});

describe('Slack request signature', () => {
	async function slackSign(body: string, timestamp: string, secret = SLACK_SECRET) {
		const key = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign'],
		);
		const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
		return 'v0=' + Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	function post(body: string, headers: Record<string, string>) {
		return SELF.fetch('https://test.local/api/agents/slack/event', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body,
		});
	}

	const challenge = JSON.stringify({ type: 'url_verification', challenge: 'abc123' });

	it('rejects a request with no signature headers', async () => {
		expect((await post(challenge, {})).status).toBe(401);
	});

	it('rejects a forged signature', async () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const res = await post(challenge, {
			'x-slack-request-timestamp': ts,
			'x-slack-signature': 'v0=deadbeef',
		});
		expect(res.status).toBe(401);
	});

	it('rejects a signature computed with the wrong secret', async () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const res = await post(challenge, {
			'x-slack-request-timestamp': ts,
			'x-slack-signature': await slackSign(challenge, ts, 'wrong-secret'),
		});
		expect(res.status).toBe(401);
	});

	it('rejects a replayed (stale) request even with a valid signature', async () => {
		const ts = String(Math.floor(Date.now() / 1000) - 60 * 10); // 10 minutes old
		const res = await post(challenge, {
			'x-slack-request-timestamp': ts,
			'x-slack-signature': await slackSign(challenge, ts),
		});
		expect(res.status).toBe(401);
	});

	it('accepts a correctly signed request', async () => {
		const ts = String(Math.floor(Date.now() / 1000));
		const res = await post(challenge, {
			'x-slack-request-timestamp': ts,
			'x-slack-signature': await slackSign(challenge, ts),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ challenge: 'abc123' });
	});

	it('verifies before answering the url_verification handshake', async () => {
		// Slack signs the challenge too; an unsigned challenge must not be echoed.
		const res = await post(challenge, {});
		expect(res.status).toBe(401);
		expect(await res.text()).not.toContain('abc123');
	});
});

describe('password hashing', () => {
	async function legacySha256(input: string) {
		const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
		return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	async function storedHashFor(userId: string) {
		const row = await env.DB.prepare('SELECT password_hash FROM users_logins WHERE id = ?')
			.bind(userId).first<{ password_hash: string }>();
		return row?.password_hash ?? '';
	}

	function login(email: string, password: string) {
		return SELF.fetch('https://test.local/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password }),
		});
	}

	it('still accepts a legacy unsalted SHA-256 hash, so no user is locked out', async () => {
		await env.DB.prepare('UPDATE users_logins SET password_hash = ? WHERE id = ?')
			.bind(await legacySha256('legacy-secret'), USERS.ceo.id).run();

		const res = await login('u_ceo@test.local', 'legacy-secret');
		expect(res.status).toBe(200);
	});

	it('transparently upgrades that hash to PBKDF2 on successful login', async () => {
		await env.DB.prepare('UPDATE users_logins SET password_hash = ? WHERE id = ?')
			.bind(await legacySha256('legacy-secret'), USERS.tech.id).run();
		expect(await storedHashFor(USERS.tech.id)).toMatch(/^[0-9a-f]{64}$/);

		const res = await login('u_tech@test.local', 'legacy-secret');
		expect(res.status).toBe(200);

		const upgraded = await storedHashFor(USERS.tech.id);
		expect(upgraded).toMatch(/^pbkdf2\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
		// The plaintext must not be recoverable from a rainbow table any more.
		expect(upgraded).not.toBe(await legacySha256('legacy-secret'));
	});

	it('accepts the same password against the upgraded hash', async () => {
		const res = await login('u_tech@test.local', 'legacy-secret');
		expect(res.status).toBe(200);
		expect(await storedHashFor(USERS.tech.id)).toMatch(/^pbkdf2\$/);
	});

	it('rejects a wrong password against an upgraded hash', async () => {
		const res = await login('u_tech@test.local', 'not-the-password');
		expect(res.status).toBe(401);
	});

	it('salts per user — the same password yields different stored hashes', async () => {
		await env.DB.prepare('UPDATE users_logins SET password_hash = ? WHERE id = ?')
			.bind(await legacySha256('shared-pw'), USERS.mkt.id).run();
		await env.DB.prepare('UPDATE users_logins SET password_hash = ? WHERE id = ?')
			.bind(await legacySha256('shared-pw'), USERS.crm.id).run();

		expect((await login('u_mkt@test.local', 'shared-pw')).status).toBe(200);
		expect((await login('u_crm@test.local', 'shared-pw')).status).toBe(200);

		const a = await storedHashFor(USERS.mkt.id);
		const b = await storedHashFor(USERS.crm.id);
		expect(a).toMatch(/^pbkdf2\$/);
		expect(b).toMatch(/^pbkdf2\$/);
		expect(a).not.toBe(b);
	});

	// Workers' WebCrypto rejects any PBKDF2 iteration count above 100,000. The
	// hash format carries its own count, so an over-cap value is not a slow
	// hash — deriveBits throws and every login becomes a 500. This shipped once
	// (210,000) and the suite did not catch it because the assertions above only
	// check the `pbkdf2$` prefix, never the number.
	it('writes an iteration count the Workers runtime will accept', async () => {
		await env.DB.prepare('UPDATE users_logins SET password_hash = ? WHERE id = ?')
			.bind(await legacySha256('ceiling-pw'), USERS.crm.id).run();
		expect((await login('u_crm@test.local', 'ceiling-pw')).status).toBe(200);

		const iterations = Number((await storedHashFor(USERS.crm.id)).split('$')[1]);
		expect(iterations).toBeGreaterThan(0);
		expect(iterations).toBeLessThanOrEqual(100_000);
	});

	it('fails an over-cap stored hash closed, rather than throwing a 500', async () => {
		await env.DB.prepare('UPDATE users_logins SET password_hash = ? WHERE id = ?')
			.bind('pbkdf2$210000$' + 'ab'.repeat(16) + '$' + 'cd'.repeat(32), USERS.none.id).run();

		const res = await login('u_none@test.local', 'anything');
		expect(res.status).toBe(401);
	});
});

describe('notification forgery', () => {
	function send(user: 'ceo' | 'crm', body: Record<string, unknown>) {
		return (async () =>
			SELF.fetch('https://test.local/api/notifications/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tokenFor(user)}` },
				body: JSON.stringify(body),
			}))();
	}

	// Was: no authorization at all — any authenticated user could deliver a
	// notification with an arbitrary `link` to any other user.
	it('is refused for a user who cannot administer users', async () => {
		const res = await send('crm', {
			userId: USERS.ceo.id, title: 'Password expiring',
			message: 'Click to reset', link: 'https://evil.example/login',
		});
		expect(res.status).toBe(403);
	});

	it('is allowed for an administrator', async () => {
		const res = await send('ceo', { userId: USERS.crm.id, title: 'Welcome', message: 'Hello there' });
		expect(res.status).toBe(201);
	});

	it('rejects an unknown target user', async () => {
		const res = await send('ceo', { userId: 'usr_nope', title: 'Hi', message: 'Hi' });
		expect(res.status).toBe(404);
	});
});

describe('employee directory PII', () => {
	async function roster(user: 'ceo' | 'crm') {
		const res = await SELF.fetch('https://test.local/api/core/employees', {
			headers: { Authorization: `Bearer ${await tokenFor(user)}` },
		});
		expect(res.status).toBe(200);
		return (await res.json()) as { data: Record<string, unknown>[] };
	}

	// Was: full CNIC, bank details, tax info and salary returned to anyone with a
	// core grant — which is nearly every role.
	it('strips sensitive fields for a user without hr/employees', async () => {
		const body = await roster('crm');
		const row = body.data.find((r) => r.id === 'emp_pii');
		expect(row).toBeDefined();
		expect(row!.name).toBe('Sensitive Person');

		for (const field of ['cnic', 'bankDetails', 'taxInformation', 'baseSalary', 'address']) {
			expect(row).not.toHaveProperty(field);
		}
		// Belt and braces: the values must not appear anywhere in the payload.
		const raw = JSON.stringify(body);
		expect(raw).not.toContain('3520112345678');
		expect(raw).not.toContain('12345678901234');
	});

	it('still exposes them to a user who can administer employees', async () => {
		const body = await roster('ceo');
		const row = body.data.find((r) => r.id === 'emp_pii');
		expect(row?.cnic).toBe('3520112345678');
	});
});

describe('asset upload hardening', () => {
	async function upload(key: string, body = 'x', contentType = 'text/plain') {
		return SELF.fetch(`https://test.local/api/assets/upload/${key}`, {
			method: 'PUT',
			headers: { 'Content-Type': contentType, Authorization: `Bearer ${await tokenFor('ceo')}` },
			body,
		});
	}

	// Was: the key was taken from the URL verbatim, so a caller could write
	// anywhere in the bucket, including over another user's object.
	it('rejects a key outside the allowed prefixes', async () => {
		expect((await upload('arbitrary/evil.txt')).status).toBe(400);
	});

	it('rejects path traversal segments', async () => {
		// A literal ../ is collapsed by URL normalization before routing, so it
		// never reaches the handler — it just isn't an upload. The percent-encoded
		// form does reach the handler, and is what the key validator must catch.
		expect((await upload('avatars/../../etc/passwd')).status).not.toBe(200);
		expect((await upload('avatars/..%2Fescape.txt')).status).toBe(400);
	});

	it('rejects an empty upload', async () => {
		const res = await SELF.fetch('https://test.local/api/assets/upload/avatars/a.png', {
			method: 'PUT',
			headers: { Authorization: `Bearer ${await tokenFor('ceo')}` },
			body: '',
		});
		expect(res.status).toBe(400);
	});

	it('accepts a well-formed key under an allowed prefix', async () => {
		expect((await upload('avatars/ok.png')).status).toBe(200);
	});

	it('still requires authentication', async () => {
		const res = await SELF.fetch('https://test.local/api/assets/upload/avatars/x.png', {
			method: 'PUT', body: 'x',
		});
		expect(res.status).toBe(401);
	});
});

describe('per-feature gating outside finance and HR', () => {
	// Was: legal, tech, acquisition and ops were gated only by
	// requireAppAccess, so `<app>/tasks` — the narrowest grant any of them can
	// carry — opened every record in the module. Same hole as the finance/HR
	// one the audit closed; these are the remaining modules.
	const DATA_ROUTES = [
		'/api/legal/agreements',
		'/api/legal/compliance',
		'/api/legal/ip',
		'/api/tech/projects',
		'/api/tech/deployments',
		'/api/acquisition/campaigns',
		'/api/acquisition/contacts',
		'/api/ops/labs',
	];

	it.each(DATA_ROUTES)('denies a tasks-only role: %s', async (path) => {
		const res = await authedGet('tasksOnly', path);
		expect(res.status).toBe(403);
	});

	it('still lets that role reach what it was actually granted', async () => {
		const res = await authedGet('tasksOnly', '/api/tasks?department=Legal');
		expect(res.status).not.toBe(403);
	});

	it('leaves a role holding the feature itself unaffected', async () => {
		const res = await authedGet('tech', '/api/tech/projects');
		expect(res.status).not.toBe(403);
	});

	it('declares every feature its routes gate on', async () => {
		// A route gated on an undeclared feature is unreachable for everyone but
		// a superadmin, because getPerm() cannot return true for it. That is how
		// finance's ledgers tab and acquisition's funnels view went dark.
		const { APP_FEATURES } = await import('../src/middleware/rbac');
		for (const app of ['legal', 'tech', 'acquisition', 'ops']) {
			expect(APP_FEATURES[app]).toBeDefined();
		}
		expect(APP_FEATURES.acquisition).toContain('funnels');
		expect(APP_FEATURES.legal).toContain('sops');
		expect(APP_FEATURES.tech).toContain('releases');
		expect(APP_FEATURES.ops).toContain('reports');
	});
});

describe('asset download authorization', () => {
	// Was: the route checked authentication only, so any signed-in user could
	// read any key they could name — every employee, finance and CRM document
	// and every task attachment in the bucket, whatever their role.
	async function get(user: Parameters<typeof authedGet>[0], key: string) {
		return authedGet(user, `/api/assets/download/${key}`);
	}

	it('refuses an employee document to a role without hr/employees', async () => {
		const res = await get('crm', 'employee-docs/contract.pdf');
		expect(res.status).toBe(403);
	});

	it('refuses a finance document to a role without finance/docs', async () => {
		const res = await get('crm', 'finance-docs/ledger.xlsx');
		expect(res.status).toBe(403);
	});

	it('does not 403 a caller who holds the matching grant', async () => {
		// 404 is the expected outcome for a key with no object behind it; the
		// point is that authorization passed rather than short-circuiting.
		const res = await get('ceo', 'employee-docs/contract.pdf');
		expect(res.status).not.toBe(403);
	});

	// Upload keys used to be derived from the title of the form doing the upload,
	// so the bucket holds prefixes nobody chose: CRM documents under
	// `upload_institutional_asset/`, legal templates under `update_template/`,
	// and so on. Authorizing only the tidy prefixes made every one of those
	// files unreadable. They stay readable, each behind its module's grant.
	it.each([
		['upload_institutional_asset/brief.docx', 'crm'],
		['new_documents/policy.pdf', 'ceo'],
		['update_template/nda.docx', 'ceo'],
		['new_template/draft.pages', 'ceo'],
		['new_sop/onboarding.pdf', 'ceo'],
	])('serves legacy object %s to a holder of its module grant', async (key, user) => {
		const res = await authedGet(user as any, `/api/assets/download/${key}`);
		expect(res.status).not.toBe(403);
	});

	it('still gates a legacy prefix on the right module', async () => {
		// u_crm holds crm, not legal: legacy legal objects stay closed to them.
		const res = await authedGet('crm', '/api/assets/download/update_template/nda.docx');
		expect(res.status).toBe(403);
	});

	it('finds an object whose name contains a space', async () => {
		// Upload decodes the key before storing, so a space is stored as a space.
		// Download did not decode, so it asked R2 for the literal "%20" and every
		// such file 404'd. The two sides must agree.
		await env.CRM_BUCKET.put('entity-photos/My Company Logo.png', 'x');
		const res = await authedGet('none', '/api/assets/download/entity-photos/My%20Company%20Logo.png');
		expect(res.status).toBe(200);
	});

	it('does not fail a key with a malformed percent-sequence', async () => {
		const res = await authedGet('none', '/api/assets/download/entity-photos/100%.png');
		expect([200, 404]).toContain(res.status);
	});

	it('serves entity photos to any signed-in user', async () => {
		// Logos rendered beside records the caller can already see. Gating these
		// on one module's grant only produces broken images.
		const res = await authedGet('none', '/api/assets/download/entity-photos/logo.png');
		expect(res.status).not.toBe(403);
	});

	it('refuses a prefix no rule covers, rather than serving it', async () => {
		const res = await get('ceo', 'unknown-prefix/secret.pdf');
		expect(res.status).toBe(403);
	});

	it('still requires authentication for a non-public prefix', async () => {
		const res = await SELF.fetch('https://test.local/api/assets/download/crm-docs/x.pdf');
		expect(res.status).toBe(401);
	});

	it('leaves the public avatar prefix readable without credentials', async () => {
		const res = await SELF.fetch('https://test.local/api/assets/download/avatars/nobody.png');
		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(403);
	});
});

describe('per-user granular permissions', () => {
	// Roles were removed in 0025. Authorization is exactly the set of rows
	// carrying a user's id, so two people can differ by a single feature —
	// which a role, being shared, could never express.
	async function grantsFor(userId: string) {
		const res = await env.DB.prepare(
			'SELECT app_name, feature, can_view, can_edit, can_delete FROM user_app_permissions WHERE user_id = ?'
		).bind(userId).all();
		return res.results as any[];
	}

	it('has no roles table left to grant anything', async () => {
		const row = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('roles','role_app_permissions')"
		).first();
		expect(row).toBeNull();
	});

	it('grants one user a feature without touching anyone else', async () => {
		// u_none holds nothing at all.
		expect((await authedGet('none', '/api/tech/projects')).status).toBe(403);

		await env.DB.prepare(
			`INSERT INTO user_app_permissions
			 (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
			 VALUES ('uap_probe_none_tech','u_none','tech','projects',1,0,0,0,0)`
		).run();

		expect((await authedGet('none', '/api/tech/projects')).status).not.toBe(403);
		// Nobody else moved: u_crm still cannot see tech.
		expect((await authedGet('crm', '/api/tech/projects')).status).toBe(403);

		await env.DB.prepare("DELETE FROM user_app_permissions WHERE id='uap_probe_none_tech'").run();
		expect((await authedGet('none', '/api/tech/projects')).status).toBe(403);
	});

	it('separates view from edit for the same user and feature', async () => {
		await env.DB.prepare(
			`INSERT INTO user_app_permissions
			 (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
			 VALUES ('uap_probe_view_only','u_none','legal','templates',1,0,0,0,0)`
		).run();

		expect((await authedGet('none', '/api/legal/templates')).status).not.toBe(403);

		const write = await SELF.fetch('https://test.local/api/legal/templates', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${await tokenFor('none')}`,
			},
			body: JSON.stringify({ title: 'x' }),
		});
		expect(write.status).toBe(403);

		await env.DB.prepare("DELETE FROM user_app_permissions WHERE id='uap_probe_view_only'").run();
	});

	it('reads grants from the database, not from the token', async () => {
		// The token is minted once, then the grant is removed. A token carrying a
		// permission claim would keep working until it expired; this must not.
		const token = await tokenFor('tech');
		const path = 'https://test.local/api/tech/projects';
		const auth = { Authorization: `Bearer ${token}` };

		expect((await SELF.fetch(path, { headers: auth })).status).not.toBe(403);

		const saved = await grantsFor('u_tech');
		await env.DB.prepare("DELETE FROM user_app_permissions WHERE user_id='u_tech'").run();
		expect((await SELF.fetch(path, { headers: auth })).status).toBe(403);

		const now = Date.now();
		for (const g of saved) {
			await env.DB.prepare(
				`INSERT INTO user_app_permissions
				 (id,user_id,app_name,feature,can_view,can_edit,can_delete,created_at,updated_at)
				 VALUES (?,?,?,?,?,?,?,?,?)`
			).bind(`uap_restore_${g.app_name}_${g.feature}`, 'u_tech', g.app_name, g.feature,
				g.can_view, g.can_edit, g.can_delete, now, now).run();
		}
		expect((await SELF.fetch(path, { headers: auth })).status).not.toBe(403);
	});

	it('rejects a grant naming a feature APP_FEATURES does not declare', async () => {
		const res = await SELF.fetch('https://test.local/api/admin/users/u_none/permissions', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${await tokenFor('ceo')}`,
			},
			body: JSON.stringify({ permissions: [{ appName: 'legal', feature: 'not_a_feature', canView: true }] }),
		});
		expect(res.status).toBe(400);
	});

	it('will not let a non-admin rewrite anyone\'s permissions', async () => {
		const res = await SELF.fetch('https://test.local/api/admin/users/u_none/permissions', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${await tokenFor('crm')}`,
			},
			body: JSON.stringify({ permissions: [{ appName: 'finance', feature: 'accounts', canView: true }] }),
		});
		expect(res.status).toBe(403);
	});
});
