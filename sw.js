const STATIC_CACHE = "custom-tools-static-v7";
const RUNTIME_CACHE = "custom-tools-runtime-v7";
const APP_SCOPE = "/custom-tools-studio/";

const STATIC_ASSETS = [
  APP_SCOPE,
  APP_SCOPE + "index.html",
  APP_SCOPE + "approach.html",
  APP_SCOPE + "projects.html",
  APP_SCOPE + "identity.html",
  APP_SCOPE + "contacts.html",
  APP_SCOPE + "request.html",
  APP_SCOPE + "privacy.html",
  APP_SCOPE + "404.html",
  APP_SCOPE + "offline.html",
  APP_SCOPE + "styles.css",
  APP_SCOPE + "script.js",
  APP_SCOPE + "project.js",
  APP_SCOPE + "favicon.svg",
  APP_SCOPE + "manifest.webmanifest"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(APP_SCOPE + "offline.html");
        })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  const isCodeAsset =
    request.destination === "script" ||
    request.destination === "style";

  if (isCodeAsset) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (!response || !response.ok) return response;

        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
