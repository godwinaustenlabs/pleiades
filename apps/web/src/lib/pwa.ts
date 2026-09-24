/**
 * Service-worker registration.
 *
 * Only in a production build: under `vite dev` a cached shell would serve a
 * stale module graph on every reload, which is a confusing way to spend an
 * afternoon. The worker itself is deliberately conservative about what it will
 * answer from cache — see `public/sw.js`.
 */
export function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) return;
	if (import.meta.env.DEV) return;

	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').then(
			(reg) => {
				// A deploy that lands while the app is open should take effect on the
				// next navigation, not sit waiting behind the old worker forever.
				reg.addEventListener('updatefound', () => {
					const next = reg.installing;
					if (!next) return;
					next.addEventListener('statechange', () => {
						if (next.state === 'installed' && navigator.serviceWorker.controller) {
							next.postMessage('skip-waiting');
						}
					});
				});
			},
			(err) => console.warn('[pwa] service worker registration failed', err),
		);
	});
}
