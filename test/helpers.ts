import { env } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import schemaSql from './schema.sql?raw';
import seedSql from './seed.sql?raw';

/**
 * Splits a SQL script into individual statements.
 *
 * D1's exec() is whitespace-sensitive, so statements run one at a time.
 *
 * Both string literals and line comments have to be understood in a single
 * pass. Splitting naively on `;` truncated any statement with a semicolon
 * inside a literal (a JSON rate table in calc_config, say). Handling strings
 * but not comments is just as bad in the other direction: an apostrophe in a
 * comment ("one person's access") flips the parser into a string that never
 * closes, and every following statement is swallowed into one. Both failures
 * are silent — the fixture looks loaded and simply is not.
 */
function statements(sql: string): string[] {
	const out: string[] = [];
	let current = '';
	let inString = false;

	for (let i = 0; i < sql.length; i++) {
		const ch = sql[i];

		if (inString) {
			current += ch;
			if (ch === "'") {
				// '' is an escaped quote, not the end of the string.
				if (sql[i + 1] === "'") current += sql[++i];
				else inString = false;
			}
			continue;
		}

		// Line comment: skip to the newline. Only outside a string, so a `--`
		// inside a literal is left alone.
		if (ch === '-' && sql[i + 1] === '-') {
			while (i < sql.length && sql[i] !== '\n') i++;
			current += '\n';
			continue;
		}

		if (ch === "'") {
			inString = true;
			current += ch;
			continue;
		}

		if (ch === ';') {
			out.push(current);
			current = '';
			continue;
		}

		current += ch;
	}
	out.push(current);

	return out.map((s) => s.trim()).filter((s) => s.length > 0);
}


/**
 * Rebuilds the test database from the production DDL, then loads the
 * permission fixture. Called once per suite.
 */
export async function resetDatabase(): Promise<void> {
	for (const stmt of statements(schemaSql)) {
		await env.DB.prepare(stmt).run();
	}
	await reseed();
}

/**
 * Reloads the fixture WITHOUT replaying the DDL, for a suite that needs a clean
 * slate between cases rather than once.
 *
 * Separate from `resetDatabase` because the production dump uses bare
 * `CREATE TABLE`, so replaying it a second time fails on the first table. The seed
 * is re-runnable on its own: it truncates everything it writes, and everything the
 * routes write as a side effect (see the note at the top of seed.sql).
 */
export async function reseed(): Promise<void> {
	for (const stmt of statements(seedSql)) {
		await env.DB.prepare(stmt).run();
	}
}

/**
 * Where fixtures send.
 *
 * `delivered@resend.dev` is Resend's own sink: it simulates a successful delivery and
 * explicitly does not touch domain reputation. A `+label` keeps recipients distinct
 * where a test counts them.
 *
 * This is not tidiness. The fixtures used `@example.test` and `@personal.example`,
 * which are reserved and do not resolve — so when the real API key reached the suite
 * through `.dev.vars` (Miniflare loads it), every send-path test hard-bounced at
 * Resend. Roughly 200 of them in five minutes, which is the signature ESPs suspend
 * accounts for.
 *
 * Two things stop that now, and both should stay: `vitest.config.mts` pins
 * RESEND_API_KEY to the empty string so the suite cannot reach the network at all,
 * and these addresses mean that if it ever does, nothing bounces.
 *
 * Use `SINK('something')` for a new recipient rather than inventing a domain.
 */
export const SINK = (label: string) => `delivered+${label}@resend.dev`;

/** Simulates a hard bounce, for a test that wants one. Also reputation-safe. */
export const SINK_BOUNCE = 'bounced@resend.dev';

/** Fixture users, matching the four permission clusters found in production. */
export const USERS = {
	ceo: { id: 'u_ceo', roleId: 'role_ceo', isSuperadmin: true },
	tech: { id: 'u_tech', roleId: 'role_tech_lead', isSuperadmin: false },
	mkt: { id: 'u_mkt', roleId: 'role_marketing_lead', isSuperadmin: false },
	crm: { id: 'u_crm', roleId: 'role_crm_member', isSuperadmin: false },
	none: { id: 'u_none', roleId: 'role_none', isSuperadmin: false },
	tasksOnly: { id: 'u_tasks', roleId: 'role_tasks_only', isSuperadmin: false },
	/**
	 * Administers mailboxes without being a superadmin, so the admin/mailboxes
	 * branch of canUseMailbox is exercised by somebody who does not bypass every
	 * check. Its own user rather than a grant bolted onto `crm`, because that
	 * would have handed `crm` an `admin` feature and broken the assertion in
	 * rbac.test.ts that /api/admin is gated on the admin module.
	 */
	mailAdmin: { id: 'u_mail', roleId: 'role_mail_admin', isSuperadmin: false },
	/**
	 * The two logins that carry an employee id, and therefore the only two that can
	 * hold appointments. Every other fixture user has none, which is what keeps the
	 * pre-existing expectations in rbac.test.ts describing exactly the same access
	 * they described before appointments became a grant source.
	 *
	 * `dual` holds three appointments (two active, one ended) plus one direct grant
	 * of its own; `hold` holds nothing at all, so a handover test can prove it gains
	 * a post's whole access without anybody editing its permissions.
	 */
	dual: { id: 'u_dual', roleId: 'role_none', isSuperadmin: false, employeeId: 'emp_dual' },
	hold: { id: 'u_hold', roleId: 'role_none', isSuperadmin: false, employeeId: 'emp_hold' },
} as const;

export type FixtureUser = keyof typeof USERS;

/**
 * Mints a JWT in the exact shape authMiddleware expects.
 *
 * `employeeId` is carried because a real login token carries it — but nothing in
 * the authorization path reads it. Appointment grants and appointment mailboxes
 * both resolve the employee from `users_logins` on every request, because a token
 * lives over a week and its copy of that link can be a week stale. See the
 * deliberately-wrong token in appointments-rbac.test.ts, which pins that.
 */
export async function tokenFor(user: FixtureUser): Promise<string> {
	const u = USERS[user];
	return sign(
		{
			id: u.id,
			roleId: u.roleId,
			roleName: u.roleId,
			employeeId: 'employeeId' in u ? u.employeeId : null,
			isSuperadmin: u.isSuperadmin,
			exp: Math.floor(Date.now() / 1000) + 3600,
		},
		env.JWT_SECRET as string,
		'HS256',
	);
}

/** A token whose claims are deliberately not what the database says, for the tests that must ignore them. */
export async function forgedToken(claims: Record<string, unknown>): Promise<string> {
	return sign(
		{ isSuperadmin: false, type: 'human', exp: Math.floor(Date.now() / 1000) + 3600, ...claims },
		env.JWT_SECRET as string,
		'HS256',
	);
}

/** GET as an arbitrary token, for the same reason. */
export async function getWithToken(token: string, path: string): Promise<Response> {
	const { SELF } = await import('cloudflare:test');
	return SELF.fetch(`https://test.local${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

export async function authedGet(user: FixtureUser, path: string): Promise<Response> {
	const { SELF } = await import('cloudflare:test');
	return SELF.fetch(`https://test.local${path}`, {
		headers: { Authorization: `Bearer ${await tokenFor(user)}` },
	});
}
