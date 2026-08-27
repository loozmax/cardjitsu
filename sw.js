/* Оффлайн-кэш. Ядро — всегда; assets/ — целиком при установке по
   assets/filelist.json (с ретраями; недокачка = установка не удалась,
   браузер повторит её при следующем заходе). */
const VERSION = 'cj-v21-offline';
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
    let files = null;
    try {
      const res = await fetch('assets/filelist.json');
      if (res.ok) files = await res.json();
    } catch (err) { /* списка нет — кэшируем ассеты по мере обращения */ }
    if (files) {
      await cache.add('assets/filelist.json').catch(() => {});
      const queue = files.slice();
      let failed = 0;
      const worker = async () => {
        while (queue.length) {
          const f = queue.pop();
          if (await cache.match(f)) continue;
          let ok = false;
          for (let t = 0; t < 3 && !ok; t++) {
            try { await cache.add(f); ok = true; } catch (err) {}
          }
          if (!ok) failed++;
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      if (failed) throw new Error('offline cache incomplete: ' + failed);
    }
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
    // ignoreSearch: страница просит js/ui.js?v=NN, в кэше лежит js/ui.js
    const cached = await caches.match(e.request, { ignoreSearch: true });
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
