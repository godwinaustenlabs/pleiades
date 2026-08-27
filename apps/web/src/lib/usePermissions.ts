import { useCallback, useEffect, useState } from 'react';
import { currentUser, fetchGrants, grantsAllow, type Grant, type PermissionLevel } from './auth';

/**
 * Loads the signed-in user's effective grants once and exposes a `can()` check.
 *
 * Replaces the per-page `fetchPermissions` + `UserPermission[]` + ad-hoc `can`
 * logic that was duplicated across every module page. Superadmins short-circuit
 * to true, mirroring the server.
 */
export function usePermissions() {
	const [grants, setGrants] = useState<Grant[]>([]);
	const [loaded, setLoaded] = useState(false);
	const user = currentUser();
	const isSuperadmin = user.isSuperadmin === true;

	useEffect(() => {
		let cancelled = false;
		fetchGrants()
			.then((g) => {
				if (!cancelled) setGrants(g);
			})
			.finally(() => {
				if (!cancelled) setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const can = useCallback(
		(appName: string, feature: string, level: PermissionLevel = 'view') =>
			isSuperadmin || grantsAllow(grants, appName, feature, level),
		[grants, isSuperadmin],
	);

	/** True if any feature of `appName` is visible — use to show/hide a module. */
	const canSeeApp = useCallback(
		(appName: string) =>
			isSuperadmin || grants.some((g) => g.appName === appName && (g.canView || g.canEdit || g.canDelete)),
		[grants, isSuperadmin],
	);

	return { grants, loaded, can, canSeeApp, user, isSuperadmin };
}
