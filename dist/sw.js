// Offline shell. Bump CACHE whenever a cached file changes.
// Paths are relative to this file, so the collection works at a domain root or in a sub-folder.
const CACHE = "chloe-shell-v3";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "fonts.css",
  "app.js",
  "store.js",
  "logic.js",
  "data.js",
  "tea.js",
  "world.js",
  "wish.js",
  "manifest.webmanifest",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `assets/font-${n}.ttf`),
  ...[
    "burger",
    "coast",
    "coffee",
    "curry",
    "flowers",
    "leaves",
    "pasta",
    "pottery",
    "risotto",
    "salmon",
    "toast",
    "vase",
  ].map((n) => `assets/${n}.jpg`),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

const fromCache = (request) => caches.match(request, { ignoreSearch: true });

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Photos, fonts and icons never change under the same name: serve from cache first.
  if (url.pathname.includes("/assets/")) {
    event.respondWith(fromCache(request).then((hit) => hit || fetch(request)));
    return;
  }

  // Code and pages: try the network so updates arrive, fall back to the saved copy offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        fromCache(request).then(
          (hit) =>
            hit ||
            (request.mode === "navigate" ? fromCache(new URL("./", self.location).href) : Response.error()),
        ),
      ),
  );
});
