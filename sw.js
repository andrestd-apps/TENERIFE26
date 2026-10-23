/* Service worker · Tenerife 26
   - Archivos propios: network-first (siempre la última versión si hay red).
   - Librerías y fuentes de CDN (Firebase SDK, SortableJS, Google Fonts): se guardan
     para poder abrir la app sin conexión.
   - Imágenes del itinerario: se guardan al verlas para que también salgan offline.
   - Firestore y Firebase Auth NO se interceptan (no romper la sincronización).
   Sube la versión de CORE_CACHE (-v2, -v3…) cuando cambies los archivos. */
const CORE_CACHE = 'tenerife26-core-v1';
const LIB_CACHE = 'tenerife26-lib-v1';
const IMG_CACHE = 'tenerife26-img-v1';
const KEEP = [CORE_CACHE, LIB_CACHE, IMG_CACHE];
const CORE = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
const LIB_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];
const MAX_IMAGES = 80;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CORE_CACHE).then(c => c.addAll(CORE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // 1) Archivos de la propia app
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
    return;
  }
  // 2) Librerías y fuentes versionadas
  if (LIB_HOSTS.includes(url.hostname) || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // 3) Imágenes externas del itinerario
  if (req.destination === 'image') {
    e.respondWith(cacheFirstImage(req));
    return;
  }
  // 4) Todo lo demás (Firestore, Auth…) pasa directo
});

function networkFirst(req) {
  return fetch(req).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CORE_CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r =>
    r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
}

function staleWhileRevalidate(req) {
  return caches.open(LIB_CACHE).then(c => c.match(req).then(cached => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => cached || Response.error());
    return cached || net;
  }));
}

function cacheFirstImage(req) {
  return caches.open(IMG_CACHE).then(c => c.match(req).then(cached => {
    if (cached) return cached;
    return fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        c.put(req, res.clone()).then(() => trimCache(c)).catch(() => {});
      }
      return res;
    }).catch(() => Response.error());
  }));
}

function trimCache(cache) {
  return cache.keys().then(keys => {
    if (keys.length <= MAX_IMAGES) return;
    return Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map(k => cache.delete(k)));
  });
}
