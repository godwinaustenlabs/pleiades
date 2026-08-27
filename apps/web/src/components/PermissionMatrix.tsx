import React, { useMemo } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { type Grant } from '../lib/auth';
import { useFeatureCatalog, type FeatureCatalog } from '../lib/useFeatureCatalog';

interface PermissionMatrixProps {
	/** Current grants. Only entries with a level set are meaningful. */
	value: Grant[];
	onChange: (next: Grant[]) => void;
	disabled?: boolean;
	/** Pass a catalogue to avoid a second fetch when the parent already has one. */
	catalog?: FeatureCatalog;
}

const LEVELS = ['canView', 'canEdit', 'canDelete'] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_LABEL: Record<Level, string> = {
	canView: 'View',
	canEdit: 'Edit',
	canDelete: 'Delete',
};

const keyOf = (appName: string, feature: string) => `${appName}/${feature}`;

/**
 * The permission editor: every app/feature the server declares, with view, edit
 * and delete per row.
 *
 * Levels imply downwards on the server (delete → edit → view), so ticking Edit
 * ticks View here too. Doing that silently in the UI would misrepresent what is
 * stored, so the implied boxes are shown as checked and locked rather than
 * being quietly added on save.
 */
export default function PermissionMatrix({ value, onChange, disabled = false, catalog: given }: PermissionMatrixProps) {
	const fetched = useFeatureCatalog();
	const catalog = given ?? fetched.catalog;
	const loaded = given ? true : fetched.loaded;

	const byKey = useMemo(() => {
		const m = new Map<string, Grant>();
		for (const g of value) m.set(keyOf(g.appName, g.feature), g);
		return m;
	}, [value]);

	const apps = useMemo(() => Object.keys(catalog).sort(), [catalog]);

	function setLevel(appName: string, feature: string, level: Level, checked: boolean) {
		const k = keyOf(appName, feature);
		const existing = byKey.get(k) ?? { appName, feature, canView: false, canEdit: false, canDelete: false };
		const next: Grant = { ...existing };

		if (checked) {
			// Grant the level and everything it implies.
			if (level === 'canDelete') { next.canDelete = true; next.canEdit = true; next.canView = true; }
			else if (level === 'canEdit') { next.canEdit = true; next.canView = true; }
			else next.canView = true;
		} else {
			// Revoking a level revokes everything that implies it.
			if (level === 'canView') { next.canView = false; next.canEdit = false; next.canDelete = false; }
			else if (level === 'canEdit') { next.canEdit = false; next.canDelete = false; }
			else next.canDelete = false;
		}

		const rest = value.filter((g) => keyOf(g.appName, g.feature) !== k);
		const empty = !next.canView && !next.canEdit && !next.canDelete;
		onChange(empty ? rest : [...rest, next]);
	}

	function setApp(appName: string, checked: boolean) {
		const features = catalog[appName] || [];
		const rest = value.filter((g) => g.appName !== appName);
		onChange(
			checked
				? [...rest, ...features.map((feature) => ({ appName, feature, canView: true, canEdit: false, canDelete: false }))]
				: rest,
		);
	}

	if (!loaded) {
		return (
			<div className="flex items-center gap-2 p-6 text-textSecondary text-xs">
				<Loader2 className="w-4 h-4 animate-spin" /> Loading permissions…
			</div>
		);
	}

	if (apps.length === 0) {
		return <div className="p-6 text-xs text-textSecondary">No features available.</div>;
	}

	const granted = value.filter((g) => g.canView || g.canEdit || g.canDelete).length;

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-textSecondary">
				<ShieldCheck className="w-3.5 h-3.5" />
				{granted === 0 ? 'No access granted' : `${granted} feature${granted === 1 ? '' : 's'} granted`}
			</div>

			{apps.map((appName) => {
				const features = catalog[appName] || [];
				const appGranted = features.filter((f) => byKey.get(keyOf(appName, f))?.canView).length;
				return (
					<div key={appName} className="border border-border rounded-lg overflow-hidden">
						<div className="flex items-center justify-between px-3 py-2 bg-surfaceAlt">
							<div className="text-[11px] font-black uppercase tracking-wider">{appName}</div>
							<button
								type="button"
								disabled={disabled}
								onClick={() => setApp(appName, appGranted !== features.length)}
								className="text-[10px] font-black uppercase tracking-wider text-primary hover:underline disabled:opacity-40"
							>
								{appGranted === features.length ? 'Clear all' : 'View all'}
							</button>
						</div>

						<div className="divide-y divide-border">
							{features.map((feature) => {
								const g = byKey.get(keyOf(appName, feature));
								return (
									<div key={feature} className="flex items-center justify-between px-3 py-2">
										<div className="text-xs">{feature}</div>
										<div className="flex items-center gap-4">
											{LEVELS.map((level) => {
												const checked = !!g?.[level];
												// View is implied by edit, edit by delete: show it as
												// on and locked instead of letting it be unticked into
												// a state the server would not honour.
												const impliedOn =
													(level === 'canView' && (!!g?.canEdit || !!g?.canDelete)) ||
													(level === 'canEdit' && !!g?.canDelete);
												return (
													<label key={level} className="flex items-center gap-1.5 cursor-pointer select-none">
														<input
															type="checkbox"
															checked={checked}
															disabled={disabled || impliedOn}
															onChange={(e) => setLevel(appName, feature, level, e.target.checked)}
															className="accent-primary w-3.5 h-3.5 disabled:opacity-60"
														/>
														<span className="text-[10px] font-black uppercase tracking-wider text-textSecondary">
															{LEVEL_LABEL[level]}
														</span>
													</label>
												);
											})}
										</div>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}
