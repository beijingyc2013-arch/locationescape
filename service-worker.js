const V = 'locatiejacht-v13';
const CORE = ['./', 'index.html', 'style.css', 'script.js', 'puzzles.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'];
const CDN = ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(CORE.map(u => c.add(u).catch(() => {})));   // een ontbrekend bestand mag de installatie niet blokkeren
    await Promise.all(CDN.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.includes('overpass')) return;       // Overpass altijd live
  if ((url.hostname.endsWith('arcgisonline.com') || url.hostname.endsWith('tile.openstreetmap.org'))) {                       // kaarttegels: cache met limiet
    e.respondWith(caches.open(V + '-tiles').then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) { c.put(req, r.clone()); c.keys().then(k => k.length > 400 && c.delete(k[0])); } return r; }
      catch (err) { return Response.error(); }
    }));
    return;
  }
  if (req.mode === 'navigate') {                                               // pagina: direct uit cache, op de achtergrond verversen
    e.respondWith(caches.match('index.html').then(hit => {
      const net = fetch(req).then(r => { if (r.ok) caches.open(V).then(c => c.put('index.html', r.clone())); return r; });
      return hit ? (net.catch(() => {}), hit) : net.catch(() => caches.match('index.html'));
    }));
    return;
  }
  e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => {
    if (r.ok && (url.origin === location.origin || url.hostname === 'unpkg.com')) caches.open(V).then(c => c.put(req, r.clone()));
    return r;
  })));
});