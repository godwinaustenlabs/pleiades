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
	for (const stmt of statements(seedSql)) {
		await env.DB.prepare(stmt).run();
	}
}

/** Fixture users, matching the four permission clusters found in production. */
export const USERS = {
	ceo: { id: 'u_ceo', roleId: 'role_ceo', isSuperadmin: true },
	tech: { id: 'u_tech', roleId: 'role_tech_lead', isSuperadmin: false },
	mkt: { id: 'u_mkt', roleId: 'role_marketing_lead', isSuperadmin: false },
	crm: { id: 'u_crm', roleId: 'role_crm_member', isSuperadmin: false },
	none: { id: 'u_none', roleId: 'role_none', isSuperadmin: false },
	tasksOnly: { id: 'u_tasks', roleId: 'role_tasks_only', isSuperadmin: false },
} as const;

export type FixtureUser = keyof typeof USERS;

/** Mints a JWT in the exact shape authMiddleware expects. */
export async function tokenFor(user: FixtureUser): Promise<string> {
	const u = USERS[user];
	return sign(
		{
			id: u.id,
			roleId: u.roleId,
			roleName: u.roleId,
			employeeId: null,
			isSuperadmin: u.isSuperadmin,
			exp: Math.floor(Date.now() / 1000) + 3600,
		},
		env.JWT_SECRET as string,
		'HS256',
	);
}

export async function authedGet(user: FixtureUser, path: string): Promise<Response> {
	const { SELF } = await import('cloudflare:test');
	return SELF.fetch(`https://test.local${path}`, {
		headers: { Authorization: `Bearer ${await tokenFor(user)}` },
	});
}
