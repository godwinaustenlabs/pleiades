/**
 * Session persistence for the browser half of the sliding window implemented in
 * `src/middleware/auth.ts`.
 *
 * The server answers any request made with a token older than a day with a
 * freshly signed one in `X-Refresh-Token`. Somebody has to notice that header
 * and write it back to storage, and the app makes several hundred bare `fetch`
 * calls spread across every page — so this wraps `window.fetch` once, at
 * startup, rather than asking each call site to remember. A page keeps calling
 * `fetch(..., { headers: authHeaders() })` exactly as before and its session
 * quietly rolls forward.
 *
 * The consequence for the user is the point of the exercise: staying signed in
 * for a week of *inactivity*, with the clock restarting on every request the app
 * makes, instead of being logged out most mornings.
 */

import { API } from './auth';

const REFRESH_HEADER = 'x-refresh-token';

/** Staff token key. Kept in one place; see `auth.ts` for the readers. */
const STAFF_KEY = 'ga_token';
/** Client-portal token key — a separate auth world (see src/routes/portal.ts). */
const CLIENT_KEY = 'ga_client_token';

/** Endpoints where a 401 is an answer, not an expired session. */
const LOGIN_PATHS = ['/auth/login', '/portal/login', '/auth/request-reset', '/auth/complete-reset'];

let installed = false;

/** The absolute path of whatever `fetch` was handed, or '' if it is not ours. */
function pathOf(input: RequestInfo | URL): string {
	try {
		const raw =
			typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
		const url = new URL(raw, window.location.origin);
		return url.origin === window.location.origin ? url.pathname : '';
	} catch {
		return '';
	}
}

function isPortal(path: string) {
	return path.startsWith(`${API}/portal`);
}

/**
 * Wrap `window.fetch` so that every API response can roll the session forward,
 * and an expired one lands the user on the right sign-in screen.
 *
 * Idempotent: calling it twice does not stack two wrappers.
 */
export function installSessionRefresh() {
	if (installed || typeof window === 'undefined') return;
	installed = true;

	const original = window.fetch.bind(window);

	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const res = await original(input, init);
		const path = pathOf(input);
		if (!path.startsWith(`${API}/`)) return res;

		const key = isPortal(path) ? CLIENT_KEY : STAFF_KEY;

		const renewed = res.headers.get(REFRESH_HEADER);
		if (renewed) {
			try {
				localStorage.setItem(key, renewed);
			} catch {
				/* private mode, quota — the session simply expires on schedule */
			}
		}

		if (res.status === 401 && !LOGIN_PATHS.some((p) => path === `${API}${p}`)) {
			// The token we were holding is no longer good for anything. Clearing it
			// here is what stops the app from retrying with it on every subsequent
			// render; pages that already handle 401 themselves still do.
			if (localStorage.getItem(key)) {
				localStorage.removeItem(key);
				if (key === STAFF_KEY) localStorage.removeItem('ga_user');
				window.dispatchEvent(new CustomEvent('pleiades:session-expired', { detail: { portal: key === CLIENT_KEY } }));
			}
		}

		return res;
	};
}

/**
 * Send the user to the sign-in screen for whichever world their session
 * belonged to. `replace` so the back button cannot return to a dead page.
 */
export function redirectToLogin(portal = false) {
	const target = portal ? '/portal' : '/login';
	if (window.location.pathname !== target) window.location.replace(target);
}

/** Clear a staff session and return to the login screen. */
export function signOut() {
	localStorage.removeItem(STAFF_KEY);
	localStorage.removeItem('ga_user');
	redirectToLogin(false);
}
