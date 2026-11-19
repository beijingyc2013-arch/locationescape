'use strict';
/* Locatiejacht – Leaflet + OpenStreetMap + Overpass, geen backend */

const $ = s => document.querySelector(s);
const LS_CFG = 'lj-config', LS_GAME = 'lj-game';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let cfg = Object.assign({
  n: 5, radius: 5, goodCode: '7391', badCode: '4826', tasks: '',
  extraQ: '', extraA: '', test: false, area: [], srcApi: true, srcMc: true, srcCode: true, srcPuz: true, level: 1
}, load(LS_CFG) || {});
if (cfg.ver === 4) { cfg.level = 3; cfg.ver = 5; save(LS_CFG, cfg); }                  // nieuw: standaard Extreem (echte denkpuzzels)
if (!cfg.ver || cfg.ver < 4) { cfg.srcPuz = true; cfg.srcApi = false; cfg.srcMc = false; cfg.srcCode = false; cfg.level = 3; cfg.ver = 5; save(LS_CFG, cfg); }   // nieuw: standaard alleen interactieve puzzels
if (cfg.ver < 6) { cfg.level = 1; cfg.srcApi = true; cfg.ver = 6; save(LS_CFG, cfg); }                // nieuw: standaard Makkelijk, ook quizvragen van internet
cfg.tasks = ''; cfg.extraQ = ''; cfg.extraA = ''; cfg.test = false;       // eigen opdrachten, extra vraag en testmodus zijn verwijderd
if (/^Hoeveel dagen heeft een schrikkeljaar/.test(cfg.tasks)) cfg.tasks = '';                    // oude standaardlijst weg
if (cfg.extraQ === 'De extra moeilijke opdracht wordt later ingevuld.') cfg.extraQ = '';
let prefetchTimer = null, prefetchTok = 0;   // voor prefetchArea (moet vóór de eerste renderArea bestaan)
let game = load(LS_GAME);          // actief spel of null
let me = null;                     // {lat,lng,acc}
let fakePos = false;

/* ---------- hulpfuncties ---------- */
const rad = d => d * Math.PI / 180;
function dist(a, b) {
  const R = 6371000, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
const ll = p => [p.lat, p.lng];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmtTime = ms => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const numOf = s => {                                  // "2.500", "2500" en "2,5" worden als getal herkend; codes met voorloopnul niet
  let t = String(s).trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  t = t.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) && !/^-?0\d/.test(t) ? parseFloat(t) : null;
};
const checkAnswer = (ans, key) => key.split('/').some(k => { const x = numOf(k), y = numOf(ans); return x !== null && y !== null ? x === y : norm(k) === norm(ans); });

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][1], yi = poly[i][0], xj = poly[j][1], yj = poly[j][0];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < (xj - xi) * (p.lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function areaStats(pts) {
  if (pts.length < 3) return { w: 0, h: 0, area: 0 };
  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length, lng0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const xy = pts.map(p => [(p[1] - lng0) * 111320 * Math.cos(rad(lat0)), (p[0] - lat0) * 110540]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const j = (i + 1) % xy.length; a += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1]; }
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), area: Math.abs(a / 2) };
}

/* ---------- kaart ---------- */
if (typeof L === 'undefined') {
  $('#map').innerHTML = '<p class="err">De kaart kon niet laden. Open de app één keer met internet, dan werkt hij daarna ook met een slechte verbinding.</p>';
  throw new Error('Leaflet ontbreekt');
}
const map = L.map('map', { zoomControl: false }).setView([52.0575, 4.4931], 8);
L.control.zoom({ position: 'topright' }).addTo(map);
const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, attribution: 'Tiles © Esri'
}).addTo(map);
const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, attribution: 'Tiles © Esri'
});
const osmTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
});
L.control.layers({ 'Straten': esriStreet, 'Satelliet': esriSat, 'OpenStreetMap (alleen via https)': osmTiles }, null, { position: 'topright' }).addTo(map);

const areaLayer = L.layerGroup().addTo(map);
const gameLayer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map);
const divIcon = (cls, s = 22) => L.divIcon({ className: '', html: `<div class="pin ${cls}"></div>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
let meMarker = null, meCircle = null, firstFix = true;

/* ---------- gebied tekenen ---------- */
function areaValid() {
  const s = areaStats(cfg.area);
  return cfg.area.length >= 3 && s.w >= 100 && s.h >= 100;
}
function renderArea() {
  areaLayer.clearLayers();
  const pts = cfg.area;
  if (pts.length >= 3) L.polygon(pts, { color: '#ff5b14', weight: 3, fillColor: '#ff5b14', fillOpacity: .12 }).addTo(areaLayer);
  else if (pts.length === 2) L.polyline(pts, { color: '#ff5b14', weight: 3 }).addTo(areaLayer);
  pts.forEach((p, i) => {
    const m = L.marker(p, { draggable: true, icon: divIcon('vertex', 16) }).addTo(areaLayer);
    m.on('dragend', () => { const q = m.getLatLng(); cfg.area[i] = [q.lat, q.lng]; save(LS_CFG, cfg); renderArea(); });
  });
  const s = areaStats(pts), info = $('#area-info');
  if (pts.length < 3) { info.textContent = pts.length ? `${pts.length} punt(en). Zet minstens 3 punten.` : 'Nog geen gebied.'; info.className = 'info'; }
  else if (!areaValid()) { info.textContent = `Gebied is ${Math.round(s.w)} × ${Math.round(s.h)} m: te klein, minimaal 100 × 100 m.`; info.className = 'info bad'; }
  else if (s.w > 3000 || s.h > 3000) { info.textContent = `${Math.round(s.w)} × ${Math.round(s.h)} m. Erg groot: kies liever kleiner dan 3 km.`; info.className = 'info bad'; }
  else { info.textContent = `Gebied: ${Math.round(s.w)} × ${Math.round(s.h)} m (${(s.area / 10000).toFixed(1)} ha).`; info.className = 'info ok'; }
  $('#btn-start').disabled = !(areaValid() && s.w <= 3000 && s.h <= 3000);
  prefetchArea();
}
map.on('click', e => {
  if (game) {
    if (cfg.test && game.phase === 'walk') setPosition({ lat: e.latlng.lat, lng: e.latlng.lng, acc: 3 }, true);
    return;
  }
  cfg.area.push([e.latlng.lat, e.latlng.lng]); save(LS_CFG, cfg); renderArea();
});
$('#btn-undo').onclick = () => { cfg.area.pop(); save(LS_CFG, cfg); renderArea(); };
$('#btn-clear').onclick = () => { cfg.area = []; save(LS_CFG, cfg); renderArea(); };
$('#btn-locate').onclick = () => { if (me) map.setView(ll(me), 18); };

/* ---------- instellingen ---------- */
function bindSettings() {
  $('#n').value = cfg.n; $('#n-val').textContent = cfg.n;
  $('#radius').value = cfg.radius;
  $('#srcPuz').checked = cfg.srcPuz; $('#srcApi').checked = cfg.srcApi; $('#srcMc').checked = cfg.srcMc; $('#srcCode').checked = cfg.srcCode; $('#level').value = String(cfg.level);
  const upd = () => {
    cfg.n = +$('#n').value; $('#n-val').textContent = cfg.n;
    cfg.radius = Math.max(2, +$('#radius').value || 5);
    cfg.srcPuz = $('#srcPuz').checked; cfg.srcApi = $('#srcApi').checked; cfg.srcMc = $('#srcMc').checked; cfg.srcCode = $('#srcCode').checked; cfg.level = +$('#level').value || 2;
    save(LS_CFG, cfg);
  };
  ['#n', '#radius', '#srcPuz', '#srcApi', '#srcMc', '#srcCode', '#level'].forEach(s => { $(s).addEventListener('input', upd); $(s).addEventListener('change', upd); });
}
const parseTasks = txt => txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.lastIndexOf('|'); return i < 0 ? { q: l, a: '' } : { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() };
});

/* ---------- locaties genereren (Overpass) ---------- */
/* Locaties liggen ALLEEN op echte wandelbare paden/straten uit OpenStreetMap, nooit op een willekeurig punt (dus niet in huizen of water). */
const waysCache = new Map();
const boundsOf = poly => {
  const lats = poly.map(p => p[0]), lngs = poly.map(p => p[1]);
  return { s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lngs), e: Math.max(...lngs) };
};
const buildQ = b => `[out:json][timeout:25];way["highway"~"^(footway|path|pedestrian|cycleway|living_street|residential|unclassified|track)$"]` +
  `["access"!~"^(private|no)$"]["foot"!~"^(no|private)$"]["indoor"!="yes"]["tunnel"!="yes"]["area"!="yes"]` +
  `["footway"!~"^(crossing|traffic_island)$"](${b.s},${b.w},${b.n},${b.e});out skel geom qt;`;
/* Overpass is soms traag of onbereikbaar. Daarom: (1) opgehaalde paden worden bewaard op dit toestel (IndexedDB), (2) we laden alvast op de
   achtergrond zodra je gebied klopt, (3) servers worden "gehedged": de volgende server start na 1,8 s of meteen bij een fout, de snelste wint. */
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('lj-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('ways'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('ways', mode), q = fn(t.objectStore('ways')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
  return { put: (k, v) => run('readwrite', s => s.put(v, k)).catch(() => {}), all: () => run('readonly', s => s.getAll()).catch(() => []) };
})();
const WAYS_TTL = 60 * 864e5;
async function cachedWays(b) {                       // een bewaard blok dat het hele gebied dekt (met kleine marge)
  const m = 0.0001, now = Date.now();
  const hit = (await idb.all()).filter(r => r && r.b && now - r.t < WAYS_TTL && r.b.s <= b.s + m && r.b.n >= b.n - m && r.b.w <= b.w + m && r.b.e >= b.e - m)
    .sort((x, y) => ((x.b.n - x.b.s) * (x.b.e - x.b.w)) - ((y.b.n - y.b.s) * (y.b.e - y.b.w)))[0];
  return hit ? hit.els : null;
}
let epStart = 0;
function fetchOne(b) {                               // één blok: servers gehedged, snelste antwoord wint
  const q = buildQ(b);
  const attempt = () => new Promise((resolve, reject) => {
    const order = OVERPASS.map((_, i) => (epStart + i) % OVERPASS.length), ctls = [], timers = [], started = [];
    let done = false, fails = 0, lastErr;
    const stop = () => { done = true; ctls.forEach(c => c.abort()); timers.forEach(clearTimeout); };
    const launch = k => {
      if (done || started[k]) return; started[k] = true;
      const idx = order[k], ctl = new AbortController(); ctls.push(ctl);
      const to = setTimeout(() => ctl.abort(), 12000); timers.push(to);
      fetch(OVERPASS[idx], { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctl.signal })
        .then(async r => {
          if (!r.ok) throw new Error('http ' + r.status);
          const j = await r.json(), els = j.elements || [];
          if (!els.length && j.remark && /error|timed out|memory/i.test(j.remark)) throw new Error('server druk');
          return els;
        })
        .then(els => { if (!done) { epStart = idx; stop(); resolve(els); } },
          e => { lastErr = e; if (done) return; fails++; if (fails >= OVERPASS.length) { stop(); reject(lastErr); } else launch(started.findIndex(v => !v)); });
    };
    order.forEach((_, k) => { if (k === 0) launch(0); else timers.push(setTimeout(() => launch(k), k * 1800)); });
  });
  return attempt().catch(() => new Promise(r => setTimeout(r, 800)).then(attempt));
}
const wayInflight = new Map();
function fetchWays(b) {
  const key = [b.s, b.w, b.n, b.e].map(v => v.toFixed(4)).join(',');
  if (waysCache.has(key)) return Promise.resolve(waysCache.get(key));
  if (wayInflight.has(key)) return wayInflight.get(key);
  const p = (async () => {
    const hit = await cachedWays(b);                 // eerder opgehaald? dan direct klaar
    if (hit) { waysCache.set(key, hit); return hit; }
    const dLat = (b.n - b.s) * 110540, dLng = (b.e - b.w) * 111320 * Math.cos(rad((b.s + b.n) / 2));
    const ny = Math.max(1, Math.ceil(dLat / 1000)), nx = Math.max(1, Math.ceil(dLng / 1000)), tiles = [];
    for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) tiles.push({
      s: b.s + (b.n - b.s) * i / ny, n: b.s + (b.n - b.s) * (i + 1) / ny, w: b.w + (b.e - b.w) * j / nx, e: b.w + (b.e - b.w) * (j + 1) / nx });
    const seen = new Map(); let next = 0;
    const worker = async () => { while (next < tiles.length) { const t = tiles[next++]; for (const el of await fetchOne(t)) seen.set(el.id, el); } };
    await Promise.all([worker(), worker(), worker()]);
    const els = [...seen.values()];
    waysCache.set(key, els); idb.put(key, { b, t: Date.now(), els });
    return els;
  })().finally(() => wayInflight.delete(key));
  wayInflight.set(key, p);
  return p;
}
function prefetchArea() {                            // alvast ophalen terwijl je nog instelt
  clearTimeout(prefetchTimer); const el = $('#prefetch'), tok = ++prefetchTok;
  if (!el) return;
  if (game || !areaValid()) { el.textContent = ''; return; }
  const poly = cfg.area.map(p => p.slice()), s = areaStats(poly);
  if (s.w > 3000 || s.h > 3000) { el.textContent = ''; return; }
  el.textContent = 'Wandelpaden worden alvast geladen…'; el.className = 'info';
  prefetchTimer = setTimeout(() => {
    fetchWays(boundsOf(poly)).then(() => { if (tok === prefetchTok) { el.textContent = '✓ Wandelpaden geladen: starten gaat direct.'; el.className = 'info ok'; } })
      .catch(() => { if (tok === prefetchTok) { el.textContent = 'Paden laden lukt nu niet; bij starten proberen we het opnieuw.'; el.className = 'info'; } });
  }, 700);
}
/* tweede bron: willekeurige punten laten "snappen" naar het dichtstbijzijnde wandelpad (OSM-routeplanner) */
async function snapCandidates(poly, need) {
  const b = boundsOf(poly), out = []; let tries = 0;
  const one = async () => {
    let p = null;
    for (let k = 0; k < 30 && !p; k++) { const c = { lat: b.s + Math.random() * (b.n - b.s), lng: b.w + Math.random() * (b.e - b.w) }; if (inPoly(c, poly)) p = c; }
    if (!p) return;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(`https://routing.openstreetmap.de/routed-foot/nearest/v1/foot/${p.lng},${p.lat}?number=1`, { signal: ctl.signal });
      const j = await r.json(), w = j.waypoints && j.waypoints[0];
      if (!w) return;
      const q = { lat: w.location[1], lng: w.location[0] };
      if (inPoly(q, poly) && dist(p, q) <= 80) out.push(q);
    } finally { clearTimeout(t); }
  };
  while (out.length < need && tries < need * 4) {
    const batch = []; for (let i = 0; i < 10; i++) { tries++; batch.push(one().catch(() => {})); }
    await Promise.all(batch);
  }
  return out;
}
function candidates(ways, poly) {
  const out = [];
  for (const w of ways) {
    const g = (w.geometry || []).map(p => ({ lat: p.lat, lng: p.lon }));
    for (let i = 0; i < g.length - 1; i++) {
      const steps = Math.max(1, Math.round(dist(g[i], g[i + 1]) / 10));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const p = { lat: g[i].lat + (g[i + 1].lat - g[i].lat) * t, lng: g[i].lng + (g[i + 1].lng - g[i].lng) * t };
        if (inPoly(p, poly)) out.push(p);
      }
    }
  }
  return out.length > 8000 ? shuffle(out).slice(0, 8000) : out;
}
/* kies `count` willekeurige punten met onderlinge afstand >= md (en ook >= md van `existing`) */
function pickSpread(cands, count, existing = [], mds = [60, 40, 25, 12, 5]) {
  const c = shuffle(cands);
  for (const md of mds) {
    const sel = [];
    for (const p of c) {
      if (existing.every(s => dist(s, p) >= md) && sel.every(s => dist(s, p) >= md)) { sel.push(p); if (sel.length === count) return sel; }
    }
  }
  return null;
}
function spreadSome(cands, count, existing, md) {   // zoveel mogelijk (tot count), mag minder zijn
  const sel = [];
  for (const p of shuffle(cands)) {
    if (existing.every(s => dist(s, p) >= md) && sel.every(s => dist(s, p) >= md)) { sel.push(p); if (sel.length === count) break; }
  }
  return sel;
}
let loadTick = null;
function loading(on, txt) {
  $('#loading').classList.toggle('hidden', !on); clearInterval(loadTick);
  if (on && txt) { const t0 = Date.now(), set = () => { const sec = Math.floor((Date.now() - t0) / 1000); $('#loading-text').textContent = txt + (sec >= 3 ? ` (${sec} s)` : ''); }; set(); loadTick = setInterval(set, 1000); }
  else if (txt) $('#loading-text').textContent = txt;
}

$('#btn-start').onclick = async () => {
  const msg = $('#setup-msg'); msg.textContent = ''; msg.className = 'info';
  const poly = cfg.area.map(p => p.slice()), n = cfg.n;
  loading(true, 'Wandelbare plekken zoeken…');
  let cands = null, why = '';
  try { cands = candidates(await fetchWays(boundsOf(poly)), poly); } catch (e) { why = (e && e.message) || ''; }
  if (!cands) {                                      // Overpass lukt niet: tweede bron
    loading(true, 'Andere bron proberen…');
    try { cands = await snapCandidates(poly, 2 * n + 10); } catch (e) { cands = []; }
    if (cands.length < 2 * n - 1) {
      loading(false);
      msg.textContent = 'Kon de wandelpaden niet ophalen' + (why ? ' (' + why + ')' : '') + '. De gratis kaartservers zijn soms druk of geblokkeerd: wacht even, controleer je internet (of VPN/adblocker) en probeer het opnieuw.'; msg.className = 'info bad';
      return;
    }
  }
  const picks = pickSpread(cands, 2 * n - 1);
  if (!picks) {
    loading(false);
    msg.textContent = 'Te weinig wandelbare plekken in dit gebied voor ' + n + ' locaties. Teken een groter gebied of kies minder locaties.'; msg.className = 'info bad';
    return;
  }
  game = {
    n, area: poly, trues: picks.slice(0, n), decoys: picks.slice(n), spares: spreadSome(cands, 40, picks, 30), rejected: [], skips: 0,
    route: [picks[0]], idx: 0, wrong: false, results: [], start: Date.now(), phase: 'walk', cur: null,
    extra: null, radius: cfg.radius, goodCode: cfg.goodCode, badCode: cfg.badCode, level: cfg.level,
    extraQ: cfg.extraQ, extraA: cfg.extraA
  };
  prevReal = null;
  save(LS_GAME, game);
  loading(false); enterGame();
};

/* ---------- opdrachten: oneindig, uit API's, meerkeuze en kraak-de-code-puzzels ---------- */
/* Moeilijkheid: 1 = Normaal, 2 = Moeilijk (standaard), 3 = Extreem. Staat per spel vast in game.level. */
const FALLBACK_WORDS = ['kaas', 'fiets', 'molen', 'tulp', 'dijk', 'klomp', 'haring', 'schaats', 'brug', 'kanaal', 'strand', 'duin', 'regenboog',
  'kasteel', 'vuurtoren', 'sneeuwman', 'paddenstoel', 'piraat', 'schatkist', 'kompas', 'raket', 'draak', 'bakker', 'ijsje', 'wolk', 'maan',
  'wortel', 'bliksem', 'zeilboot', 'kikker', 'vlinder', 'tractor', 'pinguin', 'ballon', 'trommel', 'konijn', 'sleutel', 'lantaarn', 'woestijn', 'ridder'];
const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const pick = a => a[Math.floor(Math.random() * a.length)];
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shiftText = (s, k) => s.replace(/[a-z]/g, c => ALPHA[(ALPHA.indexOf(c) + k + 26) % 26]);
const rev = s => [...s].reverse().join('');
const atbash = s => s.replace(/[a-z]/g, c => ALPHA[25 - ALPHA.indexOf(c)]);
const lvl = () => (game && game.level) || cfg.level || 2;
try { localStorage.removeItem('lj-trivia'); localStorage.removeItem('lj-countries'); } catch (e) {}   // oude, onvertaalde/verouderde gegevens weg
const pools = { words: [], trivia: load('lj-trivia-nl') || [], countries: load('lj-countries2') || [] };
let triviaBusy = false, triviaAt = 0;

async function fetchJSON(url, ms = 6000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('http'); return await r.json(); }
  finally { clearTimeout(t); }
}

/* ---------- vertaler: alles automatisch naar het Nederlands ---------- */
/* Eerst Google Translate (gratis, geen sleutel), bij een storing MyMemory. */
const htmlDec = t => { const e = document.createElement('textarea'); e.innerHTML = t; return e.value; };
async function trGoogle(text) {
  const d = await fetchJSON('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=nl&dt=t&q=' + encodeURIComponent(text), 8000);
  const out = d[0].map(x => x[0]).join('');
  if (!out.trim()) throw new Error('leeg');
  return htmlDec(out);
}
async function trMyMemory(text) {
  if (text.length > 480) throw new Error('te lang');
  const d = await fetchJSON('https://api.mymemory.translated.net/get?langpair=Autodetect|nl&q=' + encodeURIComponent(text), 8000);
  const out = d && d.responseData && d.responseData.translatedText;
  if (!out || /MYMEMORY WARNING|INVALID/i.test(out)) throw new Error('mymemory');
  return htmlDec(out);
}
async function translateText(text) {
  try { return await trGoogle(text); } catch (e) { return await trMyMemory(text); }
}
async function translateLines(lines) {              // één verzoek voor alle regels; lukt dat niet, dan regel voor regel
  try {
    const parts = (await translateText(lines.join('\n'))).trim().split(/\s*\n+\s*/);
    if (parts.length === lines.length) return parts.map(x => x.trim());
  } catch (e) {}
  return Promise.all(lines.map(translateText));
}
async function translateTrivia(r) {                  // vraag + goed antwoord + foute antwoorden, allemaal naar het Nederlands
  const lines = [r.question, r.correct_answer, ...r.incorrect_answers].map(x => decodeURIComponent(x).replace(/\s*\n+\s*/g, ' '));
  const nl = await translateLines(lines);
  if (nl.length !== lines.length || nl.some(x => !x || !x.trim())) return null;
  const [q, a, ...wrong] = nl, options = [a, ...wrong];
  if (new Set(options.map(norm)).size !== options.length) return null;      // twee gelijke opties na vertalen: sla over
  return { q, a, label: 'Quizvraag', diff: decodeURIComponent(r.difficulty || ''), options: shuffle(options) };
}


/* Open Trivia DB (Engels) -> vertaald -> pool. Moeilijkheid bepaalt welke vragen worden opgehaald. */
const diffOk = t => { const L = lvl(); return L <= 1 || (L === 2 ? t.diff !== 'easy' : t.diff === 'hard'); };
async function refillTrivia() {
  if (triviaBusy || pools.trivia.filter(diffOk).length >= 12 || Date.now() - triviaAt < 6000) return;
  triviaBusy = true; triviaAt = Date.now();
  const L = lvl(), diff = L <= 1 ? '' : L >= 3 ? '&difficulty=hard' : (Math.random() < .5 ? '&difficulty=medium' : '&difficulty=hard');
  try {
    const d = await fetchJSON('https://opentdb.com/api.php?amount=20&type=multiple&encode=url3986' + diff);
    if (d.response_code === 0) {
      const todo = d.results.slice();
      const worker = async () => {                   // 3 tegelijk, elke vraag direct opslaan zodra hij klaar is
        while (todo.length) {
          try {
            const t = await translateTrivia(todo.shift());
            if (t) { pools.trivia.push(t); pools.trivia = pools.trivia.slice(-60); save('lj-trivia-nl', pools.trivia); }
          } catch (e) { /* vertalen mislukt: deze vraag overslaan, nooit Engels tonen */ }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }
  } catch (e) { /* offline: andere bronnen */ } finally { triviaBusy = false; }
}

/* ---- landen (REST Countries, Nederlandse namen) ---- */
const REG = { Africa: 'Afrika', Americas: 'Amerika', Asia: 'Azië', Europe: 'Europa', Oceania: 'Oceanië', Antarctic: 'Antarctica' };
const GREY_REG = ['Rusland', 'Turkije', 'Cyprus', 'Georgië', 'Armenië', 'Azerbeidzjan', 'Kazachstan'];   // liggen op twee werelddelen
async function loadCountries() {
  if (pools.countries.length) return;
  try {
    const d = await fetchJSON('https://restcountries.com/v3.1/all?fields=name,capital,translations,flag,population,area,region', 10000);
    pools.countries = d.filter(c => c.capital && c.capital[0] && c.translations && c.translations.nld && c.population > 0 && c.area > 0 && REG[c.region])
      .map(c => ({ nl: c.translations.nld.common, cap: c.capital[0], flag: c.flag, pop: c.population, area: c.area, reg: c.region }));
    save('lj-countries2', pools.countries);
  } catch (e) {}
}
async function loadWords() {                         // woorden voor de code-puzzels
  try {
    const d = await fetchJSON('https://random-word-api.herokuapp.com/word?lang=nl&number=40');
    pools.words = d.filter(w => /^[a-z]{4,9}$/.test(w));
  } catch (e) {}
}
function warmTasks() { refillTrivia(); loadCountries(); loadWords(); }
function getWord(max = 9, min = 4) {
  if (pools.words.length < 4) loadWords();
  const i = pools.words.findIndex(w => w.length <= max && w.length >= min);
  if (i >= 0) return pools.words.splice(i, 1)[0];
  const f = FALLBACK_WORDS.filter(w => w.length <= max && w.length >= min);
  return pick(f.length ? f : FALLBACK_WORDS);
}

/* ---- meerkeuze helper ---- */
function mc(q, a, wrong, label = 'Meerkeuze', extra = {}) {
  a = String(a);
  const w = [...new Set(wrong.map(String))].filter(x => x !== a).slice(0, 3);
  if (w.length < 3) return null;
  return Object.assign({ label, q, a, options: shuffle([a, ...w]) }, extra);
}
function nearNums(a) {                                // 3 geloofwaardige foute getallen
  const c = new Set(), ds = [1, 2, 3, 5, 10, 11, 9, 20], dd = a >= 100 ? [10, 20, 100, 30] : ds;
  let guard = 0;
  while (c.size < 3 && guard++ < 200) { const v = a + pick(dd) * (Math.random() < .5 ? 1 : -1); if (v !== a && v >= 0) c.add(v); }
  for (let k = 1; c.size < 3; k++) c.add(a + 100 + k);
  return [...c];
}

/* ---- aardrijkskunde uit de landen-API ---- */
function rankTask(key, most, least, L) {
  for (let t = 0; t < 40; t++) {
    const four = shuffle(pools.countries).slice(0, 4), big = Math.random() < .5;
    const s = four.slice().sort((x, y) => big ? y[key] - x[key] : x[key] - y[key]);
    const ratio = Math.max(s[0][key], s[1][key]) / Math.min(s[0][key], s[1][key]);
    if (ratio >= (L >= 3 ? 1.1 : 1.3)) return mc(big ? most : least, s[0].nl, s.slice(1).map(x => x.nl), 'Aardrijkskunde');
  }
  return null;
}
function countryTask(L) {
  const C = pools.countries, c = pick(C);
  const others = (same, n = 3) => { const pool = C.filter(x => x.nl !== c.nl && x.cap !== c.cap); const s = same ? pool.filter(x => x.reg === c.reg) : []; return shuffle(s.length >= n ? s : pool).slice(0, n); };
  const kinds = L <= 1 ? ['cap', 'flag'] : L === 2 ? ['cap', 'pop', 'area', 'reg', 'capRev'] : ['cap', 'capRev', 'pop', 'area', 'pop', 'area'];
  const kind = pick(kinds);
  if (kind === 'flag' && c.flag) return mc('Bij welk land hoort deze vlag?', c.nl, others(false).map(o => o.nl), 'Aardrijkskunde', { box: c.flag });
  if (kind === 'capRev') return mc(`${c.cap} is de hoofdstad van welk land?`, c.nl, others(true).map(o => o.nl), 'Aardrijkskunde');
  if (kind === 'pop') return rankTask('pop', 'Welk van deze landen heeft de meeste inwoners?', 'Welk van deze landen heeft de minste inwoners?', L);
  if (kind === 'area') return rankTask('area', 'Welk van deze landen heeft de grootste oppervlakte?', 'Welk van deze landen heeft de kleinste oppervlakte?', L);
  if (kind === 'reg' && !GREY_REG.includes(c.nl)) return mc(`In welk werelddeel ligt ${c.nl}?`, REG[c.reg], Object.values(REG).filter(r => r !== REG[c.reg] && r !== 'Antarctica'), 'Aardrijkskunde');
  return mc(`Wat is de hoofdstad van ${c.nl}?`, c.cap, others(L >= 2).map(o => o.cap), 'Aardrijkskunde');
}
function apiTask() {
  const L = lvl(), ready = pools.trivia.filter(diffOk), opts = [];
  if (ready.length) opts.push('t', 't');             // trivia vaker dan landen
  if (pools.countries.length >= 20) opts.push('c');
  if (!opts.length) return null;
  if (pick(opts) === 't') {
    const t = pick(ready); pools.trivia.splice(pools.trivia.indexOf(t), 1); save('lj-trivia-nl', pools.trivia); return t;
  }
  return countryTask(L);
}

/* ---- Nederlandse meerkeuzevragen: eigen bank (werkt offline) + oneindig veel gegenereerde sommen ---- */
const MC_BANK = [
  ['Aardrijkskunde', 'Wat is de hoofdstad van de provincie Friesland?', 'Leeuwarden', 'Groningen', 'Assen', 'Zwolle'],
  ['Aardrijkskunde', 'Welke van deze rivieren is in totaal het langst?', 'Rijn', 'Maas', 'IJssel', 'Schelde'],
  ['Aardrijkskunde', 'Wat is het hoogste punt van het vasteland van Nederland?', 'Vaalserberg', 'Posbank', 'Sint-Pietersberg', 'Utrechtse Heuvelrug'],
  ['Aardrijkskunde', 'Hoeveel provincies heeft Nederland?', '12', '10', '11', '14'],
  ['Aardrijkskunde', 'Welk Waddeneiland heeft de grootste oppervlakte?', 'Texel', 'Terschelling', 'Ameland', 'Vlieland'],
  ['Aardrijkskunde', 'Wat is de hoofdstad van Zeeland?', 'Middelburg', 'Vlissingen', 'Goes', 'Terneuzen'],
  ['Aardrijkskunde', 'In welke provincie ligt de stad Zwolle?', 'Overijssel', 'Gelderland', 'Drenthe', 'Flevoland'],
  ['Aardrijkskunde', 'Welk van deze landen grenst aan Nederland?', 'België', 'Frankrijk', 'Luxemburg', 'Denemarken'],
  ['Aardrijkskunde', 'Wat is de hoofdstad van Canada?', 'Ottawa', 'Toronto', 'Montréal', 'Vancouver'],
  ['Aardrijkskunde', 'Wat is de hoofdstad van Australië?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
  ['Aardrijkskunde', 'Wat is de hoofdstad van Turkije?', 'Ankara', 'Istanbul', 'Izmir', 'Antalya'],
  ['Aardrijkskunde', 'Wat is de hoofdstad van Zwitserland?', 'Bern', 'Zürich', 'Genève', 'Bazel'],
  ['Aardrijkskunde', 'Wat is de hoofdstad van Brazilië?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Salvador'],
  ['Aardrijkskunde', 'Wat is de hoofdstad van Nieuw-Zeeland?', 'Wellington', 'Auckland', 'Christchurch', 'Queenstown'],
  ['Aardrijkskunde', 'Welk gebergte is op het land het langst ter wereld?', 'Andes', 'Himalaya', 'Rocky Mountains', 'Alpen'],
  ['Aardrijkskunde', 'Hoe heet de hoogste waterval ter wereld?', 'Angelwaterval', 'Niagarawaterval', 'Victoriawaterval', 'Iguaçuwaterval'],
  ['Aardrijkskunde', 'Welke rivier is de langste van Europa?', 'Wolga', 'Donau', 'Rijn', 'Dnjepr'],
  ['Aardrijkskunde', 'Welk meer is het diepste ter wereld?', 'Baikalmeer', 'Tanganyikameer', 'Victoriameer', 'Bovenmeer'],
  ['Aardrijkskunde', 'In welk land ligt de stad Timboektoe?', 'Mali', 'Niger', 'Tsjaad', 'Soedan'],
  ['Geschiedenis', 'In welk jaar begon de Tachtigjarige Oorlog?', '1568', '1548', '1588', '1618'],
  ['Geschiedenis', 'Wie wordt "Vader des Vaderlands" genoemd?', 'Willem van Oranje', 'Maurits van Nassau', 'Johan de Witt', 'Michiel de Ruyter'],
  ['Geschiedenis', 'In welk jaar kreeg Nederland onder Thorbecke zijn moderne grondwet?', '1848', '1815', '1795', '1917'],
  ['Geschiedenis', 'Op welke datum vieren we Bevrijdingsdag?', '5 mei', '4 mei', '8 mei', '15 mei'],
  ['Geschiedenis', 'In welk jaar viel de Berlijnse Muur?', '1989', '1961', '1991', '1985'],
  ['Geschiedenis', 'Waar stond de afkorting VOC voor?', 'Verenigde Oostindische Compagnie', 'Vereniging van Overzeese Colonies', 'Verenigde Orde van Commerce', 'Volks Overzeese Compagnie'],
  ['Geschiedenis', 'In welk jaar zette Neil Armstrong als eerste mens voet op de maan?', '1969', '1965', '1971', '1973'],
  ['Geschiedenis', 'Welke stad werd in het jaar 79 door de uitbarsting van de Vesuvius begraven?', 'Pompeii', 'Rome', 'Napels', 'Athene'],
  ['Geschiedenis', 'Wie was de eerste koning van het Koninkrijk der Nederlanden (1815)?', 'Willem I', 'Willem II', 'Willem III', 'Willem-Alexander'],
  ['Geschiedenis', 'In welk jaar werd Nederland bezet door nazi-Duitsland?', '1940', '1939', '1942', '1944'],
  ['Geschiedenis', 'In welk jaar begon de Franse Revolutie?', '1789', '1776', '1804', '1815'],
  ['Geschiedenis', 'In welk jaar werden de eerste euromunten en -biljetten in Nederland gebruikt?', '2002', '1999', '2001', '2004'],
  ['Natuur en wetenschap', 'Hoeveel botten heeft een volwassen mens?', '206', '186', '226', '256'],
  ['Natuur en wetenschap', 'Welk gas vormt het grootste deel van de aardatmosfeer?', 'Stikstof', 'Zuurstof', 'Koolstofdioxide', 'Argon'],
  ['Natuur en wetenschap', 'Wat is de chemische formule van keukenzout?', 'NaCl', 'KCl', 'NaOH', 'CaCO3'],
  ['Natuur en wetenschap', 'Welke planeet staat het dichtst bij de zon?', 'Mercurius', 'Venus', 'Mars', 'Aarde'],
  ['Natuur en wetenschap', 'Wat is het hardste natuurlijke materiaal?', 'Diamant', 'Kwarts', 'Staal', 'Graniet'],
  ['Natuur en wetenschap', 'Welk orgaan maakt insuline aan?', 'Alvleesklier', 'Lever', 'Nieren', 'Milt'],
  ['Natuur en wetenschap', 'Hoeveel chromosomen heeft een mens normaal in elke lichaamscel?', '46', '44', '48', '42'],
  ['Natuur en wetenschap', 'Welk landdier is het snelst?', 'Jachtluipaard', 'Leeuw', 'Antilope', 'Paard'],
  ['Natuur en wetenschap', 'Hoe snel gaat licht ongeveer in vacuüm?', '300.000 km/s', '30.000 km/s', '3.000.000 km/s', '150.000 km/s'],
  ['Natuur en wetenschap', 'Welke vitamine maakt je lichaam aan met behulp van zonlicht?', 'Vitamine D', 'Vitamine A', 'Vitamine C', 'Vitamine B12'],
  ['Natuur en wetenschap', 'Hoeveel poten heeft een spin?', '8', '6', '10', '12'],
  ['Natuur en wetenschap', 'Wat is de grootste planeet van ons zonnestelsel?', 'Jupiter', 'Saturnus', 'Neptunus', 'Uranus'],
  ['Natuur en wetenschap', 'Welk element heeft het symbool Fe?', 'IJzer', 'Fluor', 'Fosfor', 'Francium'],
  ['Natuur en wetenschap', 'Welke bloedcellen vervoeren zuurstof?', 'Rode bloedcellen', 'Witte bloedcellen', 'Bloedplaatjes', 'Bloedplasma'],
  ['Natuur en wetenschap', 'Welke ster staat het dichtst bij de zon?', 'Proxima Centauri', 'Sirius', 'Betelgeuze', 'Vega'],
  ['Natuur en wetenschap', 'Wat is het grootste orgaan van het menselijk lichaam?', 'De huid', 'De lever', 'De longen', 'De dunne darm'],
  ['Natuur en wetenschap', 'Hoe heet het proces waarbij planten licht omzetten in energie?', 'Fotosynthese', 'Respiratie', 'Fermentatie', 'Osmose'],
  ['Natuur en wetenschap', 'Hoeveel kamers heeft het menselijk hart?', '4', '2', '3', '6'],
  ['Natuur en wetenschap', 'Wat is het zwaarste dier ter wereld?', 'Blauwe vinvis', 'Afrikaanse olifant', 'Potvis', 'Walvishaai'],
  ['Natuur en wetenschap', 'Welk metaal is bij kamertemperatuur vloeibaar?', 'Kwik', 'Lood', 'Tin', 'Zink'],
  ['Natuur en wetenschap', 'Wat is de eenheid van elektrische weerstand?', 'Ohm', 'Watt', 'Volt', 'Ampère'],
  ['Natuur en wetenschap', 'Wat is de eenheid van kracht?', 'Newton', 'Joule', 'Pascal', 'Watt'],
  ['Natuur en wetenschap', 'Welke deeltjes in een atoom hebben een negatieve lading?', 'Elektronen', 'Protonen', 'Neutronen', 'Kernen'],
  ['Taal', 'Wat is het voltooid deelwoord van "fietsen"?', 'gefietst', 'gefietsd', 'gefiets', 'gefietsed'],
  ['Taal', 'Wat is het voltooid deelwoord van "verhuizen"?', 'verhuisd', 'verhuist', 'verhuizd', 'verhuizt'],
  ['Taal', 'Wat is het meervoud van "lied"?', 'liederen', 'lieden', 'liedes', 'lieds'],
  ['Taal', 'Wat betekent de uitdrukking "iets op de lange baan schuiven"?', 'Het uitstellen', 'Het sneller doen', 'Het weggooien', 'Het eerlijk verdelen'],
  ['Taal', 'Wat betekent de uitdrukking "met de deur in huis vallen"?', 'Zonder inleiding meteen ter zake komen', 'Onverwacht op bezoek komen', 'Een deur kapotmaken', 'Je huis verlaten'],
  ['Taal', 'Wat betekent de uitdrukking "een appeltje te schillen hebben"?', 'Nog een conflict met iemand uit te praten hebben', 'Een makkelijke klus hebben', 'Honger hebben', 'Fruit willen eten'],
  ['Taal', 'Wat betekent de uitdrukking "de kat uit de boom kijken"?', 'Eerst afwachten hoe iets loopt', 'Een dier redden', 'Snel ingrijpen', 'Op de uitkijk staan'],
  ['Cultuur en sport', 'Wie schilderde "De Aardappeleters"?', 'Vincent van Gogh', 'Piet Mondriaan', 'Johannes Vermeer', 'Jan Steen'],
  ['Cultuur en sport', 'Wie schilderde "Meisje met de parel"?', 'Johannes Vermeer', 'Rembrandt', 'Frans Hals', 'Jan Steen'],
  ['Cultuur en sport', 'Welke componist schreef "De vier jaargetijden"?', 'Vivaldi', 'Bach', 'Mozart', 'Beethoven'],
  ['Cultuur en sport', 'Wie schreef "Max Havelaar"?', 'Multatuli', 'Louis Couperus', 'Harry Mulisch', 'Hugo Claus'],
  ['Cultuur en sport', 'Wie schreef "De Avonden"?', 'Gerard Reve', 'Harry Mulisch', 'Willem Frederik Hermans', 'Jan Wolkers'],
  ['Cultuur en sport', 'Hoeveel snaren heeft een standaard viool?', '4', '3', '5', '6'],
  ['Cultuur en sport', 'Hoeveel spelers van één team staan er tegelijk op het veld bij volleybal?', '6', '5', '7', '8'],
  ['Cultuur en sport', 'Hoeveel toetsen heeft een standaardpiano?', '88', '76', '92', '100'],
  ['Cultuur en sport', 'Welk land won het WK voetbal in 2010?', 'Spanje', 'Nederland', 'Duitsland', 'Argentinië'],
  ['Cultuur en sport', 'Welk Nederlands team won in 1970 de Europacup I?', 'Feyenoord', 'Ajax', 'PSV', 'AZ'],
  ['Cultuur en sport', 'Hoe lang is een marathon?', '42,195 km', '40 km', '45 km', '50 km']
];
function bankTask() {
  let bag = load('lj-mc-bag');
  if (!Array.isArray(bag) || !bag.length) bag = shuffle(MC_BANK.map((_, i) => i));
  const i = bag.shift(); save('lj-mc-bag', bag);
  const b = MC_BANK[i];
  return b ? mc(b[1], b[2], b.slice(3), b[0]) : null;
}
const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199];
const UNITS = [['km', 'meter', 1000, [1, 2, 3, 4, 5, 6, 7, 8, 9]], ['uur', 'minuten', 60, [1.5, 2.5, 3, 4, 5.5, 7]], ['kg', 'gram', 1000, [1.5, 2, 2.5, 3, 4.5, 6]],
  ['liter', 'milliliter', 1000, [0.5, 1.5, 2.5, 3, 7]], ['dag', 'uur', 24, [2, 3, 4, 5, 6, 7]], ['meter', 'centimeter', 100, [1.5, 2.5, 3, 4.5, 6, 12]]];
function mcMath(L) {
  const t = ri(0, 4), fmt = x => String(x).replace('.', ',');
  if (t === 0) {
    const [x, y] = L <= 1 ? [ri(6, 14), ri(6, 12)] : L === 2 ? [ri(12, 29), ri(4, 12)] : [ri(23, 49), ri(12, 29)], a = x * y;
    return mc(`Hoeveel is ${x} × ${y}?`, a, nearNums(a), 'Rekenen');
  }
  if (t === 1) {
    const p = pick(L <= 1 ? [10, 25, 50] : [5, 15, 20, 30, 40, 60, 75]), base = ri(2, 40) * 20, a = p * base / 100;
    return mc(`Hoeveel is ${p}% van ${base}?`, a, nearNums(a), 'Rekenen');
  }
  if (t === 2) {
    const x = L <= 1 ? ri(5, 15) : L === 2 ? ri(12, 25) : ri(21, 40), a = x * x;
    return mc(`Hoeveel is ${x}² (${x} × ${x})?`, a, nearNums(a), 'Rekenen');
  }
  if (t === 3) {
    const comps = L <= 1 ? [21, 27, 33, 35, 39, 45, 51, 55, 57, 63] : [49, 77, 91, 119, 121, 133, 143, 169, 187, 209, 221, 247];
    const primes = L <= 1 ? PRIMES.slice(0, 9) : PRIMES, a = pick(primes);
    return mc('Welk van deze getallen is een priemgetal?', a, shuffle(comps).slice(0, 3), 'Rekenen');
  }
  const [from, to, f, vals] = pick(UNITS), x = pick(vals), a = Math.round(x * f);
  return mc(`Hoeveel ${to} is ${fmt(x)} ${from}?`, a, nearNums(a), 'Eenheden');
}
function mcTask() {
  const L = lvl(), first = Math.random() < .6;
  return (first ? bankTask() : mcMath(L)) || (first ? mcMath(L) : bankTask());
}

/* ---- kraak-de-code-puzzels ---- */
const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
  n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..' };
const VKEYS = ['kaas', 'maan', 'boom', 'roos', 'zon', 'vis', 'wolk', 'tulp', 'dijk', 'bos'];

function genCaesar(hard) {
  const k = ri(2, hard ? 12 : 5), w1 = getWord(), w2 = hard ? getWord() : '';
  const w = hard ? w1 + ' ' + w2 : w1;
  return {
    label: 'Kraak de code', box: shiftText(w, k).toUpperCase(), a: hard ? `${w1} ${w2}/${w1}${w2}` : w1,
    q: `Een geheime boodschap! Elke letter is ${k} plaatsen vooruit geschoven in het alfabet (bij 1 wordt A een B). Schuif terug en ontcijfer ${hard ? 'de twee woorden' : 'het woord'}.`
  };
}
function genA1Z26() {
  const w = getWord();
  return { label: 'Kraak de code', box: [...w].map(c => ALPHA.indexOf(c) + 1).join('-'), a: w, q: 'Elk getal is een letter (1 = A, 2 = B, … 26 = Z). Welk woord staat hier?' };
}
function genReverse() {
  const w = getWord();
  return { label: 'Kraak de code', box: rev(w).toUpperCase(), a: w, q: 'Dit woord is achterstevoren geschreven. Welk woord is het?' };
}
function genDouble() {
  const k = ri(2, 9), w = getWord();
  return {
    label: 'Kraak de code', box: rev(shiftText(w, k)).toUpperCase(), a: w,
    q: `Dubbele code! Stap 1: lees het achterstevoren. Stap 2: schuif elke letter ${k} plaatsen terug in het alfabet (bij 1 wordt B een A).`
  };
}
function genTriple() {
  const k = ri(2, 9), w = getWord(8, 4);
  return {
    label: 'Kraak de code', box: rev(shiftText(atbash(w), k)).toUpperCase(), a: w, boxCls: 'mono',
    q: `Driedubbele code! Stap 1: lees het achterstevoren. Stap 2: schuif elke letter ${k} plaatsen terug in het alfabet (bij 1 wordt B een A). Stap 3: spiegel het alfabet (A wordt Z, B wordt Y, C wordt X, …).`
  };
}
function genAtbash() {
  const w = getWord(8, 4);
  return { label: 'Kraak de code', box: atbash(w).toUpperCase(), a: w, boxCls: 'mono', q: 'Spiegelcode! Het alfabet is omgekeerd: A wordt Z, B wordt Y, C wordt X, enzovoort. Welk woord staat hier?' };
}
function genMorse() {
  const w = getWord(6, 4);
  return { label: 'Morsecode', box: [...w].map(c => MORSE[c]).join('  '), a: w, boxCls: 'mono',
    q: 'Een morsebericht! Een punt is kort, een streep is lang. Letters staan gescheiden door spaties. Welk woord is het?' };
}
function genVigenere(hard) {
  const key = pick(VKEYS), w = getWord(hard ? 8 : 6, 4);
  const enc = [...w].map((c, i) => ALPHA[(ALPHA.indexOf(c) + ALPHA.indexOf(key[i % key.length])) % 26]).join('');
  return { label: 'Kraak de code', box: enc.toUpperCase(), a: w, boxCls: 'mono',
    q: `Vigenère-code! Het sleutelwoord is ${key.toUpperCase()} en herhaalt zich onder de boodschap. Elke sleutelletter zegt hoeveel plaatsen je de letter erboven terugschuift (A = 0, B = 1, C = 2, … Z = 25). Voorbeeld: staat er een P boven een C (2 plaatsen), dan wordt het een N.` };
}
function genBinary() {
  const n = ri(20, 255);
  return { label: 'Binair', num: true, box: n.toString(2), a: String(n), q: 'Dit getal is binair geschreven (alleen nullen en enen). Welk gewoon getal is dit?' };
}
function genHex() {
  const n = ri(256, 4095);
  return { label: 'Hexadecimaal', num: true, box: n.toString(16).toUpperCase(), a: String(n),
    q: 'Dit getal is hexadecimaal geschreven (16 cijfers: 0-9 en A = 10, B = 11, C = 12, D = 13, E = 14, F = 15). Welk gewoon getal is dit?' };
}
function genWordSum() {
  const w = getWord(6, 4), s = [...w].reduce((t, c) => t + ALPHA.indexOf(c) + 1, 0);
  return { label: 'Letterwaarde', num: true, box: w.toUpperCase(), a: String(s), q: 'Tel de waarde van alle letters op (A = 1, B = 2, … Z = 26). Wat is de som van dit woord?' };
}
function genMagic() {
  const base = [[2, 7, 6], [9, 5, 1], [4, 3, 8]], m = ri(1, 3), o = ri(0, 12), g = base.map(r => r.map(v => v * m + o));
  const r1 = ri(0, 2), c1 = ri(0, 2); let r2, c2;
  do { r2 = ri(0, 2); } while (r2 === r1);
  do { c2 = ri(0, 2); } while (c2 === c1);
  const rows = g.map((r, i) => r.map((v, j) => ((i === r1 && j === c1) || (i === r2 && j === c2)) ? '?' : String(v)).map(x => x.padStart(3)).join(' '));
  return { label: 'Magisch vierkant', num: true, a: String(g[r1][c1] + g[r2][c2]), box: rows.join('\n'), boxCls: 'grid',
    q: 'Magisch vierkant: elke rij, elke kolom en beide diagonalen hebben dezelfde som. Wat is de som van de twee ontbrekende getallen (?) samen?' };
}
function genLock(len) {
  const d = PZ.lockData(len);
  if (!d) return genCaesar(true);
  return { label: 'Kraak het slot', num: true, a: d.secret, q: `Het slot heeft een code van ${len} verschillende cijfers. Elk cijfer komt maar één keer voor.\n\n${d.clues.map(PZ.clueText).join('\n')}\n\nWat is de code?` };
}
const SMALLPRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
function genSeq(L) {
  const i5 = [0, 1, 2, 3, 4]; let s, a;
  if (L <= 1) {
    const t = ri(0, 3);
    if (t === 0) { const st = ri(2, 9), d = ri(2, 9); s = i5.map(i => st + d * i); a = st + d * 5; }
    else if (t === 1) { const st = ri(1, 4), r = ri(2, 3); s = i5.map(i => st * r ** i); a = st * r ** 5; }
    else if (t === 2) { const d = ri(1, 3); let v = ri(1, 9), inc = d; s = []; for (let i = 0; i < 5; i++) { s.push(v); v += inc; inc += d; } a = v; }
    else { const o = ri(1, 5); s = i5.map(i => (i + 1 + o) ** 2); a = (6 + o) ** 2; }
  } else {
    const kind = pick(L === 2 ? ['fib', 'cube', 'prime', 'inter', 'tri'] : ['inter', 'dbl', 'fib', 'mulplus', 'inter']);
    if (kind === 'fib') { const t = [ri(1, 6), ri(1, 6)]; for (let i = 2; i < 7; i++) t.push(t[i - 1] + t[i - 2]); s = t.slice(0, 6); a = t[6]; }
    else if (kind === 'cube') { const o = ri(1, 3); s = i5.map(i => (i + o) ** 3); a = (5 + o) ** 3; }
    else if (kind === 'prime') { const st = ri(0, 6); s = SMALLPRIMES.slice(st, st + 6); a = SMALLPRIMES[st + 6]; }
    else if (kind === 'tri') { const o = ri(1, 4); s = i5.map(i => (i + o) * (i + o + 1)); a = (5 + o) * (6 + o); }
    else if (kind === 'inter') {                       // twee reeksen om en om
      const a0 = ri(1, 9), b0 = ri(20, 40), d1 = ri(2, 6), d2 = ri(2, 6) * (Math.random() < .5 ? 1 : -1);
      s = [a0, b0, a0 + d1, b0 + d2, a0 + 2 * d1, b0 + 2 * d2]; a = a0 + 3 * d1;
    }
    else if (kind === 'dbl') { const v = ri(1, 6); s = [0, 1, 2, 3, 4, 5].map(i => v + 2 ** i - 1); a = v + 2 ** 6 - 1; }
    else { const c = ri(1, 4); let v = ri(1, 4); const t = [v]; for (let i = 0; i < 5; i++) { v = 2 * v + c; t.push(v); } s = t.slice(0, 5); a = t[5]; }
  }
  return { label: 'Getallenreeks', num: true, a: String(a), box: s.join(', ') + ', ?', q: 'Welk getal komt hierna?' };
}
function genMath(L) {
  if (L <= 1) {
    const t = ri(0, 2); let q, a;
    if (t === 0) { const x = ri(6, 15), y = ri(6, 12); q = `${x} × ${y}`; a = x * y; }
    else if (t === 1) { const x = ri(40, 99), y = ri(20, 80), z = ri(5, 30); q = `${x} + ${y} − ${z}`; a = x + y - z; }
    else { const x = ri(3, 9), y = ri(3, 9), z = ri(2, 9); q = `(${x} + ${y}) × ${z}`; a = (x + y) * z; }
    return { label: 'Rekenen', num: true, a: String(a), q: `Hoeveel is ${q}?` };
  }
  const kind = pick(L === 2 ? ['pct', 'eq', 'multi', 'avg', 'speed', 'pyth'] : ['eq2', 'sum', 'big', 'pyth', 'avg', 'pct2', 'speed']);
  let q, a;
  if (kind === 'pct') { const p = pick([10, 15, 20, 25, 30, 40, 60, 75]), b = ri(3, 40) * 20; q = `Hoeveel is ${p}% van ${b}?`; a = p * b / 100; }
  else if (kind === 'pct2') { const b = 25 * ri(4, 40); q = `Een jas kost € ${b}. Eerst gaat er 20% af en daarna nog eens 10% van het nieuwe bedrag. Hoeveel euro kost de jas nu?`; a = b * 72 / 100; }
  else if (kind === 'eq') { const x = ri(3, 15), m = ri(2, 9), b = ri(3, 40); q = `Los op: ${m}x + ${b} = ${m * x + b}. Hoeveel is x?`; a = x; }
  else if (kind === 'eq2') { let x = ri(3, 15), m = ri(4, 9), c = ri(2, m - 1), b = ri(3, 30); q = `Los op: ${m}x + ${b} = ${c}x + ${(m - c) * x + b}. Hoeveel is x?`; a = x; }
  else if (kind === 'multi') { const x = ri(3, 12), y = ri(3, 12), z = ri(2, 9), w = ri(2, Math.min(20, (x + y) * z - 1)); q = `(${x} + ${y}) × ${z} − ${w}`; a = (x + y) * z - w; q = `Hoeveel is ${q}?`; }
  else if (kind === 'avg') {
    const n = L === 2 ? 4 : 5, nums = Array.from({ length: n }, () => ri(5, 30)), m = ri(12, 24), last = (n + 1) * m - nums.reduce((s, v) => s + v, 0);
    if (last < 1) return genMath(L);
    q = `Het gemiddelde van ${n + 1} getallen is ${m}. De eerste ${n} getallen zijn ${nums.join(', ')}. Welk getal is het laatste?`; a = last;
  }
  else if (kind === 'speed') { const v = 4 * ri(3, 9), t = 15 * ri(1, 8); q = `Een fietser rijdt ${v} km per uur. Hoeveel kilometer legt hij af in ${t} minuten?`; a = v * t / 60; }
  else if (kind === 'pyth') { const [x, y, z] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]), k = ri(1, 3); q = `Een rechthoekige driehoek heeft rechthoekszijden van ${x * k} cm en ${y * k} cm. Hoeveel cm is de schuine zijde?`; a = z * k; }
  else if (kind === 'sum') { const n = ri(30, 100); q = `Hoeveel is de som van alle getallen van 1 tot en met ${n}? (1 + 2 + 3 + … + ${n})`; a = n * (n + 1) / 2; }
  else { const x = ri(23, 59), y = ri(23, 59); q = `Hoeveel is ${x} × ${y}?`; a = x * y; }
  return { label: 'Rekenen', num: true, a: String(a), q };
}
const CODE_GEN = {
  1: [() => genCaesar(false), genA1Z26, genReverse, () => genSeq(1), () => genMath(1), () => genLock(3)],
  2: [() => genCaesar(true), genAtbash, genMorse, genBinary, genWordSum, () => genSeq(2), () => genMath(2), () => genVigenere(false), () => genLock(3), genDouble],
  3: [genTriple, () => genVigenere(true), () => genLock(4), genMagic, () => genSeq(3), () => genMath(3), genHex, genDouble, genMorse]
};
const HARD_GEN = {
  1: [() => genCaesar(true), () => genLock(4), genDouble],
  2: [genTriple, () => genVigenere(true), () => genLock(4), genMagic, () => genSeq(3), () => genMath(3)]
};
function safeGen(list) {                              // een puzzel mag nooit crashen of leeg zijn
  for (let i = 0; i < 4; i++) {
    try { const t = pick(list)(); if (t && t.q && t.a) return t; } catch (e) {}
  }
  return genMath(1);
}
const genCode = () => safeGen(CODE_GEN[lvl()] || CODE_GEN[2]);

const PZ_EASY = ['wires', 'switches', 'keypad', 'binary', 'shapes'];                       // opzoekpuzzels: alleen op Normaal
const PZ_REAL = ['sudoku', 'nonogram', 'einstein', 'crypto', 'towers', 'lights', 'slide', 'hanoi', 'mastermind', 'wheels'];   // echte denkpuzzels
function puzzleTask(L) {                              // soorten komen om de beurt aan bod; hoger niveau = alleen echte denkpuzzels
  const allowed = PZ.types.filter(t => L <= 1 || (L === 2 ? !PZ_EASY.includes(t) : PZ_REAL.includes(t)));
  let bag = load('lj-pz-bag'); bag = Array.isArray(bag) ? bag.filter(t => allowed.includes(t)) : [];
  if (!bag.length) bag = shuffle(allowed);
  const type = bag.shift(); save('lj-pz-bag', bag);
  return { label: 'Puzzel', puzzle: PZ.make(type, L) };
}
function nextTask() {
  const src = [], own = parseTasks(cfg.tasks);
  if (cfg.srcPuz) src.push('puz');
  if (cfg.srcApi) src.push('api');
  if (cfg.srcMc) src.push('mc');
  if (cfg.srcCode) src.push('code');
  if (own.length) src.push('own');
  if (!src.length) src.push('puz');
  const s = pick(src);
  let t = null;
  try { t = s === 'puz' ? puzzleTask(lvl()) : s === 'api' ? apiTask() : s === 'mc' ? mcTask() : s === 'own' ? pick(own) : null; } catch (e) { t = null; }
  if (!t) t = genCode();                             // offline of pool leeg: altijd een puzzel
  refillTrivia();
  return t;
}
function finalPuzzle(L) {                              // eindopdracht: alleen echte denkpuzzels, om de beurt
  let bag = load('lj-pz-bag-final'); bag = Array.isArray(bag) ? bag.filter(t => PZ_REAL.includes(t)) : [];
  if (!bag.length) bag = shuffle(PZ_REAL.filter(t => PZ.types.includes(t)));
  const type = bag.shift(); save('lj-pz-bag-final', bag);
  return { label: 'Puzzel', puzzle: PZ.make(type, L) };
}
const hardTask = () => {
  const q = (game.extraQ || '').trim(), a = (game.extraA || '').trim();
  if (q) return { label: 'Extra opdracht', q, a };   // eigen extra opdracht (zonder antwoord: speler kiest zelf gelukt/niet gelukt)
  if (cfg.srcPuz) { try { return finalPuzzle(Math.min(3, lvl() + 1)); } catch (e) {} }     // eindopdracht: echte denkpuzzel, één stap zwaarder
  return safeGen(HARD_GEN[lvl() <= 1 ? 1 : 2]);
};

/* ---------- spel ---------- */
let timerId = null, prevReal = null, swapping = false;
async function keepAwake() { try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && game && game.phase !== 'done') keepAwake(); });

function enterGame() {
  $('#setup').classList.add('hidden'); $('#game').classList.remove('hidden');
  $('#timer').classList.remove('hidden');
  areaLayer.clearLayers(); L.polygon(game.area || cfg.area, { color: '#ff5b14', weight: 2, fill: false, dashArray: '6 6' }).addTo(areaLayer);
  $('#g-stop').textContent = 'Stop spel'; $('#g-stop').onclick = askStop;
  $('#g-skip').classList.remove('hidden');
  clearInterval(timerId);
  timerId = setInterval(() => { if (game) $('#timer').textContent = fmtTime(Date.now() - game.start); }, 1000);
  keepAwake();
  renderGame();
}
const target = () => game.route[game.idx];
function renderGame() {
  gameLayer.clearLayers();
  const t = target();
  game.route.slice(0, game.idx).forEach(p => L.circleMarker(ll(p), { radius: 5, color: '#fff', weight: 2, fillColor: '#5d7080', fillOpacity: 1 }).addTo(gameLayer));
  L.circle(ll(t), { radius: game.radius, color: '#ff5b14', weight: 2, fillOpacity: .25 }).addTo(gameLayer);
  L.marker(ll(t), { icon: divIcon('target', 26) }).addTo(gameLayer);
  $('#g-title').textContent = `Locatie ${game.idx + 1} van ${game.n}`;
  $('#g-sub').textContent = game.idx === game.n - 1 ? 'Dit is je eindlocatie.' : 'Loop naar de oranje vlag.';
  map.fitBounds(me ? L.latLngBounds([ll(t), ll(me)]) : L.latLngBounds([ll(t)]), { padding: [60, 60], maxZoom: 18 });
  updateDist();
}
function updateDist() {
  if (!game || game.phase === 'done') return;
  if (!me) { $('#g-dist').textContent = '—'; return; }
  const t = target(), d = dist(me, t);
  $('#g-dist').textContent = d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m';
  $('#g-arrow').style.transform = `rotate(${bearing(me, t) - 90}deg)`;
}
$('#g-center').onclick = () => { if (game) map.fitBounds(me ? L.latLngBounds([ll(target()), ll(me)]) : L.latLngBounds([ll(target())]), { padding: [60, 60], maxZoom: 18 }); };
function askStop() {
  openModal(`<h3>Spel stoppen?</h3><p>Je voortgang gaat verloren.</p><div class="row"><button class="ghost" id="m-cancel">Verder spelen</button><button class="no" id="m-stop">Stop</button></div>`);
  $('#m-cancel').onclick = closeModal;
  $('#m-stop').onclick = () => { closeModal(); resetGame(); };
}
function resetGame() {
  game = null; localStorage.removeItem(LS_GAME); clearInterval(timerId); fakePos = false; prevReal = null;
  gameLayer.clearLayers(); $('#game').classList.add('hidden'); $('#setup').classList.remove('hidden');
  $('#timer').classList.add('hidden'); $('#result').classList.add('hidden'); closeModal(); renderArea();
}

/* ---------- locatie niet bereikbaar: nieuwe willekeurige wandelbare plek ---------- */
$('#g-skip').onclick = () => {
  if (!game || game.phase !== 'walk') return;
  openModal(`<h3>Locatie niet bereikbaar?</h3><p class="q">Je krijgt een nieuwe willekeurige locatie op een plek waar je kunt lopen.</p>
    <div class="row"><button class="ghost" id="m-cancel">Annuleren</button><button class="dark" id="m-swap">Nieuwe locatie</button></div>`);
  $('#m-cancel').onclick = closeModal;
  $('#m-swap').onclick = swapTarget;
};
async function swapTarget() {
  if (!game || game.phase !== 'walk' || swapping) return;
  swapping = true; closeModal(); loading(true, 'Nieuwe locatie zoeken…');
  try {
    const bad = target();
    game.rejected = (game.rejected || []).concat([bad]);
    const used = () => game.trues.concat(game.decoys, game.rejected);
    game.spares = game.spares || [];
    let p = null;
    while (game.spares.length && !p) { const c = game.spares.shift(); if (used().every(u => dist(u, c) >= 30)) p = c; }
    if (!p) {                                          // reserve op: opnieuw padgegevens ophalen
      try {
        const r = pickSpread(candidates(await fetchWays(boundsOf(game.area)), game.area), 1, used(), [40, 25, 12]);
        p = r && r[0];
      } catch (e) {
        try { const sn = await snapCandidates(game.area, 3); const r = pickSpread(sn, 1, used(), [40, 25, 12, 5]); p = r && r[0]; } catch (e2) {}
      }
    }
    loading(false);
    if (!p) {
      save(LS_GAME, game);
      openModal(`<h3>Geen nieuwe locatie</h3><p class="q">Er kon nu geen andere wandelbare plek gevonden worden. Controleer je internet en probeer het zo nog eens.</p><button class="primary" id="m-ok">OK</button>`);
      $('#m-ok').onclick = closeModal;
      return;
    }
    if (game.wrong) game.decoys[game.idx - 1] = p; else game.trues[game.idx] = p;
    game.route[game.idx] = p; game.skips = (game.skips || 0) + 1;
    save(LS_GAME, game); renderGame();
  } finally { loading(false); swapping = false; }
}

/* ---------- positie ---------- */
function segDist(a, b, t) {                            // kortste afstand van punt t tot lijnstuk a-b (meter)
  const kx = 111320 * Math.cos(rad(t.lat)), ky = 110540;
  const ax = (a.lng - t.lng) * kx, ay = (a.lat - t.lat) * ky, bx = (b.lng - t.lng) * kx, by = (b.lat - t.lat) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? -(ax * dx + ay * dy) / l2 : 0; u = Math.max(0, Math.min(1, u));
  return Math.hypot(ax + u * dx, ay + u * dy);
}
function setPosition(p, fake) {
  if (fake) fakePos = true; else if (fakePos) return;
  me = p;
  const b = $('#gpsbadge');
  b.textContent = fake ? 'Testlocatie' : `GPS ±${Math.round(p.acc)} m`; b.className = p.acc <= 15 || fake ? 'ok' : '';
  meLayer.clearLayers();
  L.circle(ll(p), { radius: p.acc, color: '#2d7dff', weight: 1, fillOpacity: .1 }).addTo(meLayer);
  L.marker(ll(p), { icon: divIcon('me', 18), interactive: false }).addTo(meLayer);
  if (firstFix && !game) { map.setView(ll(p), 17); firstFix = false; }
  if (game) {
    updateDist();
    if (game.phase === 'walk' && !swapping) {
      const t = target();
      let hit = dist(p, t) <= game.radius;
      // langsgelopen tussen twee GPS-metingen in? Dan telt het ook als bereikt.
      if (!hit && !fake && prevReal && dist(prevReal, p) <= 60) hit = segDist(prevReal, p, t) <= game.radius;
      if (hit) arrive();
    }
  }
  prevReal = fake ? null : p;
}
if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(
    pos => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || 20 }),
    err => { const b = $('#gpsbadge'); b.className = 'err'; b.textContent = err.code === 1 ? 'Locatie geweigerd: sta toe in instellingen' : 'GPS niet beschikbaar'; },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
  );
} else { $('#gpsbadge').textContent = 'Geen GPS op dit apparaat'; $('#gpsbadge').className = 'err'; }

/* ---------- modals en opdrachten ---------- */
function openModal(html) { $('#modal-card').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }

/* De huidige opdracht wordt in game.cur bewaard: hij blijft op het scherm tot hij gedaan is,
   ook als je doorloopt, de app sluit of de pagina herlaadt. */
function arrive() {
  game.phase = 'task';
  game.cur = game.idx < game.n - 1 ? { kind: 'task', task: nextTask() } : { kind: 'final' };
  save(LS_GAME, game);
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
  showCur();
}
function showCur() {
  const c = game.cur;
  if (c.kind === 'task') showTask(c.task, ok => answerTask(ok), `Locatie ${game.idx + 1} bereikt!`);
  else if (c.kind === 'extra') showTask(c.task, ok => { game.extraInfo = Object.assign(taskInfo(c.task), { ok }); closeModal(); finish(ok ? 'ok' : 'bad'); }, 'Extra moeilijke opdracht');
  else showFinalChoice();
}
function resumeTask() {                                // na herladen: opdracht weer tonen
  if (!game.cur) game.cur = game.idx < game.n - 1 ? { kind: 'task', task: nextTask() } : { kind: 'final' };
  save(LS_GAME, game); showCur();
}
const HELP_LBL = {
  'Kraak de code': ['Het grijze vak bevat een geheime tekst. Lees de uitleg bij de vraag en typ het woord dat eruit komt.', 'Elke letter 3 plaatsen verder in het alfabet: HALLO wordt KDOOR. Jij moet terug: KDOOR is HALLO.'],
  'Morsecode': ['Elke letter is een rijtje punten en strepen. · is kort, − is lang. Een grotere ruimte betekent: volgende letter.', '··· −−− ··· is SOS.'],
  'Binair': ['Binair gebruikt alleen 0 en 1. Van rechts naar links tellen de cijfers 1, 2, 4, 8, 16 …', '1010 = 8 + 2 = 10.'],
  'Hexadecimaal': ['Hexadecimaal heeft 16 cijfers: 0 t/m 9 en daarna A = 10, B = 11, C = 12, D = 13, E = 14, F = 15. Het eerste cijfer telt 16 keer mee.', '1F = 1 × 16 + 15 = 31.'],
  'Letterwaarde': ['Elke letter heeft een getal: A = 1, B = 2 … Z = 26. Tel alle letters op.', 'KAT = 11 + 1 + 20 = 32.'],
  'Magisch vierkant': ['In een magisch vierkant geven alle rijen en kolommen dezelfde som. Gebruik dat om de ontbrekende getallen te vinden.', 'Rij 2 7 6 geeft 15. Dan geeft elke andere rij ook 15.'],
  'Kraak het slot': ['Elke aanwijzing is een gok en laat zien hoeveel cijfers goed zijn. Zoek de code die bij alle aanwijzingen past.', '“123: 0 goed” betekent: de cijfers 1, 2 en 3 zitten niet in de code.'],
  'Getallenreeks': ['Zoek de regel achter de getallen: steeds hetzelfde erbij, of steeds keer hetzelfde.', '2, 4, 6, 8, ? → elke keer +2, dus 10.'],
  'Rekenen': ['Reken de som uit. Een stuk papier mag. Keer en delen gaan voor plus en min.', '3 + 4 × 2 = 3 + 8 = 11.'],
  'Extra opdracht': ['Dit is de laatste opdracht. Lees de vraag goed.', '']
};
const HELP_GENERIC = ['Lees de vraag, kies of typ je antwoord en bevestig. Je hoort niet of het goed was: dat zie je aan het einde, met het goede antwoord.', ''];
function howHtml(task) {
  let h;
  if (task.puzzle) { const x = PZ.help(task.puzzle.type); h = [x.text, x.example]; }
  else if (task.help) h = task.help;
  else h = HELP_LBL[task.label] || (Array.isArray(task.options) ? ['Kies het antwoord waarvan je denkt dat het goed is. Je hoort niet meteen of het goed was: dat zie je aan het einde, met het goede antwoord.', ''] : (!task.a && !task.puzzle ? ['Doe de opdracht en tik daarna op Gelukt of Niet gelukt.', ''] : HELP_GENERIC));
  return `<details class="how"><summary>Uitleg</summary><p>${esc(h[0])}</p>${h[1] ? `<p class="ex"><b>Voorbeeld:</b> ${esc(h[1])}</p>` : ''}<p class="ex">Je ziet pas aan het einde of je antwoord goed was.</p></details>`;
}
function taskInfo(t) {                                // wat er aan het einde bij een opdracht getoond wordt
  try {
    if (t.puzzle) return { name: PZ.names[t.puzzle.type] || 'Puzzel', q: '', a: PZ.solution(t.puzzle) };
    const a = t.a ? esc(String(t.a).split('/').join('  of  ')) : 'De speler koos zelf of het gelukt was.';
    return { name: t.label || 'Opdracht', q: [t.q, t.box].filter(Boolean).join('\n'), a };
  } catch (e) { return { name: 'Opdracht', q: '', a: '' }; }
}
function showPuzzle(task, done, title) {
  openModal(`<h3>${esc(title)}</h3><div class="tag">Puzzel</div>${howHtml(task)}<div id="pz-root"></div>`);
  try { PZ.run($('#pz-root'), task.puzzle, ok => done(ok)); }
  catch (e) { showTask(genCode(), done, title); }       // een puzzel mag het spel nooit blokkeren
}
function showTask(task, done, title) {
  if (task.puzzle) return showPuzzle(task, done, title);
  const hasOpts = Array.isArray(task.options), hasAns = !!task.a && !hasOpts;
  openModal(`<h3>${esc(title)}</h3>${task.label ? `<div class="tag">${esc(task.label)}</div>` : ''}${howHtml(task)}<p class="q">${esc(task.q)}</p>` +
    (task.box ? `<div class="code sm ${esc(task.boxCls || '')}">${esc(task.box)}</div>` : '') +
    (hasOpts ? task.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')
      : hasAns
        ? `<input type="text" id="t-ans" placeholder="Jouw antwoord" autocomplete="off" autocapitalize="off"${task.num ? ' inputmode="numeric"' : ''}><button class="primary" id="t-ok">Bevestig</button>`
        : `<div class="row"><button class="ok" id="t-yes">Gelukt</button><button class="no" id="t-no">Niet gelukt</button></div>`));
  if (hasOpts) {
    const btns = document.querySelectorAll('#modal-card .opt');
    btns.forEach(b => b.onclick = () => { btns.forEach(x => x.disabled = true); done(task.options[+b.dataset.i] === task.a); });
  } else if (hasAns) {
    $('#t-ok').onclick = () => { const v = $('#t-ans').value; if (!v.trim()) return; $('#t-ok').disabled = true; done(checkAnswer(v, task.a)); };
    $('#t-ans').addEventListener('keydown', e => { if (e.key === 'Enter') $('#t-ok').click(); });
  } else { $('#t-yes').onclick = () => done(true); $('#t-no').onclick = () => done(false); }
}
function answerTask(ok) {
  if (game.phase !== 'task') return;
  const info = game.cur && game.cur.task ? taskInfo(game.cur.task) : {};
  game.results.push({ loc: game.idx + 1, ok, onWrongPath: game.wrong, name: info.name, q: info.q, a: info.a });
  if (!ok) game.wrong = true;                      // blijft fout tot het einde
  game.idx++;
  game.route.push(game.wrong ? game.decoys[game.idx - 1] : game.trues[game.idx]);
  game.phase = 'walk'; game.cur = null; save(LS_GAME, game);
  openModal(`<h3>Opdracht afgerond</h3><p class="q">Je volgende locatie staat op de kaart. Aan het einde zie je alle goede antwoorden.</p><button class="primary" id="m-next">Verder</button>`);
  $('#m-next').onclick = () => { closeModal(); renderGame(); };
}
function showFinalChoice() {
  openModal(`<h3>Eindlocatie bereikt!</h3><p class="q">Doe de extra moeilijke opdracht, of sla over en ontvang meteen je code.</p>
    <div class="row"><button class="dark" id="f-extra">Extra opdracht</button><button class="ghost" id="f-skip">Overslaan</button></div>`);
  $('#f-skip').onclick = () => { closeModal(); finish('skipped'); };
  $('#f-extra').onclick = () => { game.cur = { kind: 'extra', task: hardTask() }; save(LS_GAME, game); showCur(); };
}

/* ---------- einde en uitslag ---------- */
function finish(extra) {
  game.extra = extra; game.phase = 'done'; game.cur = null; game.end = game.end || Date.now();
  $('#g-skip').classList.add('hidden');
  const success = extra === 'skipped' ? !game.wrong : extra === 'ok';
  game.success = success; game.code = success ? game.goodCode : game.badCode;
  save(LS_GAME, game); clearInterval(timerId);
  const good = game.results.filter(r => r.ok).length, total = game.results.length;
  const extraTxt = { skipped: 'overgeslagen', ok: 'goed', bad: 'fout' }[extra];
  const item = (title, r) => `<details class="res"><summary><span>${esc(title)}${r.name ? ' · ' + esc(r.name) : ''}</span><span class="mk ${r.ok ? 'ok' : 'bad'}">${r.ok ? '✔ goed' : '✘ fout'}</span></summary>` +
    (r.a ? `<div class="res-body">${r.q ? `<p class="q">${esc(r.q)}</p>` : ''}<p><b>Goede antwoord:</b></p><div class="res-a">${r.a}</div></div>` : '<div class="res-body"><p>Geen antwoord bewaard.</p></div>') + '</details>';
  const list = game.results.map(r => item('Locatie ' + r.loc, r)).join('') + (game.extraInfo ? item('Eindopdracht', game.extraInfo) : '');
  $('#result-card').innerHTML = `
    <h3>Uitslag</h3>
    <div class="stamp ${success ? 'ok' : 'bad'}">${success ? 'Geslaagd' : 'Niet geslaagd'}</div>
    <table>
      <tr><th>Tijd</th><th>${fmtTime(game.end - game.start)}</th></tr>
      <tr><td>Locaties</td><td>${game.n}</td></tr>
      <tr><td>Opdrachten goed</td><td>${good} van ${total}</td></tr>
      <tr><td>Eindlocatie</td><td>${game.wrong ? 'fout' : 'goed'}</td></tr>
      <tr><td>Extra opdracht</td><td>${extraTxt}</td></tr>
      ${game.skips ? `<tr><td>Locaties vervangen</td><td>${game.skips}</td></tr>` : ''}
    </table>
    <h4 class="res-h">Goede antwoorden</h4><div class="res-list">${list || '<p>Geen opdrachten gedaan.</p>'}</div>
    <div class="row"><button class="ghost" id="r-map">Toon route</button><button class="ghost" id="r-share">Deel uitslag</button></div>
    <button class="primary" id="r-new">Nieuw spel</button>`;
  $('#result').classList.remove('hidden');
  $('#r-new').onclick = resetGame;
  $('#r-map').onclick = () => { $('#result').classList.add('hidden'); drawRoute(); };
  $('#r-share').onclick = () => {
    const text = `Locatiejacht: ${success ? 'geslaagd' : 'niet geslaagd'}\nTijd: ${fmtTime(game.end - game.start)}\nOpdrachten goed: ${good}/${total}\nExtra opdracht: ${extraTxt}`;
    if (navigator.share) navigator.share({ text }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(text);
  };
}
function drawRoute() {
  gameLayer.clearLayers();
  L.polyline(game.trues.map(ll), { color: '#2f9e63', weight: 4, dashArray: '8 8' }).addTo(gameLayer);
  L.polyline(game.route.map(ll), { color: '#ff5b14', weight: 4 }).addTo(gameLayer);
  game.route.forEach((p, i) => L.marker(ll(p), { icon: divIcon(i === 0 ? 'start' : 'target', 22) }).addTo(gameLayer));
  map.fitBounds(L.latLngBounds(game.route.concat(game.trues).map(ll)), { padding: [50, 50] });
  $('#g-title').textContent = 'Jouw route (oranje) en de juiste route (groen)';
  $('#g-sub').textContent = ''; $('#g-dist').textContent = '';
  $('#g-stop').textContent = 'Uitslag'; $('#g-stop').onclick = () => { $('#result').classList.remove('hidden'); };
}

/* ---------- uitleg met voorbeelden ---------- */
function helpHtml() {
  const types = PZ.types.map(t => { const x = PZ.help(t); return `<details><summary>${esc(PZ.names[t])}</summary><p>${esc(x.text)}</p>${x.example ? `<p class="ex"><b>Voorbeeld:</b> ${esc(x.example)}</p>` : ''}</details>`; }).join('');
  const codes = Object.entries(HELP_LBL).filter(([k]) => k !== 'Extra opdracht').map(([k, h]) => `<details><summary>${esc(k)}</summary><p>${esc(h[0])}</p>${h[1] ? `<p class="ex"><b>Voorbeeld:</b> ${esc(h[1])}</p>` : ''}</details>`).join('');
  return `<h3>Uitleg</h3>
  <details open><summary>Zo werkt het spel</summary><ol class="help-ol">
    <li>Teken een speelgebied op de kaart, kies het aantal locaties en tik op “Maak locaties en start”.</li>
    <li>Loop naar de oranje vlag. De pijl en afstand staan op het scherm. Kom je dichtbij genoeg, dan krijg je een opdracht.</li>
    <li>Los de opdracht op. Je hoort niet of je antwoord goed was: je krijgt meteen je volgende locatie. Je volgende locatie hangt af van je antwoorden.</li>
    <li>Kun je een locatie echt niet bereiken, tik dan op “Locatie niet bereikbaar”.</li>
    <li>Op de laatste locatie doe je de moeilijke eindopdracht, of je slaat hem over. Sla je hem over, dan krijg je de goede code als al je opdrachten goed waren. Doe je hem, dan telt alleen die: goed betekent de goede code.</li>
    <li>Aan het einde zie je bij elke opdracht in een uitklapmenu het goede antwoord.</li></ol></details>
  <details><summary>Puzzels (met voorbeelden)</summary>${types}</details>
  <details><summary>Code-opdrachten (met voorbeelden)</summary>${codes}</details>
  <details><summary>Quizvragen</summary><p>Willekeurige vragen van internet, automatisch vertaald naar het Nederlands. Kies één antwoord.</p><p class="ex"><b>Voorbeeld:</b> “Wat is de hoofdstad van Frankrijk?” Antwoord: Parijs.</p></details>
  <button class="primary" id="help-close" type="button">Sluiten</button>`;
}
function openHelp() { $('#help-card').innerHTML = helpHtml(); $('#help').classList.remove('hidden'); $('#help-close').onclick = () => $('#help').classList.add('hidden'); }
$('#btn-help').onclick = openHelp; $('#btn-help2').onclick = openHelp;

/* ---------- start ---------- */
bindSettings(); renderArea(); warmTasks();
if (cfg.area.length > 1) map.fitBounds(L.latLngBounds(cfg.area), { padding: [40, 40] });
if (game && game.phase === 'done') { enterGame(); finish(game.extra); }
else if (game) { enterGame(); if (game.phase === 'task') resumeTask(); }

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {});
}