// sw.js — Cascada sin conexión.
//
// La app entera cabe en el caché: no hay servidor que consultar, así que la
// estrategia es "del caché primero" y la red solo sirve para traer una versión
// nueva en segundo plano.

const VERSION = 'cascada-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'assets/icon.svg',
  'assets/icon-180.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'src/app.js',
  'src/ui.js',
  'src/score.js',
  'src/songs.js',
  'src/audio.js',
  'src/midi.js',
  'src/mic.js',
  'src/transcribe.js',
  'src/keyboard.js',
  'src/roll.js',
  'src/player.js',
  'src/store.js',
  'src/tokens.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (e) {
        // Un archivo que no esté no debe tumbar la instalación entera.
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== VERSION) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // un MIDI de fuera no se cachea

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) {
      // Refresco silencioso para la próxima vez.
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            const cache = await caches.open(VERSION);
            await cache.put(request, fresh.clone());
          }
        } catch (e) { /* sin red: seguimos con lo guardado */ }
      })());
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(request, response.clone());
      }
      return response;
    } catch (e) {
      const fallback = await caches.match('index.html');
      if (fallback) return fallback;
      return new Response('Sin conexión y sin copia guardada.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
