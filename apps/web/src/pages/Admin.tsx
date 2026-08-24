import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Search, ShieldAlert, UserCog } from 'lucide-react';
import PermissionMatrix from '../components/PermissionMatrix';
import { useFeatureCatalog } from '../lib/useFeatureCatalog';
import { API, authHeaders, currentUser, type Grant } from '../lib/auth';
import { usePermissions } from '../lib/usePermissions';
import { errorMessage } from '../lib/errors';

interface AdminUser {
	id: string;
	email: string;
	username?: string | null;
	name?: string | null;
	isActive?: boolean | null;
	isSuperadmin?: boolean | null;
	employee?: { name?: string | null; department?: string | null; role?: string | null } | null;
}

const displayName = (u: AdminUser) => u.employee?.name || u.name || u.username || u.email;

/**
 * Access administration.
 *
 * Permissions are per user: what someone can do is exactly the set of features
 * ticked here for them. There is no role to inherit from, so widening one
 * person's access cannot widen anyone else's.
 */
export default function Admin() {
	const { can, loaded: permsLoaded } = usePermissions();
	const me = currentUser();
	const { catalog, loaded: catalogLoaded } = useFeatureCatalog();

	const [users, setUsers] = useState<AdminUser[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [grants, setGrants] = useState<Grant[]>([]);
	const [baseline, setBaseline] = useState<string>('[]');
	const [query, setQuery] = useState('');
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [loadingGrants, setLoadingGrants] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const canEditPerms = can('admin', 'permissions', 'edit');

	useEffect(() => {
		let cancelled = false;
		fetch(`${API}/admin/users`, { headers: authHeaders() })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load users (${r.status})`))))
			.then((b) => {
				if (!cancelled) setUsers((b?.data as AdminUser[]) || []);
			})
			.catch((e) => {
				if (!cancelled) setError(errorMessage(e));
			})
			.finally(() => {
				if (!cancelled) setLoadingUsers(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const loadGrants = useCallback((userId: string) => {
		setLoadingGrants(true);
		setError(null);
		setNotice(null);
		fetch(`${API}/admin/users/${userId}/permissions`, { headers: authHeaders() })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load permissions (${r.status})`))))
			.then((b) => {
				const rows = ((b?.data as any[]) || []).map((g) => ({
					appName: g.appName ?? g.app_name,
					feature: g.feature,
					canView: !!(g.canView ?? g.can_view),
					canEdit: !!(g.canEdit ?? g.can_edit),
					canDelete: !!(g.canDelete ?? g.can_delete),
				})) as Grant[];
				setGrants(rows);
				setBaseline(JSON.stringify(rows));
			})
			.catch((e) => setError(errorMessage(e)))
			.finally(() => setLoadingGrants(false));
	}, []);

	function select(userId: string) {
		setSelectedId(userId);
		loadGrants(userId);
	}

	async function save() {
		if (!selectedId) return;
		setSaving(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch(`${API}/admin/users/${selectedId}/permissions`, {
				method: 'PUT',
				headers: { ...authHeaders(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ permissions: grants }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body?.error || `Save failed (${res.status})`);
			setBaseline(JSON.stringify(grants));
			setNotice(`Saved — ${body?.data?.count ?? grants.length} feature grant(s).`);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	}

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return users;
		return users.filter((u) => `${displayName(u)} ${u.email}`.toLowerCase().includes(q));
	}, [users, query]);

	const selected = users.find((u) => u.id === selectedId) || null;
	const dirty = JSON.stringify(grants) !== baseline;

	if (!permsLoaded) {
		return (
			<div className="flex items-center justify-center h-64 text-textSecondary text-xs">
				<Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
			</div>
		);
	}

	// The server enforces this too; this only avoids rendering an editor whose
	// every save would be refused.
	if (!can('admin', 'permissions', 'view')) {
		return (
			<div className="p-8 max-w-lg mx-auto text-center space-y-3">
				<ShieldAlert className="w-8 h-8 mx-auto text-textSecondary" />
				<div className="text-sm font-black uppercase tracking-wider">Not available</div>
				<p className="text-xs text-textSecondary">
					Administering permissions requires the admin/permissions feature.
				</p>
				<Link to="/" className="inline-block text-[10px] font-black uppercase tracking-wider text-primary hover:underline">
					Back to apps
				</Link>
			</div>
		);
	}

	return (
		<div className="p-4 md:p-6 space-y-4">
			<div className="flex items-center gap-3">
				<Link to="/" className="text-textSecondary hover:text-text">
					<ArrowLeft className="w-4 h-4" />
				</Link>
				<UserCog className="w-5 h-5 text-primary" />
				<div>
					<h1 className="text-lg font-black uppercase tracking-wider leading-none">Access</h1>
					<p className="text-[10px] text-textSecondary uppercase tracking-wider mt-1">
						Permissions are granted per person, feature by feature
					</p>
				</div>
			</div>

			{error && (
				<div className="border border-red-500/40 bg-red-500/10 text-red-500 text-xs px-3 py-2 rounded">{error}</div>
			)}
			{notice && (
				<div className="border border-primary/40 bg-primary/10 text-primary text-xs px-3 py-2 rounded">{notice}</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
				<div className="border border-border rounded-lg overflow-hidden self-start">
					<div className="flex items-center gap-2 px-3 py-2 border-b border-border">
						<Search className="w-3.5 h-3.5 text-textSecondary" />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Find a person"
							className="w-full bg-transparent text-xs outline-none"
						/>
					</div>
					<div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
						{loadingUsers && (
							<div className="px-3 py-4 text-xs text-textSecondary flex items-center gap-2">
								<Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
							</div>
						)}
						{!loadingUsers && filtered.length === 0 && (
							<div className="px-3 py-4 text-xs text-textSecondary">No matching people.</div>
						)}
						{filtered.map((u) => (
							<button
								key={u.id}
								onClick={() => select(u.id)}
								className={`w-full text-left px-3 py-2 hover:bg-surfaceAlt ${
									u.id === selectedId ? 'bg-surfaceAlt' : ''
								}`}
							>
								<div className="text-xs font-bold truncate">{displayName(u)}</div>
								<div className="text-[10px] text-textSecondary truncate">{u.email}</div>
								{u.isSuperadmin && (
									<div className="text-[9px] font-black uppercase tracking-wider text-primary mt-0.5">Superadmin</div>
								)}
								{u.isActive === false && (
									<div className="text-[9px] font-black uppercase tracking-wider text-textSecondary mt-0.5">
										Deactivated
									</div>
								)}
							</button>
						))}
					</div>
				</div>

				<div className="border border-border rounded-lg p-4">
					{!selected && (
						<div className="text-xs text-textSecondary py-8 text-center">
							Select a person to see and edit what they can reach.
						</div>
					)}

					{selected && (
						<div className="space-y-4">
							<div className="flex items-start justify-between gap-4">
								<div>
									<div className="text-sm font-black">{displayName(selected)}</div>
									<div className="text-[10px] text-textSecondary uppercase tracking-wider">
										{selected.employee?.role || selected.employee?.department || 'Staff'}
									</div>
								</div>
								<button
									onClick={save}
									disabled={!canEditPerms || saving || !dirty || loadingGrants}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
								>
									{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
									{saving ? 'Saving' : dirty ? 'Save changes' : 'Saved'}
								</button>
							</div>

							{selected.isSuperadmin && (
								<div className="border border-border bg-surfaceAlt text-xs px-3 py-2 rounded text-textSecondary">
									This account is a superadmin and bypasses every permission check. These grants are
									recorded but do not affect what it can reach. Superadmin is settable only by direct
									database access.
								</div>
							)}

							{selected.id === me.id && (
								<div className="border border-border bg-surfaceAlt text-xs px-3 py-2 rounded text-textSecondary">
									You are editing your own access. Removing admin/permissions here will take away your
									ability to open this page.
								</div>
							)}

							{loadingGrants ? (
								<div className="flex items-center gap-2 py-8 text-xs text-textSecondary">
									<Loader2 className="w-4 h-4 animate-spin" /> Loading permissions…
								</div>
							) : (
								<PermissionMatrix
									value={grants}
									onChange={setGrants}
									disabled={!canEditPerms}
									catalog={catalogLoaded ? catalog : undefined}
								/>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
