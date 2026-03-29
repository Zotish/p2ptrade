const CACHE = "p2p-escrow-v1";
const OFFLINE_URL = "/";

// Install — core assets cache করো
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"])
    )
  );
  self.skipWaiting();
});

// Activate — পুরনো cache delete করো
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("/api/") || e.request.url.includes("railway.app")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match(OFFLINE_URL)))
  );
});
