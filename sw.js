// Offline support: keeps a copy of the app so it opens without a connection.
// Network first, so a new version shows up on the next visit; the copy covers offline use.
const CACHE = 'fix-my-asmr-2';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'relief.js', 'dsp.js', 'worklet.js', 'engine.js',
  'vendor/mediabunny.min.mjs', 'manifest.webmanifest', 'assets/icon.svg', 'assets/apple-touch-icon.png',
  'assets/fonts/barlow-400-latin.woff2', 'assets/fonts/barlow-500-latin.woff2', 'assets/fonts/barlow-600-latin.woff2',
  'assets/fonts/barlow-700-latin.woff2', 'assets/fonts/barlow-800-latin.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
