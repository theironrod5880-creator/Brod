// AROD service worker — minimal, no aggressive caching.
self.addEventListener('install', function(e){ self.skipWaiting(); });

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Pass-through. Satisfies install requirement, does not cache.
self.addEventListener('fetch', function(e){});
