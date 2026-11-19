'use strict';
/* Interactieve puzzelmodules (zoals de onderdelen van een bom). Alles staat op het scherm: regels, serienummer, lampje en batterijen,
   zodat één speler de puzzel kan oplossen. Elke puzzel meldt aan het eind alleen "afgerond" (goed of fout blijft verborgen). */
(function () {
  const R = n => Math.floor(Math.random() * n);
  const ri = (a, b) => a + R(b - a + 1);
  const pick = a => a[R(a.length)];
  const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = R(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sp = () => (typeof window.PZ_SPEED === 'number' ? window.PZ_SPEED : 1);   // tests zetten dit laag
  const wait = ms => new Promise(r => setTimeout(r, ms * sp()));
  const T = {};

  /* ---------- gedeelde onderdelen ---------- */
  const ADJ = { rood: 'rode', blauw: 'blauwe', groen: 'groene', geel: 'gele', wit: 'witte', zwart: 'zwarte', paars: 'paarse', oranje: 'oranje' };
  const HEX = { rood: '#d64545', blauw: '#2d7dff', groen: '#2f9e63', geel: '#f2c200', wit: '#f4f4f4', zwart: '#222222', paars: '#8e44ad', oranje: '#ff8a1f' };
  const DIRS = ['NOORD', 'OOST', 'ZUID', 'WEST'];
  const info = () => ({ sn: String(ri(100000, 999999)), lamp: R(2) === 1, bat: ri(1, 4) });
  const odd = p => +p.sn.slice(-1) % 2 === 1;
  const infoBar = p => `<div class="pz-info"><span>Serienummer <b>${p.sn}</b></span><span>Batterijen <b>${p.bat}</b> <span class="pz-bat">${'▮'.repeat(p.bat)}</span></span><span>Lampje <i class="pz-lamp ${p.lamp ? 'on' : ''}"></i> <b>${p.lamp ? 'AAN' : 'UIT'}</b></span></div>
    <div class="pz-hint">Oneven serienummer = laatste cijfer is 1, 3, 5, 7 of 9. Even = 0, 2, 4, 6 of 8.</div>`;
  const steps = n => `${Math.abs(n)} stap${Math.abs(n) === 1 ? '' : 'pen'}`;

  /* ---------- 1. Draden ---------- */
  const wcond = (c, p) => ({
    has: () => p.w.includes(c.c), multi: () => p.w.filter(x => x === c.c).length > 1, none: () => !p.w.includes(c.c),
    odd: () => odd(p), even: () => !odd(p), lamp: () => p.lamp === c.on, bat: () => p.bat >= c.n, bateq: () => p.bat === c.n
  })[c.t]();
  const wact = (a, p) => a.t === 'top' ? 0 : a.t === 'bottom' ? p.w.length - 1 : a.t === 'pos' ? a.n - 1 : a.t === 'first' ? p.w.indexOf(a.c) : p.w.lastIndexOf(a.c);
  const wiresAnswer = p => { for (const r of p.rules) if (wcond(r.c, p)) return wact(r.a, p); return wact(p.def, p); };
  const wct = c => ({
    has: `er een ${ADJ[c.c]} draad is`, multi: `er meer dan één ${ADJ[c.c]} draad is`, none: `er geen ${ADJ[c.c]} draad is`,
    odd: 'het serienummer oneven is', even: 'het serienummer even is', lamp: `het lampje ${c.on ? 'aan' : 'uit'} is`,
    bat: `je minstens ${c.n} batterijen hebt`, bateq: `je precies ${c.n} batterij${c.n === 1 ? '' : 'en'} hebt`
  })[c.t];
  const wat = a => ({
    top: 'knip de bovenste draad', bottom: 'knip de onderste draad', pos: `knip draad ${a.n} (van boven geteld)`,
    first: `knip de bovenste ${ADJ[a.c]} draad`, last: `knip de onderste ${ADJ[a.c]} draad`
  })[a.t];
  T.wires = {
    name: 'Draden',
    make(L) {
      const n = [4, 5, 6][L - 1], names = ['rood', 'blauw', 'groen', 'geel', 'wit', 'zwart'];
      let w; do { w = Array.from({ length: n }, () => pick(names)); } while (new Set(w).size < 3);
      const cols = [...new Set(w)], absent = names.filter(c => !w.includes(c)), multi = cols.filter(c => w.filter(x => x === c).length > 1);
      const cond = () => pick([
        () => ({ t: 'has', c: pick(cols) }),
        () => ({ t: 'multi', c: multi.length ? pick(multi) : pick(cols) }),
        () => ({ t: 'none', c: absent.length && R(2) ? pick(absent) : pick(cols) }),
        () => ({ t: 'odd' }), () => ({ t: 'even' }), () => ({ t: 'lamp', on: R(2) === 1 }),
        () => ({ t: 'bat', n: ri(2, 3) }), () => ({ t: 'bateq', n: ri(1, 4) })])();
      const act = () => pick([() => ({ t: 'top' }), () => ({ t: 'bottom' }), () => ({ t: 'pos', n: ri(2, n - 1) }),
        () => ({ t: 'first', c: pick(cols) }), () => ({ t: 'last', c: pick(cols) })])();
      return { type: 'wires', L, ...info(), w, rules: Array.from({ length: 2 + L }, () => ({ c: cond(), a: act() })), def: act() };
    },
    mount(b, p, x) {
      b.innerHTML = infoBar(p) + `<p class="pz-intro">Er zijn ${p.w.length} draden (draad 1 is de bovenste). Lees de regels van boven naar beneden: de <b>eerste regel die klopt</b> bepaalt welke draad je knipt. Je hebt één kans.</p>
        <ol class="pz-rules">${p.rules.map(r => `<li>Als ${wct(r.c)}, ${wat(r.a)}.</li>`).join('')}</ol>
        <p class="pz-intro pz-def">Klopt geen enkele regel? Dan ${wat(p.def)}.</p>
        <div class="pz-wires">${p.w.map((c, i) => `<button type="button" class="pz-wire" data-i="${i}" style="--c:${HEX[c]}" aria-label="Draad ${i + 1}, ${c}"><i>${i + 1} · ${c}</i></button>`).join('')}</div>`;
      const ans = wiresAnswer(p);
      b.querySelectorAll('.pz-wire').forEach(w => { w.onclick = () => { w.classList.add('cut'); x.end(+w.dataset.i === ans); }; });
    }
  };

  /* ---------- 2. Kleurenreeks (Simon) ---------- */
  const SC = [['ROOD', '#d64545'], ['BLAUW', '#2d7dff'], ['GROEN', '#2f9e63'], ['GEEL', '#f2c200']];
  T.simon = {
    name: 'Kleurenreeks',
    make(L) {
      const b = info(), len = [4, 5, 7][L - 1];
      return { type: 'simon', L, ...b, seq: Array.from({ length: len }, () => R(4)), shift: L >= 3 ? (odd(b) ? 1 : 3) : 0 };
    },
    mount(b, p, x) {
      b.innerHTML = (p.shift ? infoBar(p) : '') + `<p class="pz-intro">Er flitsen kleuren. Druk ze daarna in dezelfde volgorde in. Elke ronde komt er één kleur bij.
        ${p.shift ? `<b>Let op:</b> druk niet de getoonde kleur in, maar de kleur die er <b>${p.shift === 1 ? 'direct ná' : 'direct vóór'}</b> komt in de volgorde ROOD → BLAUW → GROEN → GEEL → ROOD.` : ''}
        Je hebt <b>één kans</b>.</p><div class="pz-pad">${SC.map((c, i) => `<button type="button" data-c="${i}" style="--c:${c[1]}">${c[0]}</button>`).join('')}</div>`;
      const pads = [...b.querySelectorAll('.pz-pad button')], hearts = b.querySelector('.pz-hearts');
      let round = 1, pos = 0, lives = 1, busy = true;
      const drawHearts = () => { hearts.textContent = '♥'.repeat(lives) + '♡'.repeat(1 - lives); };
      const show = async () => {
        busy = true; x.msg('Kijk goed…'); await wait(500);
        for (let i = 0; i < round && !x.ended; i++) { pads[p.seq[i]].classList.add('lit'); await wait(450); pads[p.seq[i]].classList.remove('lit'); await wait(200); }
        if (x.ended) return;
        busy = false; pos = 0; x.msg(`Jouw beurt: druk ${round} kleur${round === 1 ? '' : 'en'} in.`);
      };
      pads.forEach(btn => {
        btn.onclick = () => {
          if (busy || x.ended) return;
          const c = +btn.dataset.c;
          if (c === (p.seq[pos] + p.shift) % 4) {
            pos++;
            if (pos === round) { round++; if (round > p.seq.length) x.end(true); else show(); }
          } else { lives--; drawHearts(); if (lives <= 0) x.end(false); else { show(); } }
        };
      });
      drawHearts(); show();
    }
  };

  /* ---------- 3. Lampjes uit ---------- */
  const nbrs = (i, w, h) => { const r = Math.floor(i / w), c = i % w, o = []; if (r > 0) o.push(i - w); if (r < h - 1) o.push(i + w); if (c > 0) o.push(i - 1); if (c < w - 1) o.push(i + 1); return o; };
  T.lights = {
    name: 'Lampjes uit',
    make(L) {
      const n = [3, 4, 5][L - 1], k = [4, 6, 8][L - 1];
      let cells, presses;
      do {
        cells = Array(n * n).fill(0); presses = shuf([...Array(n * n).keys()]).slice(0, k);
        presses.forEach(i => { [i, ...nbrs(i, n, n)].forEach(j => { cells[j] ^= 1; }); });
      } while (!cells.some(Boolean));
      return { type: 'lights', L, n, cells, presses };
    },
    mount(b, p, x) {
      const cells = p.cells.slice(); let moves = 0;
      b.innerHTML = `<p class="pz-intro">Tik op een lampje: dat lampje en de lampjes direct boven, onder, links en rechts ervan schakelen om (aan ↔ uit). Doel: <b>alle lampjes uit</b>.</p>
        <div class="pz-grid" style="grid-template-columns:repeat(${p.n},1fr)">${cells.map((_, i) => `<button type="button" class="pz-cell" data-i="${i}" aria-label="Lampje ${i + 1}"></button>`).join('')}</div><div class="pz-count"></div>`;
      const btns = [...b.querySelectorAll('.pz-cell')], cnt = b.querySelector('.pz-count');
      const draw = () => { btns.forEach((e, i) => e.classList.toggle('on', !!cells[i])); cnt.textContent = `Zetten: ${moves}`; };
      btns.forEach(e => { e.onclick = () => { if (x.ended) return; const i = +e.dataset.i; [i, ...nbrs(i, p.n, p.n)].forEach(j => { cells[j] ^= 1; }); moves++; draw(); if (!cells.some(Boolean)) x.end(true); }; });
      draw();
    }
  };

  /* ---------- 4. Schuifpuzzel ---------- */
  T.slide = {
    name: 'Schuifpuzzel',
    make(L) {
      const [w, h] = [[3, 3], [3, 3], [3, 4]][L - 1], mv = [30, 90, 150][L - 1], N = w * h;
      let t, path;
      do {
        t = [...Array(N).keys()].map(i => (i + 1) % N); let z = N - 1, last = -1; path = [z];
        for (let k = 0; k < mv; k++) { const j = pick(nbrs(z, w, h).filter(i => i !== last)); t[z] = t[j]; t[j] = 0; last = z; z = j; path.push(z); }
      } while (t.every((v, i) => v === (i + 1) % N));
      return { type: 'slide', L, w, h, t, path };
    },
    mount(b, p, x) {
      const t = p.t.slice(), N = p.w * p.h; let moves = 0;
      b.innerHTML = `<p class="pz-intro">Schuif de blokjes met een tik naar de lege plek. Zet de getallen op volgorde: 1 linksboven, daarna van links naar rechts en van boven naar beneden. De lege plek komt rechtsonder.</p>
        <div class="pz-grid pz-slide" style="grid-template-columns:repeat(${p.w},1fr)">${t.map((_, i) => `<button type="button" class="pz-tile" data-i="${i}"></button>`).join('')}</div><div class="pz-count"></div>`;
      const btns = [...b.querySelectorAll('.pz-tile')], cnt = b.querySelector('.pz-count');
      const draw = () => { btns.forEach((e, i) => { e.textContent = t[i] || ''; e.classList.toggle('e', !t[i]); e.setAttribute('aria-label', t[i] ? 'Blokje ' + t[i] : 'Lege plek'); }); cnt.textContent = `Zetten: ${moves}`; };
      btns.forEach(e => {
        e.onclick = () => {
          if (x.ended) return; const i = +e.dataset.i, z = t.indexOf(0);
          if (!nbrs(z, p.w, p.h).includes(i)) return;
          t[z] = t[i]; t[i] = 0; moves++; draw();
          if (t.every((v, k) => v === (k + 1) % N)) x.end(true);
        };
      });
      draw();
    }
  };

  /* ---------- 5. Combinatieslot met wieltjes ---------- */
  const LOCKS = {};
  function lockData(len) {
    const all = LOCKS[len] || (LOCKS[len] = (() => { const out = [], rec = s => { if (s.length === len) { out.push(s); return; } for (const d of '0123456789') if (!s.includes(d)) rec(s + d); }; rec(''); return out; })());
    const fb = (s, g) => { let a = 0, c = 0; for (let i = 0; i < len; i++) { if (s[i] === g[i]) a++; else if (s.includes(g[i])) c++; } return a + ',' + c; };
    for (let t = 0; t < 8; t++) {
      const secret = pick(all); let cand = all; const clues = [];
      while (cand.length > 1 && clues.length < (len === 3 ? 6 : 8)) {
        let best = null;
        for (let k = 0; k < 14; k++) {
          const g = pick(all); if (g === secret) continue;
          const f = fb(secret, g), next = cand.filter(c => fb(c, g) === f);
          if (!best || next.length < best.next.length) best = { g, f, next };
        }
        if (!best || best.next.length >= cand.length) break;
        const [a, c] = best.f.split(',').map(Number); clues.push({ g: best.g, x: a, y: c }); cand = best.next;
      }
      if (cand.length === 1) return { secret, clues };
    }
    return null;
  }
  const clueText = c => c.x + c.y === 0 ? `${c.g}: geen enkel cijfer zit in de code` : `${c.g}: ${c.x} goed op de juiste plek, ${c.y} goed maar op de verkeerde plek`;
  T.wheels = {
    name: 'Kraak het slot',
    make(L) {
      const len = L >= 3 ? 4 : 3; let d = null;
      for (let i = 0; i < 6 && !d; i++) d = lockData(len);
      if (!d) d = { secret: len === 3 ? '123' : '1234', clues: [] };
      return { type: 'wheels', L, len, secret: d.secret, clues: d.clues, tries: 1 };
    },
    mount(b, p, x) {
      const dig = Array(p.len).fill(0); let tries = p.tries;
      b.innerHTML = `<p class="pz-intro">Het slot heeft een code van <b>${p.len}</b> verschillende cijfers (elk cijfer komt maar één keer voor). Gebruik de aanwijzingen en draai de wieltjes. Je hebt <b>één</b> poging.</p>
        <ul class="pz-clues">${p.clues.map(c => `<li>${esc(clueText(c))}</li>`).join('')}</ul>
        <div class="pz-wheels">${dig.map((_, i) => `<div class="pz-wheel"><button type="button" data-w="${i}" data-d="1" aria-label="Cijfer ${i + 1} omhoog">▲</button><b id="pz-d${i}">0</b><button type="button" data-w="${i}" data-d="-1" aria-label="Cijfer ${i + 1} omlaag">▼</button></div>`).join('')}</div>
        <button type="button" class="primary" id="pz-go">Probeer</button>`;
      b.querySelectorAll('.pz-wheel button').forEach(e => {
        e.onclick = () => { if (x.ended) return; const i = +e.dataset.w; dig[i] = (dig[i] + +e.dataset.d + 10) % 10; b.querySelector('#pz-d' + i).textContent = dig[i]; };
      });
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        if (dig.join('') === p.secret) return x.end(true);
        tries--; if (tries <= 0) return x.end(false);
        x.msg('');
      };
    }
  };

  /* ---------- 6. Vormen sorteren ---------- */
  const polyPts = (n, r = 30) => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + 2 * Math.PI * i / n; return `${(36 + r * Math.cos(a)).toFixed(1)},${(36 + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  T.shapes = {
    name: 'Vormen sorteren',
    make(L) {
      const dir = R(2) ? 1 : -1; let shapes, key, corder = null;
      if (L === 1) { shapes = shuf([3, 4, 5, 6, 7, 8]).slice(0, 5).map(s => ({ s, c: 'blauw' })); key = s => dir * s.s; }
      else if (L === 2) {
        const all = []; for (const s of [3, 4, 5, 6]) for (const c of ['rood', 'blauw']) all.push({ s, c });
        shapes = shuf(all).slice(0, 6); key = s => dir * s.s * 10 + (s.c === 'rood' ? 0 : 1);
      } else {
        const all = []; for (const s of [3, 4, 5, 6]) for (const c of ['rood', 'blauw', 'groen']) all.push({ s, c });
        shapes = shuf(all).slice(0, 7); corder = shuf(['rood', 'blauw', 'groen']); key = s => corder.indexOf(s.c) * 100 + dir * s.s;
      }
      const order = shapes.map((_, i) => i).sort((a, b) => key(shapes[a]) - key(shapes[b]));
      return { type: 'shapes', L, dir, corder, shapes, order };
    },
    mount(b, p, x) {
      const ASC = p.dir > 0;
      const rule = p.L === 1 ? `Tik de vormen aan van het <b>${ASC ? 'minste naar het meeste' : 'meeste naar het minste'}</b> aantal hoeken.`
        : p.L === 2 ? `Tik de vormen aan van het <b>${ASC ? 'minste naar het meeste' : 'meeste naar het minste'}</b> aantal hoeken. Hebben twee vormen evenveel hoeken, dan komt de <b>rode</b> vorm eerst.`
          : `Tik eerst alle <b>${ADJ[p.corder[0]]}</b> vormen aan, dan alle <b>${ADJ[p.corder[1]]}</b> en als laatste de <b>${ADJ[p.corder[2]]}</b>. Binnen één kleur ga je van <b>${ASC ? 'weinig naar veel' : 'veel naar weinig'}</b> hoeken.`;
      b.innerHTML = `<p class="pz-intro pz-rule">${rule} Je hebt <b>één kans</b>.</p>
        <div class="pz-shapes">${p.shapes.map((s, i) => `<button type="button" class="pz-shape" data-i="${i}" aria-label="${s.s} hoeken, ${s.c}"><svg viewBox="0 0 72 72"><polygon points="${polyPts(s.s)}" fill="${HEX[s.c]}" stroke="#10202b" stroke-width="2"/></svg><em></em></button>`).join('')}</div>`;
      const btns = [...b.querySelectorAll('.pz-shape')], hearts = b.querySelector('.pz-hearts'); let nxt = 0, lives = 1;
      const drawH = () => { hearts.textContent = '♥'.repeat(lives) + '♡'.repeat(1 - lives); }; drawH();
      btns.forEach(e => {
        e.onclick = () => {
          if (x.ended || e.classList.contains('picked')) return;
          if (+e.dataset.i === p.order[nxt]) { e.classList.add('picked'); e.querySelector('em').textContent = nxt + 1; nxt++; if (nxt === p.order.length) x.end(true); }
          else { lives--; drawH(); nxt = 0; btns.forEach(z => { z.classList.remove('picked'); z.querySelector('em').textContent = ''; }); if (lives <= 0) x.end(false);  }
        };
      });
    }
  };

  /* ---------- 7. Kleurcode kraken (Mastermind) ---------- */
  const MCOL = [['rood', '#d64545'], ['blauw', '#2d7dff'], ['groen', '#2f9e63'], ['geel', '#f2c200'], ['paars', '#8e44ad'], ['oranje', '#ff8a1f']];
  const mmFeedback = (secret, g) => {
    let black = 0; const cs = {}, cg = {};
    g.forEach((c, i) => { if (c === secret[i]) black++; cs[secret[i]] = (cs[secret[i]] || 0) + 1; cg[c] = (cg[c] || 0) + 1; });
    let tot = 0; for (const c in cg) tot += Math.min(cg[c], cs[c] || 0);
    return [black, tot - black];
  };
  T.mastermind = {
    name: 'Kleurcode kraken',
    make(L) {
      const colors = [5, 6, 6][L - 1], slots = 4, rep = L >= 3, tries = [10, 9, 9][L - 1];
      const secret = rep ? Array.from({ length: slots }, () => R(colors)) : shuf([...Array(colors).keys()]).slice(0, slots);
      return { type: 'mastermind', L, colors, slots, rep, tries, secret };
    },
    mount(b, p, x) {
      const g = Array(p.slots).fill(-1); let left = p.tries;
      b.innerHTML = `<p class="pz-intro">Kraak de geheime kleurcode van <b>${p.slots}</b> kleuren (van links naar rechts). Er zijn <b>${p.colors}</b> kleuren${p.rep ? '; een kleur mag vaker voorkomen' : '; elke kleur komt maar één keer voor'}. Tik op een rondje om de kleur te veranderen.
        Na elke poging zie je: <b>●</b> = juiste kleur op de juiste plek, <b>○</b> = juiste kleur op de verkeerde plek. Je hebt <b>${p.tries}</b> pogingen.</p>
        <div class="pz-hist"></div><div class="pz-row pz-cur">${g.map((_, i) => `<button type="button" class="pz-peg" data-s="${i}" aria-label="Plek ${i + 1}"></button>`).join('')}</div>
        <button type="button" class="primary" id="pz-go">Controleer</button><div class="pz-count"></div>`;
      const pegs = [...b.querySelectorAll('.pz-cur .pz-peg')], hist = b.querySelector('.pz-hist'), cnt = b.querySelector('.pz-count');
      const draw = () => { pegs.forEach((e, i) => { e.style.setProperty('--c', g[i] < 0 ? '#dfe6ea' : MCOL[g[i]][1]); e.title = g[i] < 0 ? 'leeg' : MCOL[g[i]][0]; e.dataset.v = g[i]; }); cnt.textContent = `Pogingen over: ${left}`; };
      pegs.forEach(e => { e.onclick = () => { if (x.ended) return; const i = +e.dataset.s; g[i] = (g[i] + 1) % p.colors; draw(); }; });
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        if (g.some(v => v < 0)) return x.msg('Kies eerst alle kleuren.');
        if (!p.rep && new Set(g).size < g.length) return x.msg('Elke kleur mag maar één keer.');
        const [bl, wh] = mmFeedback(p.secret, g);
        const row = document.createElement('div'); row.className = 'pz-row pz-old';
        row.innerHTML = g.map(v => `<span class="pz-peg" style="--c:${MCOL[v][1]}"></span>`).join('') + `<span class="pz-fb" data-b="${bl}" data-w="${wh}">● ${bl}  ○ ${wh}</span>`;
        hist.appendChild(row); left--;
        if (bl === p.slots) return x.end(true);
        if (left <= 0) return x.end(false);
        x.msg(''); draw();
      };
      draw();
    }
  };

  /* ---------- 8. Geheugenkaartjes ---------- */
  const MSYM = ['▲', '●', '■', '★', '♥', '♣', '♠', '♦', '☀', '☂', '☎', '✿', '☾', '♫'];
  T.memory = {
    name: 'Geheugenkaartjes',
    make(L) {
      const pairs = [6, 8, 10][L - 1], cols = [3, 4, 4][L - 1], syms = shuf(MSYM).slice(0, pairs);
      return { type: 'memory', L, cols, cards: shuf([...syms, ...syms]), max: [10, 10, 12][L - 1] };
    },
    mount(b, p, x) {
      b.innerHTML = `<p class="pz-intro">Draai twee kaartjes om. Zijn ze gelijk, dan blijven ze open. Vind alle paren. Je mag maximaal <b>${p.max}</b> keer een fout paar omdraaien.</p>
        <div class="pz-grid" style="grid-template-columns:repeat(${p.cols},1fr)">${p.cards.map((_, i) => `<button type="button" class="pz-card" data-i="${i}" aria-label="Kaartje ${i + 1}">?</button>`).join('')}</div><div class="pz-count"></div>`;
      const btns = [...b.querySelectorAll('.pz-card')], cnt = b.querySelector('.pz-count'); let open = [], lock = false, miss = 0, found = 0;
      const draw = () => { cnt.textContent = `Fouten: ${miss} van ${p.max}`; }; draw();
      btns.forEach(e => {
        e.onclick = async () => {
          const i = +e.dataset.i;
          if (x.ended || lock || open.includes(i) || e.classList.contains('done')) return;
          e.classList.add('open'); e.textContent = p.cards[i]; open.push(i);
          if (open.length < 2) return;
          lock = true; const [a, c] = open; open = [];
          await wait(650); if (x.ended) return;
          if (p.cards[a] === p.cards[c]) { [a, c].forEach(k => { btns[k].classList.remove('open'); btns[k].classList.add('done'); }); found++; if (found === p.cards.length / 2) return x.end(true); }
          else { [a, c].forEach(k => { btns[k].classList.remove('open'); btns[k].textContent = '?'; }); miss++; draw(); if (miss >= p.max) return x.end(false); }
          lock = false;
        };
      });
    }
  };

  /* ---------- 9. Binaire schakelaars ---------- */
  T.binary = {
    name: 'Binaire schakelaars',
    make(L) {
      const bits = [6, 7, 8][L - 1]; let target, expr = '';
      if (L === 1) target = ri(9, 63); else if (L === 2) target = ri(20, 127);
      else { const a = ri(3, 9), c = ri(5, 17), d = ri(10, 60); target = a * c + d; expr = `${a} × ${c} + ${d}`; }
      return { type: 'binary', L, bits, target, expr };
    },
    mount(b, p, x) {
      const vals = Array.from({ length: p.bits }, (_, i) => 2 ** (p.bits - 1 - i)), on = vals.map(() => false); let tries = 1;
      b.innerHTML = `<p class="pz-intro">Elke schakelaar heeft een waarde. Zet de schakelaars zo dat de waarden van de schakelaars die <b>AAN</b> staan samen precies ${p.expr ? `de uitkomst van <b>${p.expr}</b>` : 'het doelgetal'} vormen.${p.expr ? '' : ` Doelgetal: <b class="pz-target">${p.target}</b>.`} Je hebt <b>één</b> poging.</p>
        <div class="pz-bits">${vals.map((v, i) => `<div class="pz-bit"><button type="button" data-i="${i}" aria-label="Waarde ${v}" aria-pressed="false">UIT</button><span>${v}</span></div>`).join('')}</div>
        <button type="button" class="primary" id="pz-go">Bevestig</button>`;
      const btns = [...b.querySelectorAll('.pz-bit button')];
      btns.forEach(e => { e.onclick = () => { if (x.ended) return; const i = +e.dataset.i; on[i] = !on[i]; e.classList.toggle('on', on[i]); e.textContent = on[i] ? 'AAN' : 'UIT'; e.setAttribute('aria-pressed', on[i]); }; });
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        const sum = vals.reduce((s, v, i) => s + (on[i] ? v : 0), 0);
        if (sum === p.target) return x.end(true);
        tries--; if (tries <= 0) return x.end(false); x.msg('');
      };
    }
  };

  /* ---------- 10. Draaischijf ---------- */
  const dialAnswer = p => {
    let pos = p.start; p.moves.forEach(m => { pos = (pos + (m === 'R' ? 1 : 3)) % 4; });
    if (odd(p)) pos += p.k1; if (p.rules.lamp && p.lamp) pos += p.k2; if (p.rules.bat && p.bat === p.n) pos += 2;
    return ((pos % 4) + 4) % 4;
  };
  T.dial = {
    name: 'Draaischijf',
    make(L) {
      return { type: 'dial', L, ...info(), start: R(4), moves: Array.from({ length: [3, 4, 5][L - 1] }, () => pick(['L', 'R'])),
        rules: { lamp: L >= 2, bat: L >= 3 }, k1: pick([-2, -1, 1, 2, 3]), k2: pick([-3, -2, -1, 1, 2, 3]), n: ri(1, 4) };
    },
    mount(b, p, x) {
      let pos = p.start; const ans = dialAnswer(p), dirTxt = k => `${steps(k)} ${k > 0 ? 'rechtsom (R)' : 'linksom (L)'}`;
      b.innerHTML = infoBar(p) + `<p class="pz-intro">De wijzer staat nu op <b>${DIRS[p.start]}</b>. De richtingen lopen rechtsom: NOORD → OOST → ZUID → WEST → NOORD. <b>R</b> = één stap rechtsom, <b>L</b> = één stap linksom. Je hebt één kans.</p>
        <ol class="pz-rules"><li>Voer deze bewegingen in volgorde uit: <b>${p.moves.join(' → ')}</b></li>
        <li>Is het serienummer <b>oneven</b>? Draai dan nog ${dirTxt(p.k1)}. Is het even? Doe niets.</li>
        ${p.rules.lamp ? `<li>Brandt het lampje <b>AAN</b>? Draai dan nog ${dirTxt(p.k2)}. Is het uit? Doe niets.</li>` : ''}
        ${p.rules.bat ? `<li>Heb je <b>precies ${p.n}</b> batterij${p.n === 1 ? '' : 'en'}? Draai dan nog een halve slag (2 stappen). Anders: doe niets.</li>` : ''}
        <li>Zet de wijzer op de eindrichting en druk op Bevestig.</li></ol>
        <div class="pz-dial" style="--a:${pos * 90}deg"><span class="n">N</span><span class="o">O</span><span class="z">Z</span><span class="w">W</span></div>
        <div class="pz-dirtxt">${DIRS[pos]}</div>
        <div class="row"><button type="button" class="ghost" id="pz-l" aria-label="Linksom">◀</button><button type="button" class="ghost" id="pz-r" aria-label="Rechtsom">▶</button></div>
        <button type="button" class="primary" id="pz-go">Bevestig</button>`;
      const dial = b.querySelector('.pz-dial'), txt = b.querySelector('.pz-dirtxt'); let turns = pos;
      const draw = () => { dial.style.setProperty('--a', turns * 90 + 'deg'); txt.textContent = DIRS[((turns % 4) + 4) % 4]; };
      b.querySelector('#pz-l').onclick = () => { if (!x.ended) { turns--; draw(); } };
      b.querySelector('#pz-r').onclick = () => { if (!x.ended) { turns++; draw(); } };
      b.querySelector('#pz-go').onclick = () => { if (!x.ended) x.end((((turns % 4) + 4) % 4) === ans); };
    }
  };

  /* ---------- 11. Torens van Hanoi ---------- */
  T.hanoi = {
    name: 'Torens van Hanoi',
    make(L) { return { type: 'hanoi', L, n: [3, 4, 5][L - 1] }; },
    mount(b, p, x) {
      const pegs = [Array.from({ length: p.n }, (_, i) => p.n - i), [], []]; let sel = -1, moves = 0;
      b.innerHTML = `<p class="pz-intro">Verplaats de hele toren van de <b>linker</b> naar de <b>rechter</b> paal. Tik op een paal om de bovenste schijf te kiezen en tik daarna op de paal waar hij heen moet. Je mag maar één schijf tegelijk verplaatsen en nooit een grotere schijf op een kleinere leggen. Minimaal ${2 ** p.n - 1} zetten.</p>
        <div class="pz-pegs">${[0, 1, 2].map(i => `<button type="button" class="pz-pegcol" data-p="${i}" aria-label="Paal ${i + 1}"></button>`).join('')}</div><div class="pz-count"></div>`;
      const cols = [...b.querySelectorAll('.pz-pegcol')], cnt = b.querySelector('.pz-count');
      const draw = () => { cols.forEach((c, i) => { c.classList.toggle('sel', sel === i); c.innerHTML = pegs[i].map(d => `<i class="pz-disc" data-d="${d}" style="width:${28 + d * (60 / p.n)}%"></i>`).join(''); }); cnt.textContent = `Zetten: ${moves}`; };
      cols.forEach(c => {
        c.onclick = () => {
          if (x.ended) return; const i = +c.dataset.p;
          if (sel < 0) { if (pegs[i].length) sel = i; }
          else if (sel === i) sel = -1;
          else {
            const d = pegs[sel][pegs[sel].length - 1], top = pegs[i][pegs[i].length - 1];
            if (!top || d < top) { pegs[i].push(pegs[sel].pop()); moves++; sel = -1; if (pegs[2].length === p.n) { draw(); return x.end(true); } }
            else { x.msg('Een grotere schijf mag niet op een kleinere.'); sel = -1; }
          }
          draw();
        };
      });
      draw();
    }
  };

  /* ---------- 12. Codepaneel (rekenen met serienummer) ---------- */
  const keypadAnswer = p => {
    const last = +p.sn.slice(-1); let s = p.d.reduce((t, v, i) => t + v * p.w[i], 0);
    if (p.L >= 2) s *= p.bat;
    s += odd(p) ? p.a1 * last : -p.a2 * last;
    if (p.L >= 3) s += p.lamp ? p.a3 : -p.a4;
    return String(Math.abs(s) % 10000).padStart(4, '0');
  };
  T.keypad = {
    name: 'Codepaneel',
    make(L) { return { type: 'keypad', L, ...info(), d: Array.from({ length: 4 }, () => ri(1, 9)), w: shuf([1, 2, 3, 4]), a1: ri(2, 5), a2: ri(1, 4), a3: ri(5, 15), a4: ri(2, 9) }; },
    mount(b, p, x) {
      const stepsL = [
        `Vermenigvuldig elk cijfer met zijn gewicht (zie onder) en tel de vier uitkomsten op.`,
        ...(p.L >= 2 ? [`Vermenigvuldig het totaal met het aantal batterijen (${p.bat}).`] : []),
        `Is het serienummer <b>oneven</b>? Tel dan ${p.a1} × het laatste cijfer van het serienummer erbij op. Is het <b>even</b>? Trek dan ${p.a2} × het laatste cijfer ervan af.`,
        ...(p.L >= 3 ? [`Brandt het lampje <b>AAN</b>? Tel dan ${p.a3} erbij op. Is het <b>UIT</b>? Trek dan ${p.a4} ervan af.`] : []),
        `Is de uitkomst negatief? Maak hem positief. Gebruik de <b>laatste vier cijfers</b>; vul links aan met nullen (83 wordt 0083).`,
        `Toets de code in en druk op OK. Je hebt één poging.`];
      b.innerHTML = infoBar(p) + `<div class="pz-digits">${p.d.map((v, i) => `<span><b>${v}</b><small>× ${p.w[i]}</small></span>`).join('')}</div>
        <ol class="pz-rules">${stepsL.map(s => `<li>${s}</li>`).join('')}</ol><div class="pz-entry" id="pz-e">····</div>
        <div class="pz-pad9">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}<button type="button" data-k="del" aria-label="Wis">⌫</button><button type="button" data-k="0">0</button><button type="button" data-k="ok" class="ok">OK</button></div>`;
      let v = '', tries = 1; const ans = keypadAnswer(p), ent = b.querySelector('#pz-e');
      const draw = () => { ent.textContent = (v + '····').slice(0, 4); };
      b.querySelectorAll('.pz-pad9 button').forEach(e => {
        e.onclick = () => {
          if (x.ended) return; const k = e.dataset.k;
          if (k === 'del') v = v.slice(0, -1);
          else if (k === 'ok') { if (v.length < 4) return x.msg('Toets 4 cijfers in.'); if (v === ans) return x.end(true); tries--; if (tries <= 0) return x.end(false); x.msg(''); v = ''; }
          else if (v.length < 4) v += k;
          draw();
        };
      });
    }
  };

  /* ---------- 13. Morselamp ---------- */
  const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..' };
  const MWORDS = { 3: ['SOS', 'KEY', 'DOT', 'ZIP', 'MAP', 'BUS', 'SUN'], 4: ['CODE', 'BOMB', 'SAFE', 'FUSE', 'DIAL', 'WORD', 'MIND'], 5: ['ALARM', 'START', 'NIGHT', 'LIGHT', 'TRAIL', 'PIRAT'] };
  T.morse = {
    name: 'Morselamp',
    make(L) { return { type: 'morse', L, word: pick(MWORDS[[3, 4, 5][L - 1]]) }; },
    mount(b, p, x) {
      b.innerHTML = `<p class="pz-intro">De lamp knippert een woord in morsecode (kort = punt, lang = streep, een langere pauze tussen letters). Tik op Afspelen, kijk goed en typ het woord (in hoofdletters of kleine letters). Je mag zo vaak afspelen als je wilt, maar je kunt het woord maar <b>één keer</b> invullen.</p>
        <div class="pz-lampbig" id="pz-lamp"></div><button type="button" class="ghost" id="pz-play">▶ Afspelen</button>
        <input type="text" id="pz-in" placeholder="Jouw woord" autocomplete="off" autocapitalize="characters"><button type="button" class="primary" id="pz-go">Controleer</button>
        <details class="pz-tab"><summary>Morsetabel</summary><div class="pz-morse">${Object.keys(MORSE).map(k => `${k} <code>${MORSE[k]}</code>`).join(' &nbsp; ')}</div></details>`;
      const lamp = b.querySelector('#pz-lamp'), play = b.querySelector('#pz-play'); let busy = false, tries = 1;
      play.onclick = async () => {
        if (busy || x.ended) return; busy = true; play.disabled = true;
        for (const ch of p.word) {
          for (const s of MORSE[ch]) {
            if (x.ended) break; if (window.__pzMorse) window.__pzMorse.push(s);
            lamp.classList.add('on'); await wait(s === '.' ? 250 : 750); lamp.classList.remove('on'); await wait(250);
          }
          if (window.__pzMorse) window.__pzMorse.push('/'); await wait(700);
        }
        busy = false; if (!x.ended) play.disabled = false;
      };
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return; const v = b.querySelector('#pz-in').value.trim().toUpperCase(); if (!v) return;
        if (v === p.word) return x.end(true);
        tries--; if (tries <= 0) return x.end(false); x.msg('');
      };
    }
  };

  /* ---------- 14. Schakelaars ---------- */
  const switchAnswer = p => {
    const parity = (p.states.filter(Boolean).length + p.bat + (odd(p) ? 1 : 0) + (p.lamp ? 2 : 0)) % 2;
    const a = p.states.map((_, i) => (i % 2 === 0) === (parity === 0)); p.flips.forEach(i => { a[i] = !a[i]; }); return a;
  };
  T.switches = {
    name: 'Schakelaars',
    make(L) { return { type: 'switches', L, ...info(), states: Array.from({ length: 5 }, () => R(2) === 1), flips: shuf([0, 1, 2, 3, 4]).slice(0, L).sort() }; },
    mount(b, p, x) {
      const st = p.states.slice(), ans = switchAnswer(p);
      b.innerHTML = infoBar(p) + `<ol class="pz-rules"><li>Tel hoeveel schakelaars <b>nu AAN</b> staan.</li>
        <li>Tel daar het aantal batterijen (${p.bat}) bij op. Is het serienummer <b>oneven</b>? Tel er 1 bij op. Brandt het lampje <b>AAN</b>? Tel er 2 bij op.</li>
        <li>Is het totaal <b>even</b>? Zet schakelaar 1, 3 en 5 <b>AAN</b> en 2 en 4 <b>UIT</b>. Is het totaal <b>oneven</b>? Doe precies het omgekeerde.</li>
        <li>Draai daarna ook schakelaar${p.flips.length === 1 ? '' : 's'} <b>${p.flips.map(i => i + 1).join(' en ')}</b> om (AAN wordt UIT en UIT wordt AAN).</li>
        <li>Druk op Bevestig. Je hebt één kans.</li></ol>
        <div class="pz-bits">${st.map((v, i) => `<div class="pz-bit"><button type="button" data-i="${i}" class="${v ? 'on' : ''}" aria-pressed="${v}" aria-label="Schakelaar ${i + 1}">${v ? 'AAN' : 'UIT'}</button><span>${i + 1}</span></div>`).join('')}</div>
        <button type="button" class="primary" id="pz-go">Bevestig</button>`;
      b.querySelectorAll('.pz-bit button').forEach(e => { e.onclick = () => { if (x.ended) return; const i = +e.dataset.i; st[i] = !st[i]; e.classList.toggle('on', st[i]); e.textContent = st[i] ? 'AAN' : 'UIT'; e.setAttribute('aria-pressed', st[i]); }; });
      b.querySelector('#pz-go').onclick = () => { if (!x.ended) x.end(st.every((v, i) => v === ans[i])); };
    }
  };

  /* ====================================================================
     ECHTE DENKPUZZELS: sudoku, nonogram, logica-raadsel, lettersom, wolkenkrabbers.
     Elke puzzel wordt willekeurig gemaakt en heeft precies één oplossing (lettersom: elke geldige som telt).
     ==================================================================== */
  const range = n => Array.from({ length: n }, (_, i) => i);
  const plural = n => `${n} poging${n === 1 ? '' : 'en'}`;
  const triesFor = () => 1;

  /* ---------- 15. Sudoku ---------- */
  function sdkCount(g, n, br, bc, limit, randomize) {
    const rows = Array(n).fill(0), cols = Array(n).fill(0), boxes = Array(n).fill(0), a = g.slice();
    const bi = i => Math.floor(Math.floor(i / n) / br) * (n / bc) + Math.floor((i % n) / bc);
    for (let i = 0; i < n * n; i++) if (a[i]) { const m = 1 << a[i]; rows[Math.floor(i / n)] |= m; cols[i % n] |= m; boxes[bi(i)] |= m; }
    const full = (1 << (n + 1)) - 2; let count = 0, first = null;
    (function rec() {
      if (count >= limit) return;
      let best = -1, bm = 0, bn = 99;
      for (let i = 0; i < n * n; i++) if (!a[i]) {
        const m = full & ~(rows[Math.floor(i / n)] | cols[i % n] | boxes[bi(i)]);
        let k = 0, t = m; while (t) { t &= t - 1; k++; }
        if (k < bn) { bn = k; best = i; bm = m; if (k <= 1) break; }
      }
      if (best < 0) { count++; if (!first) first = a.slice(); return; }
      if (!bn) return;
      let ds = []; for (let d = 1; d <= n; d++) if (bm & (1 << d)) ds.push(d);
      if (randomize) ds = shuf(ds);
      const r = Math.floor(best / n), c = best % n, b = bi(best);
      for (const d of ds) {
        const m = 1 << d; a[best] = d; rows[r] |= m; cols[c] |= m; boxes[b] |= m;
        rec();
        a[best] = 0; rows[r] &= ~m; cols[c] &= ~m; boxes[b] &= ~m;
        if (count >= limit) return;
      }
    })();
    return { count, first };
  }
  function sdkGroups(n, br, bc) {
    const gs = [];
    for (let r = 0; r < n; r++) gs.push(range(n).map(c => r * n + c));
    for (let c = 0; c < n; c++) gs.push(range(n).map(r => r * n + c));
    for (let R = 0; R < n / br; R++) for (let C = 0; C < n / bc; C++) { const g = []; for (let r = 0; r < br; r++) for (let c = 0; c < bc; c++) g.push((R * br + r) * n + C * bc + c); gs.push(g); }
    return gs;
  }
  function sdkBad(g, groups) {
    const bad = new Set();
    groups.forEach(grp => { const seen = {}; grp.forEach(i => { if (g[i]) (seen[g[i]] = seen[g[i]] || []).push(i); }); Object.values(seen).forEach(l => { if (l.length > 1) l.forEach(i => bad.add(i)); }); });
    return bad;
  }
  T.sudoku = {
    name: 'Sudoku',
    make(L) {
      const [n, br, bc, blanks] = [[4, 2, 2, 8], [6, 2, 3, 20], [9, 3, 3, 46]][L - 1];
      const sol = sdkCount(Array(n * n).fill(0), n, br, bc, 1, true).first, given = sol.slice();
      let removed = 0;
      for (const i of shuf(range(n * n))) {
        if (removed >= blanks) break;
        const keep = given[i]; given[i] = 0;
        if (sdkCount(given, n, br, bc, 2, false).count === 1) removed++; else given[i] = keep;
      }
      return { type: 'sudoku', L, n, br, bc, given, sol };
    },
    mount(b, p, x) {
      const { n, br, bc } = p, g = p.given.slice(), groups = sdkGroups(n, br, bc), live = false; let sel = -1, tries = triesFor(p.L);
      const cells = range(n * n).map(i => { const r = Math.floor(i / n), c = i % n; return `<button type="button" class="pz-sd${p.given[i] ? ' g' : ''}${(c + 1) % bc === 0 && c < n - 1 ? ' br' : ''}${(r + 1) % br === 0 && r < n - 1 ? ' bb' : ''}" data-i="${i}" aria-label="Vakje ${r + 1}, ${c + 1}"></button>`; }).join('');
      b.innerHTML = `<p class="pz-intro">Vul het rooster zo in dat in elke <b>rij</b>, elke <b>kolom</b> en elk <b>vak</b> (de dikke lijnen) de cijfers <b>1 t/m ${n}</b> precies één keer staan. Tik op een leeg vakje en kies een cijfer. Fouten worden niet gemarkeerd.Je kunt één keer bevestigen.</p>
        <div class="pz-sdk" style="grid-template-columns:repeat(${n},1fr)">${cells}</div>
        <div class="pz-npad">${range(n).map(i => `<button type="button" data-n="${i + 1}">${i + 1}</button>`).join('')}<button type="button" data-n="0" aria-label="Wis">⌫</button></div>
        <button type="button" class="primary" id="pz-go">Bevestig</button>`;
      const btns = [...b.querySelectorAll('.pz-sd')];
      const draw = () => { const bad = live ? sdkBad(g, groups) : new Set(); btns.forEach((e, i) => { e.textContent = g[i] || ''; e.classList.toggle('sel', sel === i); e.classList.toggle('bad', bad.has(i)); }); };
      btns.forEach((e, i) => { e.onclick = () => { if (!x.ended) { sel = i; draw(); } }; });
      b.querySelectorAll('.pz-npad button').forEach(e => { e.onclick = () => { if (x.ended || sel < 0 || p.given[sel]) return; g[sel] = +e.dataset.n; draw(); }; });
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        if (g.some(v => !v)) return x.msg('Er zijn nog lege vakjes.');
        if (sdkBad(g, groups).size === 0) return x.end(true);
        if (--tries <= 0) return x.end(false);
        x.msg(''); draw();
      };
      draw();
    }
  };

  /* ---------- 16. Nonogram ---------- */
  const runsOf = a => { const r = []; let c = 0; for (const v of a) { if (v) c++; else if (c) { r.push(c); c = 0; } } if (c) r.push(c); return r.length ? r : [0]; };
  const sameArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  function nonoPatterns(clue, n) {
    if (clue.length === 1 && clue[0] === 0) return [Array(n).fill(0)];
    const out = [];
    const rec = (k, cur) => {
      if (k === clue.length) { out.push(cur.concat(Array(n - cur.length).fill(0))); return; }
      const rest = clue.slice(k + 1).reduce((s, v) => s + v + 1, 0);
      for (let s = cur.length; s + clue[k] + rest <= n; s++) {
        const nxt = cur.concat(Array(s - cur.length).fill(0), Array(clue[k]).fill(1));
        if (k < clue.length - 1) nxt.push(0);
        rec(k + 1, nxt);
      }
    };
    rec(0, []);
    return out;
  }
  function nonoColOk(cells, clue, n) {
    const runs = []; let c = 0;
    for (const v of cells) { if (v) c++; else if (c) { runs.push(c); c = 0; } }
    const cl = clue[0] === 0 ? [] : clue;
    for (let i = 0; i < runs.length; i++) if (cl[i] !== runs[i]) return false;
    const k = runs.length;
    if (c && (k >= cl.length || c > cl[k])) return false;
    const rem = cl.slice(k);
    return rem.reduce((s, v) => s + v, 0) - c + Math.max(0, rem.length - 1) <= n - cells.length;
  }
  function nonoCount(rowC, colC, n, limit) {
    const pats = rowC.map(c => nonoPatterns(c, n)), grid = []; let count = 0;
    (function rec(r) {
      if (count >= limit) return;
      if (r === n) { if (colC.every((c, j) => sameArr(runsOf(grid.map(row => row[j])), c))) count++; return; }
      for (const pt of pats[r]) {
        grid.push(pt);
        if (colC.every((c, j) => nonoColOk(grid.map(row => row[j]), c, n))) rec(r + 1);
        grid.pop();
        if (count >= limit) return;
      }
    })(0);
    return count;
  }
  T.nonogram = {
    name: 'Nonogram',
    make(L) {
      const n = [5, 7, 8][L - 1]; let rowC, colC, gsol;
      for (let t = 0; t < 400; t++) {
        const dens = 0.5 + Math.random() * 0.15, g = range(n).map(() => range(n).map(() => (Math.random() < dens ? 1 : 0)));
        rowC = g.map(runsOf); colC = range(n).map(j => runsOf(g.map(r => r[j])));
        if (rowC.some(c => c[0] === 0) || colC.some(c => c[0] === 0)) continue;
        if (nonoCount(rowC, colC, n, 2) === 1) { gsol = g; break; }
        gsol = g;
      }
      return { type: 'nonogram', L, n, rows: rowC, cols: colC, sol: gsol };
    },
    mount(b, p, x) {
      const { n } = p, st = Array(n * n).fill(0), hints = false; let tries = triesFor(p.L);
      const col = j => range(n).map(i => (st[i * n + j] === 1 ? 1 : 0)), row = i => range(n).map(j => (st[i * n + j] === 1 ? 1 : 0));
      let html = '<span></span>' + p.cols.map((c, j) => `<div class="pz-nc" data-c="${j}">${c.map(v => `<span>${v}</span>`).join('')}</div>`).join('');
      for (let i = 0; i < n; i++) html += `<div class="pz-nr" data-r="${i}">${p.rows[i].map(v => `<span>${v}</span>`).join('')}</div>` + range(n).map(j => `<button type="button" class="pz-nb" data-i="${i * n + j}" aria-label="Vakje ${i + 1}, ${j + 1}"></button>`).join('');
      b.innerHTML = `<p class="pz-intro">De getallen bij een rij of kolom zeggen hoe lang de aaneengesloten <b>zwarte blokken</b> zijn, van links naar rechts en van boven naar beneden. Tussen twee blokken ligt minstens één leeg vakje. Vul het raster zo in dat alle getallen kloppen. Tik één keer om te kleuren, twee keer voor een ✕ (alleen een notitie), drie keer om te wissen. Je kunt één keer bevestigen.</p>
        <div class="pz-nono" style="grid-template-columns:auto repeat(${n},1fr)">${html}</div><button type="button" class="primary" id="pz-go">Bevestig</button>`;
      const btns = [...b.querySelectorAll('.pz-nb')], rowEl = [...b.querySelectorAll('.pz-nr')], colEl = [...b.querySelectorAll('.pz-nc')];
      const okRow = i => sameArr(runsOf(row(i)), p.rows[i]), okCol = j => sameArr(runsOf(col(j)), p.cols[j]);
      const draw = () => {
        btns.forEach((e, i) => { e.className = 'pz-nb' + (st[i] === 1 ? ' f' : st[i] === 2 ? ' x' : ''); e.textContent = st[i] === 2 ? '✕' : ''; });
        rowEl.forEach((e, i) => e.classList.toggle('done', hints && okRow(i))); colEl.forEach((e, j) => e.classList.toggle('done', hints && okCol(j)));
      };
      btns.forEach((e, i) => { e.onclick = () => { if (x.ended) return; st[i] = (st[i] + 1) % 3; draw(); }; });
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        if (range(n).every(i => okRow(i)) && range(n).every(j => okCol(j))) return x.end(true);
        if (--tries <= 0) return x.end(false);
        x.msg('');
      };
      draw();
    }
  };

  /* ---------- 17. Logica-raadsel (wie woont waar) ---------- */
  const PETS = { hond: ['de hond', 'een hond'], kat: ['de kat', 'een kat'], vis: ['de vis', 'een vis'], konijn: ['het konijn', 'een konijn'], papegaai: ['de papegaai', 'een papegaai'], hamster: ['de hamster', 'een hamster'], schildpad: ['de schildpad', 'een schildpad'] };
  const EIN = {
    naam: { label: 'Naam', all: ['Anna', 'Bram', 'Cas', 'Daan', 'Eva', 'Fleur', 'Gijs', 'Hanna'], who: v => v, pred: v => `is ${v}`, neg: v => `is niet ${v}` },
    kleur: { label: 'Kleur', all: ['rood', 'blauw', 'groen', 'geel', 'wit', 'paars', 'oranje', 'zwart'], who: v => `de bewoner van het ${ADJ[v]} huis`, pred: v => `woont in het ${ADJ[v]} huis`, neg: v => `woont niet in het ${ADJ[v]} huis` },
    dier: { label: 'Dier', all: Object.keys(PETS), who: v => `de bewoner met ${PETS[v][0]}`, pred: v => `heeft ${PETS[v][1]}`, neg: v => `heeft geen ${v}` },
    drank: { label: 'Drank', all: ['thee', 'koffie', 'melk', 'cola', 'water', 'sap'], who: v => `de bewoner die ${v} drinkt`, pred: v => `drinkt ${v}`, neg: v => `drinkt geen ${v}` }
  };
  const einPos = (cl, asg) => {
    const P = i => asg[i[0]][i[1]];
    switch (cl.t) {
      case 'same': return P(cl.a) === P(cl.b);
      case 'pos': return P(cl.a) === cl.k;
      case 'left': return P(cl.a) + 1 === P(cl.b);
      case 'next': return Math.abs(P(cl.a) - P(cl.b)) === 1;
      case 'before': return P(cl.a) < P(cl.b);
      default: return P(cl.a) !== P(cl.b);
    }
  };
  const einMaxCat = cl => Math.max(cl.a[0], cl.b ? cl.b[0] : 0);
  const permCache = {};
  function permsOf(n) { if (permCache[n]) return permCache[n].slice(); const out = []; (function rec(cur, left) { if (!left.length) { out.push(cur); return; } left.forEach((v, i) => rec(cur.concat(v), left.filter((_, j) => j !== i))); })([], range(n)); permCache[n] = out; return out.slice(); }
  function einCount(clues, kc, n, limit) {
    const P = permsOf(n), by = range(kc).map(c => clues.filter(cl => einMaxCat(cl) === c));
    const asg = []; let count = 0;
    (function rec(c) {
      if (count >= limit) return;
      if (c === kc) { count++; return; }
      for (const pm of P) {
        asg[c] = pm;
        if (by[c].every(cl => einPos(cl, asg))) rec(c + 1);
        if (count >= limit) return;
      }
      asg.length = c;
    })(0);
    return count;
  }
  function einClue(sol, kc, n) {
    const pickItem = () => { const c = R(kc); return [c, R(n)]; };
    const at = (c, pos) => [c, sol[c].indexOf(pos)];
    const t = pick(['same', 'same', 'same', 'next', 'next', 'left', 'before', 'before', 'not', 'not', 'pos']);
    const a = pickItem(); let b = null; const pa = sol[a[0]][a[1]];
    const other = () => { let c; do { c = R(kc); } while (c === a[0]); return c; };
    if (t === 'pos') return { t, a, k: pa };
    if (t === 'same') { b = at(other(), pa); }
    else if (t === 'left') { if (pa >= n - 1) return null; b = at(other(), pa + 1); }
    else if (t === 'next') { const q = pa + (R(2) ? 1 : -1); if (q < 0 || q >= n) return null; b = at(other(), q); }
    else if (t === 'before') { if (pa >= n - 1) return null; b = at(other(), ri(pa + 1, n - 1)); }
    else { const c = other(); let v; do { v = R(n); } while (sol[c][v] === pa); b = [c, v]; }
    if ((t === 'same' || t === 'not') && a[0] > b[0]) return { t, a: b, b: a };
    return { t, a, b };
  }
  function einMake(L) {
    const n = [3, 4, 5][L - 1], kc = [3, 4, 4][L - 1];
    for (let attempt = 0; attempt < 30; attempt++) {
      const keys = ['naam', ...shuf(['kleur', 'dier', 'drank']).slice(0, kc - 1)];
      const cats = keys.map(k => ({ k, vals: shuf(EIN[k].all).slice(0, n) })), sol = cats.map(() => shuf(range(n)));
      const clues = [], key = cl => JSON.stringify(cl); let guard = 0;
      while (guard++ < 400) {
        for (let i = 0; i < 3; i++) {
          const cl = einClue(sol, kc, n);
          if (cl && !clues.some(o => key(o) === key(cl)) && !(cl.t === 'pos' && clues.filter(o => o.t === 'pos').length >= 2)) clues.push(cl);
        }
        if (einCount(clues, kc, n, 2) === 1) break;
      }
      if (guard >= 400) continue;
      const t0 = Date.now();
      for (const cl of shuf(clues)) {                              // overbodige aanwijzingen weghalen
        if (Date.now() - t0 > 700) break;
        const rest = clues.filter(o => o !== cl);
        if (einCount(rest, kc, n, 2) === 1) clues.splice(clues.indexOf(cl), 1);
      }
      return { type: 'einstein', L, n, cats, sol, clues: shuf(clues) };
    }
    throw new Error('geen logica-raadsel gemaakt');
  }
  const capf = s => s.charAt(0).toUpperCase() + s.slice(1);
  function einText(cl, cats) {
    const E = i => EIN[cats[i[0]].k], v = i => cats[i[0]].vals[i[1]], who = i => E(i).who(v(i)), a = cl.a, b = cl.b;
    switch (cl.t) {
      case 'same': return `${capf(who(a))} ${E(b).pred(v(b))}.`;
      case 'not': return `${capf(who(a))} ${E(b).neg(v(b))}.`;
      case 'pos': return `${capf(who(a))} woont in huis ${cl.k + 1}.`;
      case 'left': return `${capf(who(a))} woont direct links van ${who(b)}.`;
      case 'next': return `${capf(who(a))} woont direct naast ${who(b)}.`;
      default: return `${capf(who(a))} woont ergens links van ${who(b)}.`;
    }
  }
  T.einstein = {
    name: 'Logica-raadsel',
    make: einMake,
    mount(b, p, x) {
      const { n, cats } = p; let tries = triesFor(p.L);
      const rows = range(n).map(h => `<div class="pz-ein-row"><b>Huis ${h + 1}</b>${cats.map((c, ci) => `<select data-h="${h}" data-c="${ci}" aria-label="${EIN[c.k].label}, huis ${h + 1}"><option value="">${EIN[c.k].label}</option>${c.vals.map((v, vi) => `<option value="${vi}">${esc(v)}</option>`).join('')}</select>`).join('')}</div>`).join('');
      b.innerHTML = `<p class="pz-intro">${n} huizen staan naast elkaar, van <b>links (huis 1)</b> naar <b>rechts (huis ${n})</b>. Per huis kies je: ${cats.map(c => EIN[c.k].label.toLowerCase()).join(', ')}. Elke waarde hoort bij precies één huis. “Ergens links van” betekent: verder naar links, niet per se direct ernaast. Tik op een aanwijzing om hem door te strepen. Je kunt één keer bevestigen.</p>
        <ol class="pz-clues pz-eclues">${p.clues.map(cl => `<li>${esc(einText(cl, cats))}</li>`).join('')}</ol>${rows}
        <button type="button" class="primary" id="pz-go">Bevestig</button>`;
      b.querySelectorAll('.pz-eclues li').forEach(li => { li.onclick = () => li.classList.toggle('done'); });
      const sels = [...b.querySelectorAll('select')];
      const dup = () => cats.forEach((_, ci) => { const mine = sels.filter(s => +s.dataset.c === ci), cnt = {}; mine.forEach(s => { if (s.value !== '') cnt[s.value] = (cnt[s.value] || 0) + 1; }); mine.forEach(s => s.classList.toggle('bad', s.value !== '' && cnt[s.value] > 1)); });
      
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        if (sels.some(s => s.value === '')) return x.msg('Vul eerst alle vakjes in.');
        const ok = sels.every(s => p.sol[+s.dataset.c][+s.value] === +s.dataset.h);
        if (ok) return x.end(true);
        if (--tries <= 0) return x.end(false);
        x.msg('');
      };
    }
  };

  /* ---------- 18. Lettersom ---------- */
  T.crypto = {
    name: 'Lettersom',
    make(L) {
      const spec = [{ terms: [2, 2], minD: 5 }, { terms: [3, 3], minD: 7 }, { terms: [3, 3, 3], minD: 8 }][L - 1];
      for (let t = 0; t < 2000; t++) {
        const nums = spec.terms.map(d => ri(10 ** (d - 1), 10 ** d - 1)), sum = nums.reduce((s, v) => s + v, 0);
        const digs = [...new Set([...nums, sum].join('').split(''))];
        if (digs.length < spec.minD) continue;
        const letters = shuf('ABCDEFGHJKLMNPRSTWZ'.split('')).slice(0, digs.length), map = {}; digs.forEach((d, i) => { map[d] = letters[i]; });
        const enc = v => String(v).split('').map(c => map[c]).join('');
        const hintDigit = pick(digs);
        return { type: 'crypto', L, eq: nums.join(' + ') + ' = ' + sum, key: digs.slice().sort().map(d => map[d] + ' = ' + d).join(', '), terms: nums.map(enc), sum: enc(sum), letters: letters.slice().sort(), hint: L === 1 ? [map[hintDigit], +hintDigit] : null };
      }
      throw new Error('geen lettersom gemaakt');
    },
    mount(b, p, x) {
      const val = {}; let tries = triesFor(p.L);
      if (p.hint) val[p.hint[0]] = p.hint[1];
      const dec = w => w.split('').map(c => (val[c] === undefined ? '?' : val[c])).join('');
      const w = Math.max(...p.terms.map(t => t.length), p.sum.length);
      b.innerHTML = `<p class="pz-intro">Elke <b>letter</b> staat voor een ander <b>cijfer</b> (0 t/m 9), en verschillende letters zijn verschillende cijfers. Een getal begint nooit met een 0. Zoek bij elke letter het cijfer zodat de som klopt.${p.hint ? ` Hulp: <b>${p.hint[0]} = ${p.hint[1]}</b>.` : ''} Je kunt één keer bevestigen.</p>
        <div class="pz-cry">${p.terms.map((t, i) => `<div>${i ? '+' : '&nbsp;'} ${t.padStart(w, ' ').replace(/ /g, '&nbsp;')}</div>`).join('')}<div class="pz-crysum">= ${p.sum.padStart(w, ' ').replace(/ /g, '&nbsp;')}</div></div>
        <div class="pz-crydec" aria-live="polite"></div>
        <div class="pz-cryin">${p.letters.map(l => `<label><b>${l}</b><select data-l="${l}"${p.hint && p.hint[0] === l ? ' disabled' : ''}><option value="">?</option>${range(10).map(d => `<option value="${d}"${val[l] === d ? ' selected' : ''}>${d}</option>`).join('')}</select></label>`).join('')}</div>
        <button type="button" class="primary" id="pz-go">Bevestig</button>`;
      const decEl = b.querySelector('.pz-crydec');
      const draw = () => { decEl.textContent = p.terms.map(dec).join(' + ') + ' = ' + dec(p.sum); };
      b.querySelectorAll('.pz-cryin select').forEach(s => { s.onchange = () => { if (s.value === '') delete val[s.dataset.l]; else val[s.dataset.l] = +s.value; draw(); }; });
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        if (p.letters.some(l => val[l] === undefined)) return x.msg('Kies bij elke letter een cijfer.');
        const used = p.letters.map(l => val[l]);
        const num = wd => +wd.split('').map(c => val[c]).join('');
        const ok = new Set(used).size === used.length && [...p.terms, p.sum].every(t => val[t[0]] !== 0) && p.terms.reduce((s, t) => s + num(t), 0) === num(p.sum);
        if (ok) return x.end(true);
        if (--tries <= 0) return x.end(false);
        x.msg('');
      };
      draw();
    }
  };

  /* ---------- 19. Wolkenkrabbers ---------- */
  const seen = line => { let m = 0, c = 0; for (const v of line) if (v > m) { m = v; c++; } return c; };
  function twCount(n, clues, limit) {                          // clues = {top,bottom,left,right}, 0 = onbekend
    const all = permsOf(n).map(p => p.map(v => v + 1)), rowOpts = range(n).map(r => all.filter(pm => (!clues.left[r] || seen(pm) === clues.left[r]) && (!clues.right[r] || seen(pm.slice().reverse()) === clues.right[r])));
    const grid = []; let count = 0;
    const colOk = (j, done) => {
      const col = grid.map(r => r[j]);
      if (new Set(col).size !== col.length) return false;
      if (clues.top[j] && (seen(col) > clues.top[j] || seen(col) + (n - col.length) < clues.top[j])) return false;
      if (done) return (!clues.top[j] || seen(col) === clues.top[j]) && (!clues.bottom[j] || seen(col.slice().reverse()) === clues.bottom[j]);
      return true;
    };
    (function rec(r) {
      if (count >= limit) return;
      if (r === n) { count++; return; }
      for (const pm of rowOpts[r]) {
        grid.push(pm);
        if (range(n).every(j => colOk(j, r === n - 1))) rec(r + 1);
        grid.pop();
        if (count >= limit) return;
      }
    })(0);
    return count;
  }
  T.towers = {
    name: 'Wolkenkrabbers',
    make(L) {
      const n = [4, 5, 5][L - 1], maxRemove = [6, 8, 11][L - 1];
      const empty = { top: Array(n).fill(0), bottom: Array(n).fill(0), left: Array(n).fill(0), right: Array(n).fill(0) };
      let grid, clues;
      for (let attempt = 0; attempt < 40; attempt++) {              // alleen een rooster waarvan de randgetallen al één oplossing geven
        grid = []; (function rec(r) {                               // willekeurig latijns vierkant
          if (r === n) return true;
          for (const pm of shuf(permsOf(n))) { const row = pm.map(v => v + 1); if (grid.every(g => g.every((v, j) => v !== row[j]))) { grid.push(row); if (rec(r + 1)) return true; grid.pop(); } }
          return false;
        })(0);
        const col = j => grid.map(r => r[j]);
        clues = { top: range(n).map(j => seen(col(j))), bottom: range(n).map(j => seen(col(j).reverse())), left: grid.map(r => seen(r)), right: grid.map(r => seen(r.slice().reverse())) };
        if (twCount(n, clues, 2) === 1) break;
      }
      let removed = 0; const t0 = Date.now();
      for (const [side, i] of shuf(['top', 'bottom', 'left', 'right'].flatMap(s => range(n).map(i => [s, i])))) {
        if (removed >= maxRemove || Date.now() - t0 > 500) break;
        const keep = clues[side][i]; clues[side][i] = 0;
        if (twCount(n, clues, 2) === 1) removed++; else clues[side][i] = keep;
      }
      return { type: 'towers', L, n, ...clues, sol: grid.map(r => r.slice()) };
    },
    mount(b, p, x) {
      const { n } = p, g = Array(n * n).fill(0), live = false; let sel = -1, tries = triesFor(p.L);
      const cl = v => `<div class="pz-tc">${v || ''}</div>`;
      let html = '<div></div>' + p.top.map(cl).join('') + '<div></div>';
      for (let r = 0; r < n; r++) html += cl(p.left[r]) + range(n).map(c => `<button type="button" class="pz-sd pz-tw" data-i="${r * n + c}" aria-label="Vakje ${r + 1}, ${c + 1}"></button>`).join('') + cl(p.right[r]);
      html += '<div></div>' + p.bottom.map(cl).join('') + '<div></div>';
      b.innerHTML = `<p class="pz-intro">Elk vakje bevat een gebouw van <b>1 t/m ${n}</b> verdiepingen. In elke rij en kolom komt elke hoogte precies één keer voor. Het getal buiten het rooster is hoeveel gebouwen je ziet als je vanaf die kant naar binnen kijkt: een hoog gebouw verbergt alle lagere gebouwen erachter. Een leeg veld buiten het rooster betekent: onbekend.${live ? ' Dubbele cijfers worden rood.' : ''} Je kunt één keer bevestigen.</p>
        <div class="pz-twg" style="grid-template-columns:repeat(${n + 2},1fr)">${html}</div>
        <div class="pz-npad">${range(n).map(i => `<button type="button" data-n="${i + 1}">${i + 1}</button>`).join('')}<button type="button" data-n="0" aria-label="Wis">⌫</button></div>
        <button type="button" class="primary" id="pz-go">Bevestig</button>`;
      const btns = [...b.querySelectorAll('.pz-tw')], rowG = r => range(n).map(c => g[r * n + c]), colG = c => range(n).map(r => g[r * n + c]);
      const dupSet = () => { const bad = new Set(); for (let k = 0; k < n; k++) { [[rowG(k), i => k * n + i], [colG(k), i => i * n + k]].forEach(([line, idx]) => { line.forEach((v, i) => { if (v && line.indexOf(v) !== i) { bad.add(idx(i)); bad.add(idx(line.indexOf(v))); } }); }); } return bad; };
      const draw = () => { const bad = live ? dupSet() : new Set(); btns.forEach((e, i) => { e.textContent = g[i] || ''; e.classList.toggle('sel', sel === i); e.classList.toggle('bad', bad.has(i)); }); };
      btns.forEach((e, i) => { e.onclick = () => { if (!x.ended) { sel = i; draw(); } }; });
      b.querySelectorAll('.pz-npad button').forEach(e => { e.onclick = () => { if (x.ended || sel < 0) return; g[sel] = +e.dataset.n; draw(); }; });
      const valid = () => {
        if (g.some(v => !v) || dupSet().size) return false;
        for (let k = 0; k < n; k++) {
          const r = rowG(k), c = colG(k);
          if ((p.left[k] && seen(r) !== p.left[k]) || (p.right[k] && seen(r.slice().reverse()) !== p.right[k])) return false;
          if ((p.top[k] && seen(c) !== p.top[k]) || (p.bottom[k] && seen(c.slice().reverse()) !== p.bottom[k])) return false;
        }
        return true;
      };
      b.querySelector('#pz-go').onclick = () => {
        if (x.ended) return;
        if (g.some(v => !v)) return x.msg('Er zijn nog lege vakjes.');
        if (valid()) return x.end(true);
        if (--tries <= 0) return x.end(false);
        x.msg(''); draw();
      };
      draw();
    }
  };

  /* ---------- starten ---------- */

  /* ---------- uitleg (kort + voorbeeld) en oplossing per puzzel ---------- */
  const HELP = {
    wires: ['Je ziet een rijtje gekleurde draden en een lijstje regels. Loop de regels van boven naar beneden af; de eerste regel die klopt, zegt welke draad je moet doorknippen.', 'Regel: “Als er een rode draad is, knip de bovenste draad.” Is er een rode draad? Dan knip je de bovenste. Zo niet, ga je naar de volgende regel.'],
    simon: ['Er flitsen kleuren op. Druk ze daarna in dezelfde volgorde in. Elke ronde komt er één kleur bij.', 'Flits: ROOD, GROEN. Jij drukt: ROOD, GROEN.'],
    lights: ['Alle lampjes moeten uit. Tik je op een vakje, dan wisselt dat vakje en de vakjes er direct boven, onder, links en rechts van aan/uit.', 'Tik je op het midden van een rooster van 3×3, dan wisselen het midden en de vier buren.'],
    slide: ['Schuif de blokjes naar de lege plek tot de getallen op volgorde staan (1 linksboven, de lege plek rechtsonder).', 'Eindstand: 1 2 3 / 4 5 6 / 7 8 (leeg).'],
    wheels: ['Zoek een geheime code van verschillende cijfers. Elke aanwijzing laat een gok zien en hoeveel cijfers goed zijn (op de juiste plek of op een andere plek). Stel de wieltjes in op de code.', 'Aanwijzing “123: 1 goed op de juiste plek” betekent: precies één van de cijfers 1, 2, 3 staat op zijn plek in de code.'],
    shapes: ['Tik de vormen aan in de volgorde die de regel zegt, bijvoorbeeld van weinig naar veel hoeken.', 'Een driehoek (3 hoeken), een vierkant (4) en een vijfhoek (5): van weinig naar veel is driehoek, vierkant, vijfhoek.'],
    mastermind: ['Raad de geheime kleurcode. Na elke poging zie je ● (goede kleur op de goede plek) en ○ (goede kleur op een andere plek).', 'Code: rood, blauw, groen, geel. Jij gokt rood, groen, blauw, geel: dan zie je ●● ○○.'],
    memory: ['Draai twee kaartjes om. Zijn ze gelijk, dan blijven ze open. Vind alle paren.', 'Je draait ★ en ♥ om: niet gelijk, dus ze draaien weer terug. Onthoud waar ze liggen.'],
    binary: ['Elke schakelaar heeft een waarde (1, 2, 4, 8, 16 …). Zet schakelaars aan zodat de waarden samen precies het doelgetal vormen.', 'Doel 10: zet de schakelaars 8 en 2 aan (8 + 2 = 10).'],
    dial: ['Lees de bewegingen en de regels en draai de wijzer naar de eindrichting. R = één stap rechtsom, L = één stap linksom.', 'Start NOORD, bewegingen R, R: NOORD → OOST → ZUID. Eindrichting ZUID.'],
    hanoi: ['Verplaats de hele toren naar de rechter paal. Je verplaatst één schijf per keer en legt nooit een grotere schijf op een kleinere.', 'Met 2 schijven: kleine schijf naar het midden, grote naar rechts, kleine schijf weer naar rechts.'],
    keypad: ['Reken met de getallen op het scherm volgens de regels (serienummer, batterijen, lampje) en toets de uitkomst van 4 cijfers in.', 'Uitkomst 57? Dan toets je 0057.'],
    morse: ['De lamp knippert een woord in morsecode. Kort = punt, lang = streep. Typ het woord.', 'A = ·−   B = −···   S = ···   O = −−−   dus “SOS” is ··· −−− ···.'],
    switches: ['Volg de regels (tel schakelaars, batterijen en lampje) en zet de schakelaars in de juiste stand.', 'Staan er 2 schakelaars aan en heb je 3 batterijen, dan tel je 2 + 3 = 5 en kijk je of dat oneven is.'],
    sudoku: ['Vul het rooster zo in dat in elke rij, kolom en vak elk cijfer precies één keer staat.', 'In een rooster van 4×4 staan de cijfers 1 t/m 4. Staat in een rij al 1, 2 en 3, dan moet het lege vakje een 4 zijn.'],
    nonogram: ['De getallen bij een rij of kolom zeggen hoe lang de zwarte blokken zijn. Kleur vakjes zodat alle getallen kloppen.', 'Bij “3” in een rij van 5 zijn de middelste drie vakjes zeker zwart.'],
    einstein: ['Alle aanwijzingen zijn waar. Zoek uit welke persoon, kleur of dier bij welk huis hoort. Elke waarde hoort bij precies één huis.', '“De rode woont links van Anna” betekent: het rode huis staat verder naar links dan het huis van Anna.'],
    crypto: ['Elke letter is een cijfer (0 t/m 9) en verschillende letters zijn verschillende cijfers. Zoek de cijfers zodat de som klopt.', 'AB + B = CA. Probeer 19 + 9 = 28? Dat past niet, want de letters moeten kloppen. Zoek verder.'],
    towers: ['Elk vakje is een gebouw van 1 t/m N verdiepingen. In elke rij en kolom komt elke hoogte één keer voor. Het getal buiten het rooster is hoeveel gebouwen je vanaf die kant ziet; hoge gebouwen verbergen lage erachter.', 'Rij 1 2 3 4 vanaf links: je ziet 4 gebouwen. Rij 4 3 2 1 vanaf links: je ziet er maar 1.']
  };
  const SHAPE = { 3: 'driehoek', 4: 'vierkant', 5: 'vijfhoek', 6: 'zeshoek', 7: 'zevenhoek', 8: 'achthoek' };
  const grid2 = (a, w, f) => '<pre class="pz-sol">' + range(Math.ceil(a.length / w)).map(r => a.slice(r * w, r * w + w).map(f).join(' ')).join('\n') + '</pre>';
  function hanoiMoves(n, a, b, c, out) { if (!n) return out; hanoiMoves(n - 1, a, c, b, out); out.push(a + '→' + c); hanoiMoves(n - 1, b, a, c, out); return out; }
  function solution(p) {
    const t = p.type;
    if (t === 'wires') { const ans = wiresAnswer(p), r = p.rules.find(r => wcond(r.c, p)); return `Knip draad ${ans + 1} (${p.w[ans]}). ${r ? `De eerste regel die klopt is: “Als ${wct(r.c)}, ${wat(r.a)}.”` : `Geen enkele regel klopte, dus: ${wat(p.def)}.`}`; }
    if (t === 'simon') return 'De volgorde was: ' + p.seq.map(c => SC[(c + p.shift) % 4][0]).join(', ') + '.';
    if (t === 'lights') return `Tik op deze vakjes (rij, kolom): ${p.presses.map(i => `(${Math.floor(i / p.n) + 1}, ${i % p.n + 1})`).join(' ')}.`;
    if (t === 'slide') { const N = p.w * p.h; return 'Eindstand:' + grid2(range(N).map(i => (i + 1) % N), p.w, v => v || '·'); }
    if (t === 'wheels') return `De code was ${p.secret}.`;
    if (t === 'shapes') return 'Goede volgorde: ' + p.order.map(i => `${SHAPE[p.shapes[i].s]} (${p.shapes[i].c})`).join(', ') + '.';
    if (t === 'mastermind') return 'De geheime code was: ' + p.secret.map(v => MCOL[v][0]).join(', ') + '.';
    if (t === 'memory') return 'Zo lagen de kaartjes:' + grid2(p.cards, p.cols, v => v);
    if (t === 'binary') { const on = []; let r = p.target; for (let i = p.bits - 1; i >= 0; i--) if (r >= 2 ** i) { on.push(2 ** i); r -= 2 ** i; } return `Doel ${p.target}${p.expr ? ` (${p.expr})` : ''}. Zet deze schakelaars aan: ${on.join(' + ')}.`; }
    if (t === 'dial') return 'Eindrichting: ' + DIRS[dialAnswer(p)] + '.';
    if (t === 'hanoi') return `Kan in ${2 ** p.n - 1} zetten (paal 1 = links, 3 = rechts): ${hanoiMoves(p.n, 1, 2, 3, []).join(', ')}.`;
    if (t === 'keypad') return 'De code was ' + keypadAnswer(p) + '.';
    if (t === 'morse') return 'Het woord was ' + p.word + '.';
    if (t === 'switches') return 'Goede stand: ' + switchAnswer(p).map((v, i) => `${i + 1}: ${v ? 'AAN' : 'UIT'}`).join(', ') + '.';
    if (t === 'sudoku') return 'Ingevuld rooster:' + grid2(p.sol, p.n, v => v);
    if (t === 'nonogram') return 'Het plaatje (■ = zwart):' + grid2(p.sol.flat(), p.n, v => (v ? '■' : '·'));
    if (t === 'einstein') return range(p.n).map(h => `Huis ${h + 1}: ` + p.cats.map((c, ci) => c.vals[p.sol[ci].indexOf(h)]).join(', ')).join('<br>');
    if (t === 'crypto') return `${p.eq}<br>Letters: ${p.key}.`;
    if (t === 'towers') return 'Ingevuld rooster:' + grid2(p.sol.flat(), p.n, v => v);
    return '';
  }
  const helpOf = type => (HELP[type] ? { text: HELP[type][0], example: HELP[type][1] } : { text: '', example: '' });

  function run(root, p, onDone) {
    const def = T[p.type];
    if (!def) throw new Error('onbekende puzzel ' + p.type);
    root.innerHTML = `<div class="pz-name">${esc(def.name)}</div><div class="pz-body"></div><div class="pz-msg" aria-live="polite"></div><button type="button" class="ghost pz-giveup">Geef op</button>`;
    const body = root.querySelector('.pz-body'), msgEl = root.querySelector('.pz-msg');
    const x = {
      ended: false, msg: t => { msgEl.textContent = t; },
      end(ok) {
        if (x.ended) return; x.ended = true;
        root.querySelectorAll('button,input').forEach(e => { e.disabled = true; });
        msgEl.textContent = 'Puzzel afgerond…'; setTimeout(() => onDone(!!ok), 700 * sp());
      }
    };
    root.querySelector('.pz-giveup').onclick = () => x.end(false);
    def.mount(body, p, x);
    return x;
  }
  window.PZ = { types: Object.keys(T), make: (type, L) => T[type].make(Math.max(1, Math.min(3, L || 2))), run, lockData, clueText, solution, help: helpOf, names: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.name])) };
})();
