const CACHE_NAME = "food-map-v10-city-lazy";
const APP_SHELL = ["./","./index.html","./styles.css","./city.css","./app.js","./core.js","./config.js","./config.runtime.js","./manifest.webmanifest","./data/cities.json","./assets/icons/icon-192.png","./assets/icons/icon-512.png"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  const url = new URL(event.request.url);
  const networkFirst = /\/data\/cities\/[^/]+\.json$/.test(url.pathname) || url.pathname.endsWith("cities.json") || url.pathname.endsWith("config.js");
  if (networkFirst) {
    event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)); return response; }).catch(()=>caches.match(event.request)));
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy=response.clone(); caches.open(CACHE_NAME).then(c=>c.put(event.request,copy)); return response; })));
  }
});
