import { useEffect, useState } from 'react';
import { API, authHeaders, currentUser, token, type CurrentUser } from './auth';

/** How long a whoami refresh is considered fresh enough, in ms. */
const REFRESH_AFTER = 5 * 60 * 1000;
const STAMP_KEY = 'ga_user_synced_at';

/**
 * The signed-in person, kept current.
 *
 * `ga_user` is written once at sign-in, which was fine when a session lasted
 * eight hours and is not fine now that one lasts a week: a name or a profile
 * photo changed on another device would not reach this browser until the user
 * signed in again. So this reads the cached copy for the first paint, then
 * reconciles it against `/auth/whoami` — at most once every few minutes, and
 * never without a token.
 *
 * It also listens for `ga_user_updated`, which `ProfileModal` fires after a
 * save, so a new photo appears in the header the moment it is uploaded rather
 * than on the next navigation.
 */
export function useCurrentUser(): CurrentUser {
	const [user, setUser] = useState<CurrentUser>(() => currentUser());

	useEffect(() => {
		const sync = () => setUser(currentUser());
		window.addEventListener('ga_user_updated', sync);
		window.addEventListener('storage', sync);

		let cancelled = false;
		const last = Number(sessionStorage.getItem(STAMP_KEY) || 0);
		if (token() && Date.now() - last > REFRESH_AFTER) {
			sessionStorage.setItem(STAMP_KEY, String(Date.now()));
			fetch(`${API}/auth/whoami`, { headers: authHeaders() })
				.then((r) => (r.ok ? r.json() : null))
				.then((body) => {
					const d = body?.data;
					if (cancelled || !d) return;
					const merged: CurrentUser = {
						...currentUser(),
						id: d.id,
						email: d.email ?? undefined,
						username: d.username ?? undefined,
						name: d.name ?? undefined,
						title: d.title ?? undefined,
						employeeId: d.employeeId ?? null,
						profilePhoto: d.profilePhoto ?? null,
						isSuperadmin: !!d.isSuperadmin,
					};
					localStorage.setItem('ga_user', JSON.stringify(merged));
					setUser(merged);
				})
				.catch(() => {
					/* offline, or the session just expired — the cached copy stands */
				});
		}

		return () => {
			cancelled = true;
			window.removeEventListener('ga_user_updated', sync);
			window.removeEventListener('storage', sync);
		};
	}, []);

	return user;
}
