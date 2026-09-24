import { describe, it, expect, beforeAll } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { decode, sign } from 'hono/jwt';
import { resetDatabase } from './helpers';

/**
 * The sliding session.
 *
 * A staff token used to last 8 hours, which meant signing in again most
 * mornings. It now lasts eight days and rolls forward on use, so that a week of
 * inactivity — not a week from sign-in — is what ends a session. The mechanism
 * is a response header: any request made with a token that has under seven days
 * left is answered with a freshly signed one in `X-Refresh-Token`, which the
 * browser swaps into storage (apps/web/src/lib/session.ts).
 *
 * Three things have to hold for that promise to be real, and all three are easy
 * to break by accident:
 *
 *   - a token that is still fresh must NOT be re-signed, or the app rewrites
 *     its credential on every single request;
 *   - a token that is getting old MUST be, or the session quietly dies at eight
 *     days no matter how active the user was;
 *   - the renewed token must carry the same identity, and in particular must
 *     not invent an elevated one.
 */

const DAY = 60 * 60 * 24;
const TTL = DAY * 8;

/** A token for `u_tech` (not a superadmin) expiring in `secondsLeft`. */
async function tokenExpiringIn(secondsLeft: number, id = 'u_tech', isSuperadmin = false) {
	const now = Math.floor(Date.now() / 1000);
	return sign(
		{ id, employeeId: null, isSuperadmin, type: 'human', iat: now - (TTL - secondsLeft), exp: now + secondsLeft },
		env.JWT_SECRET as string,
		'HS256',
	);
}

function get(token: string) {
	return SELF.fetch('https://test.local/api/permissions/me', {
		headers: { Authorization: `Bearer ${token}` },
	});
}

describe('sliding session', () => {
	beforeAll(resetDatabase);

	it('does not re-sign a token that is still fresh', async () => {
		const res = await get(await tokenExpiringIn(TTL));
		expect(res.status).toBe(200);
		expect(res.headers.get('X-Refresh-Token')).toBeNull();
	});

	it('re-signs a token with under a week left', async () => {
		const res = await get(await tokenExpiringIn(DAY * 6));
		expect(res.status).toBe(200);
		expect(res.headers.get('X-Refresh-Token')).toBeTruthy();
	});

	it('gives the renewed token a full eight days, so activity restarts the clock', async () => {
		const res = await get(await tokenExpiringIn(DAY * 2));
		const renewed = res.headers.get('X-Refresh-Token')!;
		const { payload } = decode(renewed) as { payload: { exp: number } };

		const secondsLeft = payload.exp - Math.floor(Date.now() / 1000);
		// At least the seven days promised to the user, and no more than the
		// eight the constant allows.
		expect(secondsLeft).toBeGreaterThan(DAY * 7);
		expect(secondsLeft).toBeLessThanOrEqual(TTL + 5);
	});

	it('renews to the same identity and does not elevate it', async () => {
		const res = await get(await tokenExpiringIn(DAY, 'u_tech', false));
		const renewed = res.headers.get('X-Refresh-Token')!;
		const { payload } = decode(renewed) as { payload: { id: string; isSuperadmin: boolean } };

		expect(payload.id).toBe('u_tech');
		expect(payload.isSuperadmin).toBe(false);
	});

	it('accepts the renewed token for the next request', async () => {
		const first = await get(await tokenExpiringIn(DAY));
		const renewed = first.headers.get('X-Refresh-Token')!;

		const second = await get(renewed);
		expect(second.status).toBe(200);
		// And the renewed one is fresh, so it is not immediately re-signed again.
		expect(second.headers.get('X-Refresh-Token')).toBeNull();
	});

	it('refuses an expired token instead of renewing it', async () => {
		const res = await get(await tokenExpiringIn(-60));
		expect(res.status).toBe(401);
		expect(res.headers.get('X-Refresh-Token')).toBeNull();
	});
});
