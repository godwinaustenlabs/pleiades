import { useEffect, useState } from 'react';
import { API, authHeaders } from './auth';

/** The app → features catalogue, as declared by APP_FEATURES on the server. */
export type FeatureCatalog = Record<string, string[]>;

/**
 * Fetches the feature catalogue from the server rather than hard-coding it.
 *
 * APP_FEATURES in src/middleware/rbac.ts is the single source of truth for what
 * features exist. A copy kept on the client would drift, and a grant naming a
 * feature the server does not declare can never be satisfied — it would render
 * as a ticked box that grants nothing.
 */
export function useFeatureCatalog(): { catalog: FeatureCatalog; loaded: boolean } {
	const [catalog, setCatalog] = useState<FeatureCatalog>({});
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch(`${API}/permissions/app-features`, { headers: authHeaders() })
			.then((r) => (r.ok ? r.json() : { data: {} }))
			.then((b) => {
				if (!cancelled) setCatalog((b?.data as FeatureCatalog) || {});
			})
			.catch(() => {
				if (!cancelled) setCatalog({});
			})
			.finally(() => {
				if (!cancelled) setLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return { catalog, loaded };
}
