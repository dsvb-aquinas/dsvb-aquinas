// Keeps the site and books available offline. Pages and code: network first (so updates show). Big files: cache first.
const V = "dsvb-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const fresh = /(\.html|\.css|reader\.js|config\.js|prompt\.js|books\.json)$|\/$/.test(u.pathname);
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (fresh) return net.catch(() => hit);
    if (hit) { net.catch(() => {}); return hit; }
    return net;
  }));
});
