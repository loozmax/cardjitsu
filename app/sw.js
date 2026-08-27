/* Оффлайн-кэш. Ядро — всегда; assets/ — на лету, а если есть
   assets/filelist.json (см. README), то целиком при установке. */
const VERSION = 'cj-v19-opacity';
const CORE = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/cards.js', 'js/engine.js', 'js/ai.js', 'js/ui.js',
  'icon-192.png', 'icon-512.png',
  'vendor/ruffle/ruffle.js',
  'vendor/ruffle/core.ruffle.15317142e75ce021ac04.js',
  'vendor/ruffle/core.ruffle.5e30dc5777a75720eae2.js',
  'vendor/ruffle/6ce4f603a1fe7cc88438.wasm',
  'vendor/ruffle/a71cef02d58dcec6f55f.wasm'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    try {
      const res = await fetch('assets/filelist.json');
      if (res.ok) {
        const files = await res.json();
        await Promise.all(files.map(f => cache.add(f).catch(() => {})));
      }
    } catch (err) { /* списка нет — кэшируем ассеты по мере обращения */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys())
      if (key !== VERSION) await caches.delete(key);
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        const cache = await caches.open(VERSION);
        cache.put(e.request, res.clone());
      }
      return res;
    } catch (err) {
      return new Response('', { status: 404 });
    }
  })());
});
