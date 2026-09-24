/**
 * Pleiades service worker.
 *
 * Deliberately small, and deliberately conservative about what it is allowed to
 * answer from cache. The app is an internal operating system whose data is
 * live: showing yesterday's payroll because the network was slow would be worse
 * than showing nothing. So:
 *
 *   - `/api/*` is never cached and never intercepted. Not stale-while-revalidate,
 *     not opportunistic — it goes straight to the network.
 *   - Navigations are network-first with a cached shell fallback, so a deploy is
 *     picked up on the next load rather than pinned until someone clears data,
 *     and a cold launch with no signal still opens the app instead of the
 *     browser's offline page.
 *   - Hashed build assets (/assets/*) are immutable by construction, so they are
 *     cache-first; everything else same-origin is stale-while-revalidate.
 *
 * Bump CACHE when the shell changes shape. Old caches are dropped on activate.
 */

const CACHE = 'pleiades-v1';
const SHELL = ['/', '/icon-192.png', '/icon-512.png', '/manifest.json'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;

	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api/')) return;

	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					const copy = res.clone();
					caches.open(CACHE).then((c) => c.put('/', copy));
					return res;
				})
				.catch(() => caches.match('/').then((r) => r || Response.error())),
		);
		return;
	}

	const immutable = url.pathname.startsWith('/assets/');

	event.respondWith(
		caches.match(req).then((hit) => {
			if (hit && immutable) return hit;
			const network = fetch(req)
				.then((res) => {
					if (res.ok && res.type === 'basic') {
						const copy = res.clone();
						caches.open(CACHE).then((c) => c.put(req, copy));
					}
					return res;
				})
				.catch(() => hit);
			return hit || network;
		}),
	);
});
