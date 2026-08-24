/**
 * Shared client-side auth/session helpers.
 *
 * These were previously copy-pasted into ~20 page and component files, which
 * meant the storage keys and the Authorization header shape were defined in
 * twenty places.
 */

export const API = '/api';

/** Staff bearer token. */
export const token = () => localStorage.getItem('ga_token') || '';

/** Client-portal bearer token (separate auth world — see src/routes/portal.ts). */
export const clientToken = () => localStorage.getItem('ga_client_token') || '';

export interface CurrentUser {
	id?: string;
	email?: string;
	username?: string;
	name?: string;
	roleId?: string;
	roleName?: string;
	employeeId?: string | null;
	isSuperadmin?: boolean;
}

export const currentUser = (): CurrentUser => {
	try {
		return JSON.parse(localStorage.getItem('ga_user') || '{}');
	} catch {
		return {};
	}
};

export const authHeaders = (): Record<string, string> => ({
	Authorization: `Bearer ${token()}`,
});

/** One feature grant, as returned by /api/permissions/me. */
export interface Grant {
	appName: string;
	feature: string;
	canView: boolean;
	canEdit: boolean;
	canDelete: boolean;
}

export type PermissionLevel = 'view' | 'edit' | 'delete';

/**
 * Effective grants for the signed-in user. The server resolves these from the
 * user's role; the client never computes access itself.
 */
export async function fetchGrants(): Promise<Grant[]> {
	const res = await fetch(`${API}/permissions/me`, { headers: authHeaders() });
	if (!res.ok) return [];
	const body = await res.json();
	return (body?.data as Grant[]) || [];
}

/** Whether `grants` satisfy app/feature at `level`. delete → edit → view. */
export function grantsAllow(
	grants: Grant[],
	appName: string,
	feature: string,
	level: PermissionLevel = 'view',
): boolean {
	const g = grants.find((x) => x.appName === appName && x.feature === feature);
	if (!g) return false;
	if (level === 'view') return g.canView || g.canEdit || g.canDelete;
	if (level === 'edit') return g.canEdit || g.canDelete;
	return g.canDelete;
}
