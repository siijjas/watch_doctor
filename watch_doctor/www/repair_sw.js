{% raw %}
// Watch Doctor staff app service worker (Phase 5: install to home screen).
// Hashed bundle files are cached forever; the app page is fetched fresh and
// kept only so the app still opens without a connection.
const VERSION = 'dw-v1';
const SHELL = '/repair/';
const ASSETS = '/assets/watch_doctor/frontend/assets/';

self.addEventListener('install', event => {
	self.skipWaiting();
	event.waitUntil(caches.open(VERSION).then(cache => cache.add(SHELL)).catch(() => undefined));
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys()
			.then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	if (url.pathname.startsWith(ASSETS)) {
		event.respondWith(
			caches.open(VERSION).then(async cache => {
				const hit = await cache.match(req);
				if (hit) return hit;
				const res = await fetch(req);
				if (res.ok) cache.put(req, res.clone());
				return res;
			})
		);
		return;
	}

	if (req.mode === 'navigate' && (url.pathname === '/repair' || url.pathname.startsWith('/repair/'))) {
		event.respondWith(
			fetch(req)
				.then(res => {
					if (res.ok) {
						const copy = res.clone();
						caches.open(VERSION).then(cache => cache.put(SHELL, copy));
					}
					return res;
				})
				.catch(() => caches.match(SHELL).then(hit => hit || new Response('Offline', { status: 503 })))
		);
	}
});
{% endraw %}
