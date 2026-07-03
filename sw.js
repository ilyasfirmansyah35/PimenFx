// PimenFx Service Worker - CACHE KILLER v2
// Menghapus semua cache lama dan menonaktifkan service worker ini

self.addEventListener('install', (e) => {
  // Skip waiting agar langsung aktif
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // Hapus SEMUA cache yang pernah ada
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        console.log('[SW] Menghapus cache:', key);
        return caches.delete(key);
      }));
    }).then(() => {
      // Ambil alih semua tab/window yang terbuka
      return self.clients.claim();
    }).then(() => {
      // Beritahu semua client untuk reload
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    })
  );
});

// Jangan cache apapun - selalu ambil dari network
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});