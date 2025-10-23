const CACHE_VERSION = "v2";
const CACHE_NAME = `expense-tracker-${CACHE_VERSION}`;
const APP_PREFIX = "expense-tracker-";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./analytics.html",
  "./goals.html",
  "./settings.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(APP_PREFIX) && key !== CACHE_NAME)
          .map((outdatedKey) => caches.delete(outdatedKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
          return networkResponse;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return caches.match("./index.html");
        });
    })
  );
});
