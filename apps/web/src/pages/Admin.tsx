import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, Loader2, Save, Search, ShieldAlert, UserCog, LifeBuoy, Mail, Bot, Users, Inbox } from 'lucide-react';
import PermissionMatrix from '../components/PermissionMatrix';
import AppointmentAccess, { type AppointmentRowFull } from '../components/AppointmentAccess';
import EffectiveAccess from '../components/EffectiveAccess';
import MailboxAdmin from '../components/MailboxAdmin';
import AutomationsPanel from '../components/AutomationsPanel';
import MailboxTab from '../components/MailboxTab';
import ProfileModal from '../components/ProfileModal';
import UserAvatar from '../components/UserAvatar';
import { useFeatureCatalog } from '../lib/useFeatureCatalog';
import { API, authHeaders, type Grant } from '../lib/auth';
import { usePermissions } from '../lib/usePermissions';
import { useCurrentUser } from '../lib/useCurrentUser';
import { errorMessage } from '../lib/errors';

type Section = 'access' | 'posts' | 'mailboxes' | 'unrouted' | 'automations';

interface AdminUser {
	id: string;
	email: string;
	username?: string | null;
	name?: string | null;
	isActive?: boolean | null;
	isSuperadmin?: boolean | null;
	recoveryEmail?: string | null;
	employee?: { name?: string | null; department?: string | null; role?: string | null } | null;
}

const displayName = (u: AdminUser) => u.employee?.name || u.name || u.username || u.email;

/**
 * HQ — access administration.
 *
 * "HQ" is the display name; the RBAC app is still `admin`, so its features read
 * admin/permissions, admin/appointments and so on. Renaming the key would mean a
 * migration over every grant row and a rewrite of every gate, for no behavioural
 * change — so the rename is in the UI, and `APP_LABEL` in PermissionMatrix maps the
 * one to the other wherever a person sees it.
 *
 * Two editors, because access has two sources and they are unioned:
 *
 *   Access — what belongs to a PERSON. Edit it here for access that should not
 *     follow a job: a contractor, somebody standing in, a login with no employee
 *     record at all.
 *   Posts  — the post itself, who holds it, and what belongs to it. Normally where
 *     access should go: replacing the holder is one edit here and both people's
 *     access changes with it, mailbox and committee seat included.
 *
 * Neither overrides the other, so there is no precedence to reason about. The
 * effective-access panel on HQ's Access tab is what makes the union legible — the
 * matrix there shows only the person's own grants, and without that panel a feature
 * they reach through a post looks like access they lack.
 */
export default function Admin() {
	const { can, loaded: permsLoaded } = usePermissions();
	const me = useCurrentUser();
	const { catalog, loaded: catalogLoaded } = useFeatureCatalog();

	const [users, setUsers] = useState<AdminUser[]>([]);
	const [appointments, setAppointments] = useState<AppointmentRowFull[]>([]);
	const [employees, setEmployees] = useState<{ id: string; name: string; department?: string | null }[]>([]);
	const [committees, setCommittees] = useState<{ id: string; committeeName: string }[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [grants, setGrants] = useState<Grant[]>([]);
	const [baseline, setBaseline] = useState<string>('[]');
	const [query, setQuery] = useState('');
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [loadingGrants, setLoadingGrants] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [showProfile, setShowProfile] = useState(false);
	/** Five jobs on one page, too much to stack. */
	const [section, setSection] = useState<Section>('access');
	const [recovery, setRecovery] = useState('');
	const [savingRecovery, setSavingRecovery] = useState(false);

	const canEditPerms = can('admin', 'permissions', 'edit');
	// A different grant from the matrix: creating a post and assigning a holder is one
	// authority, deciding what the post opens is another. See src/routes/appointments.ts.
	const canManagePosts = can('admin', 'appointments', 'edit');
	const canEditMailboxes = can('admin', 'mailboxes', 'edit');

	/**
	 * Which tabs this person can open, derived once.
	 *
	 * The page used to be guarded on `admin/permissions` view alone, with Access and
	 * Posts assumed always visible because that grant was what both needed. Since
	 * migration 0050 moved posts to their own feature that is no longer true:
	 * somebody with `admin/appointments` and nothing else could not open HQ at all.
	 * Guard and tab row are now the same list, so they cannot drift apart again.
	 */
	const tabs = useMemo(() => ([
		{ id: 'access' as const, label: 'Access', icon: Users, show: can('admin', 'permissions', 'view') },
		{ id: 'posts' as const, label: 'Posts', icon: Briefcase, show: can('admin', 'appointments', 'view') || can('admin', 'permissions', 'view') },
		{ id: 'mailboxes' as const, label: 'Mailboxes', icon: Mail, show: can('admin', 'mailboxes', 'view') },
		{ id: 'unrouted' as const, label: 'Unrouted', icon: Inbox, show: can('admin', 'mailboxes', 'view') },
		{ id: 'automations' as const, label: 'Automations', icon: Bot, show: can('admin', 'email_config', 'view') },
	].filter((t) => t.show)), [can]);

	// Land on something they can actually open, rather than on an empty Access tab.
	useEffect(() => {
		if (tabs.length > 0 && !tabs.some((t) => t.id === section)) setSection(tabs[0].id);
	}, [tabs, section]);
	// Derived from the server's catalogue rather than listed here, so an app that
	// gains or loses mail does not need this file edited.
	const mailApps = useMemo(
		() => Object.keys(catalog).filter((a) => catalog[a]?.includes('email')).sort(),
		[catalog],
	);

	/**
	 * Every appointment, for the Posts editor and for attaching a mailbox to one.
	 *
	 * From `/admin/appointments` rather than `/hr/appointments`: administering access
	 * must not require HR access, and asking for both would mean nobody could edit a
	 * post's permissions without also being able to read the payroll.
	 */
	const loadAppointments = useCallback(() => {
		fetch(`${API}/appointments`, { headers: authHeaders() })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not load posts (${r.status})`))))
			.then((b) => setAppointments((b?.data as AppointmentRowFull[]) || []))
			// Not fatal: the person editor and the mailbox list still work without it.
			.catch(() => setAppointments([]));
	}, []);

	useEffect(() => {
		loadAppointments();
	}, [loadAppointments]);

	/**
	 * Employees and committees, for the pickers in the post form.
	 *
	 * From `/api/core/*`, which every grant that reaches this page already holds —
	 * `core/employees` is read-only reference data. A failure here leaves the form
	 * with empty dropdowns rather than breaking the screen, which is why it is not
	 * surfaced as an error.
	 */
	useEffect(() => {
		let cancelled = false;
		Promise.all([
			fetch(`${API}/core/employees`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { data: [] })),
			fetch(`${API}/core/committees`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : { data: [] })),
		])
			.then(([emp, cmt]) => {
				if (cancelled) return;
				setEmployees(((emp?.data as any[]) || []).map((e) => ({ id: e.id, name: e.name, department: e.department })));
				setCommittees(((cmt?.data as any[]) || []).map((c) => ({ id: c.id, committeeName: c.committeeName })));
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

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
		setRecovery(users.find((u) => u.id === userId)?.recoveryEmail || '');
	}

	/**
	 * Saves the recovery address.
	 *
	 * Separate from the permission save because it is a different kind of fact and
	 * a different kind of mistake: getting a grant wrong is visible the next time
	 * somebody opens a page, whereas getting this wrong is invisible until
	 * somebody is locked out and cannot be let back in. The server refuses an
	 * address on a domain Pleiades hosts the mail for — otherwise resetting a
	 * password would require already being able to log in — and the message it
	 * returns is shown verbatim.
	 */
	async function saveRecovery() {
		if (!selectedId) return;
		setSavingRecovery(true);
		setError(null);
		setNotice(null);
		try {
			const res = await fetch(`${API}/admin/users/${selectedId}`, {
				method: 'PATCH',
				headers: { ...authHeaders(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ recoveryEmail: recovery.trim() }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body?.error || `Could not save (${res.status})`);
			setUsers((prev) => prev.map((u) => (u.id === selectedId ? { ...u, recoveryEmail: recovery.trim() || null } : u)));
			setNotice('Recovery address saved.');
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setSavingRecovery(false);
		}
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
	if (tabs.length === 0) {
		return (
			<div className="p-8 max-w-lg mx-auto text-center space-y-3">
				<ShieldAlert className="w-8 h-8 mx-auto text-textSecondary" />
				<div className="text-sm font-black uppercase tracking-wider">Not available</div>
				<p className="text-xs text-textSecondary">
					HQ needs at least one of the admin features: permissions, appointments, mailboxes
					or email_config.
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
				<Link to="/" className="shrink-0 text-textSecondary hover:text-text">
					<ArrowLeft className="w-4 h-4" />
				</Link>
				<UserCog className="w-5 h-5 shrink-0 text-primary" />
				<div className="min-w-0">
					<h1 className="text-lg font-black uppercase tracking-wider leading-none">HQ</h1>
					<p className="mt-1 text-[10px] uppercase tracking-wider text-textSecondary">
						Posts, people and what each can reach
					</p>
				</div>
				<button
					onClick={() => setShowProfile(true)}
					aria-label="Profile settings"
					className="ml-auto shrink-0 rounded-full border border-border bg-surfaceAlt p-1 transition-all hover:border-borderStrong"
				>
					<UserAvatar name={me.name || me.username} email={me.email} photo={me.profilePhoto} size={30} />
				</button>
			</div>

			{showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

			{error && (
				<div className="border border-danger/40 bg-danger/10 text-danger text-xs px-3 py-2 rounded">{error}</div>
			)}
			{notice && (
				<div className="border border-primary/40 bg-primary/10 text-primary text-xs px-3 py-2 rounded">{notice}</div>
			)}

			{/* A scrolling row of pills rather than a dropdown, and horizontal at every
			    width: three items fit on a 390px screen, and hiding them behind a tap
			    costs a second tap just to discover what is here. */}
			<div className="scroll-x no-scrollbar mb-4 flex gap-2">
				{tabs
					.map((t) => (
						<button
							key={t.id}
							onClick={() => setSection(t.id)}
							className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-bold transition-all active:scale-[0.97] ${
								section === t.id
									? 'border-primary/40 bg-primary/15 text-primary'
									: 'border-border bg-surfaceAlt text-textSecondary'
							}`}
						>
							<t.icon className="h-3.5 w-3.5" />
							{t.label}
						</button>
					))}
			</div>

			{section === 'automations' && <AutomationsPanel />}

			{section === 'posts' && (
				<AppointmentAccess
					appointments={appointments}
					employees={employees}
					committees={committees}
					catalog={catalogLoaded ? catalog : undefined}
					disabled={!canEditPerms}
					disableManage={!canManagePosts}
					onChanged={loadAppointments}
				/>
			)}

			{/* The catch-all. It belongs to no app and no person, so both of MailboxTab's
			    other scopes filtered it out and it collected everything addressed to
			    nobody with no screen able to open it. Gated on admin/mailboxes, which is
			    also what canUseMailbox requires to read it — mail to an address nobody
			    created is as likely to be a misdirected payroll query as it is spam. */}
			{section === 'unrouted' && can('admin', 'mailboxes', 'view') && (
				<MailboxTab
					scope={{ kind: 'catchall' }}
					heading="Unrouted mail"
					description="Everything sent to an address that has no mailbox — typos, old addresses, DMARC reports, and spam. If something here should have a home, create the mailbox on the Mailboxes tab and later mail to it will route there."
				/>
			)}

			{section === 'mailboxes' && can('admin', 'mailboxes', 'view') && (
				<MailboxAdmin
					apps={mailApps}
					people={users.map((u) => ({ id: u.id, name: displayName(u), email: u.email }))}
					appointments={appointments}
					disabled={!canEditMailboxes}
				/>
			)}

			<div className={`grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 ${section === 'access' ? '' : 'hidden'}`}>
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
					<div className="max-h-[60dvh] overflow-y-auto divide-y divide-border">
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
									className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-surface text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
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

							<EffectiveAccess userId={selected.id} />

							<div className="border border-border rounded p-3 bg-surfaceAlt">
								<div className="flex items-center gap-1.5 mb-1">
									<LifeBuoy className="w-3.5 h-3.5 text-textSecondary" />
									<span className="text-[10px] font-black uppercase tracking-wider text-textSecondary">
										Password recovery address
									</span>
								</div>
								<p className="text-[11px] text-textSecondary mb-2">
									Where a reset link is sent. It must be off the company domain — once mail lives in
									Pleiades, sending a reset to {selected.email} would mean logging in to read the email
									that lets you log in. Without one set, a reset cannot be delivered at all.
								</p>
								<div className="flex gap-2">
									<input
										value={recovery}
										onChange={(e) => setRecovery(e.target.value)}
										placeholder="personal@example.com"
										disabled={!canEditPerms}
										className="min-w-0 flex-1 rounded border border-border bg-surface px-2 py-1.5 outline-none"
									/>
									<button
										onClick={saveRecovery}
										disabled={savingRecovery || !canEditPerms || recovery.trim() === (selected.recoveryEmail || '')}
										className="shrink-0 flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-onScrim disabled:opacity-40"
									>
										{savingRecovery && <Loader2 className="w-3 h-3 animate-spin" />} Save
									</button>
								</div>
								{!selected.recoveryEmail && (
									<p className="mt-1.5 text-[11px] text-warning">
										Not set — this person cannot be sent a password reset.
									</p>
								)}
							</div>

							{loadingGrants ? (
								<div className="flex items-center gap-2 py-8 text-xs text-textSecondary">
									<Loader2 className="w-4 h-4 animate-spin" /> Loading permissions…
								</div>
							) : (
								<div className="space-y-2">
									<p className="text-[11px] leading-relaxed text-textSecondary">
										Grants that belong to <span className="font-bold">this person</span>, whatever
										post they hold. Access that should follow the job belongs on the Posts tab —
										ticked there, it moves to the next holder on its own.
									</p>
									<PermissionMatrix
										value={grants}
										onChange={setGrants}
										disabled={!canEditPerms}
										catalog={catalogLoaded ? catalog : undefined}
									/>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

		</div>
	);
}
