import { env } from 'cloudflare:test';
import { sign } from 'hono/jwt';
import schemaSql from './schema.sql?raw';
import seedSql from './seed.sql?raw';

/**
 * Splits a SQL script into individual statements.
 * D1's exec() is whitespace-sensitive, so we run statements one at a time.
 */
function statements(sql: string): string[] {
	return sql
		.split(';')
		.map((s) => s.replace(/^\s*--.*$/gm, '').trim())
		.filter((s) => s.length > 0);
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
