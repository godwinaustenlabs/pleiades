/**
 * Where a stored profile photo actually lives, and how to ask for it.
 *
 * A photo is stored as either an absolute URL, an `/api/assets/download/...`
 * path, or a bare R2 key, depending on which form wrote it. All three end up
 * here so that no component has to know the difference — six pages had their
 * own copy of this resolver, each subtly different.
 */

import { token } from './auth';

/** R2 prefixes `src/routes/assets.ts` serves without authentication. */
const PUBLIC_PREFIXES = ['avatars/', 'profiles/'];

const isPublic = (key: string) => PUBLIC_PREFIXES.some((p) => key.startsWith(p));

/**
 * An `<img src>` for a stored photo, or null when there is none.
 *
 * An `<img>` cannot send an Authorization header, which is why the API accepts
 * `?token=`. Avatars are served from a public prefix and do not need it, so the
 * token is appended only for a key that does — no reason to put a credential in
 * a URL that does not require one.
 */
export function profilePhotoUrl(raw?: string | null): string | null {
	if (!raw) return null;
	const value = String(raw).trim();
	if (!value) return null;
	if (value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('http')) return value;

	const path = value.startsWith('/api')
		? value
		: `/api/assets/download/${value.startsWith('/') ? value.slice(1) : value}`;

	const key = path.split('?')[0].replace('/api/assets/download/', '');
	if (isPublic(key)) return path;

	return path.includes('?') ? `${path}&token=${token()}` : `${path}?token=${token()}`;
}

/** The one or two letters shown when there is no photo. */
export function initialsFor(name?: string | null, fallback?: string | null): string {
	const source = (name || fallback || '').trim();
	if (!source) return '?';
	const parts = source.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
	if (parts.length === 0) return source.charAt(0).toUpperCase();
	if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
	return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
