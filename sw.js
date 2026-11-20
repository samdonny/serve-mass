// Cache-first so the app runs fully offline after one visit. Bump VERSION on every deploy.
const VERSION = 'servemass-v5';
const FILES = ['./', './index.html', './app.js', './content.js', './ai.js', './audio/index.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(FILES);
    // every recorded line (Father and server voices), so listening works on the plane
    const idx = await (await fetch('./audio/index.js', { cache: 'reload' })).text();
    const mp3 = [...new Set([...idx.matchAll(/"([fs]-[0-9a-f]+\.mp3)"/g)].map(m => './audio/' + m[1]))];
    await c.addAll(mp3);
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
